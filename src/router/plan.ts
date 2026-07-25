import type { ChatRequest, Message, Usage } from "../types.ts";
import type { Providers } from "../providers/index.ts";
import type { Config } from "../config.ts";
import type { RouteOutcome, StepTrace } from "./types.ts";
import { costUsd, estimateTokens } from "../cost.ts";
import { callModel } from "./single.ts";

// The strong model is asked to return ONLY this JSON shape.
// The [SWITCHBOARD_PLAN] marker also lets the keyless mock produce a demo plan.
const PLAN_SYSTEM =
  `You are a planner. Break the user's task into 2-5 concrete, ordered subtasks. ` +
  `Reply with ONLY a JSON object of the form {"steps":["subtask 1","subtask 2"]} and nothing else. ` +
  `[SWITCHBOARD_PLAN]`;

const EXEC_SYSTEM = "You are an executor. Do ONLY the given subtask, concisely and correctly.";
const SYNTH_SYSTEM = "Combine the step results into one clear, coherent final answer for the user.";

function lastUserContent(messages: Message[]): string {
  const u = [...messages].reverse().find((m) => m.role === "user");
  return u?.content ?? "";
}

/** Pull a {"steps":[...]} array out of the planner's reply; [] if it can't. */
function parsePlan(text: string): string[] {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const obj = JSON.parse(match ? match[0] : text);
    if (Array.isArray(obj.steps)) {
      return obj.steps.map((s: unknown) => String(s)).filter(Boolean).slice(0, 8);
    }
  } catch {
    // malformed / not JSON — caller falls back to a single step
  }
  return [];
}

/**
 * plan -> execute: the STRONG model writes a short plan (small output = cheap),
 * the CHEAP model executes each subtask (the bulk of the work), then a final
 * synthesis stitches the pieces together. Most tokens are spent on the cheap
 * model, so hard tasks get done for a fraction of the strong-only cost.
 */
export async function runPlan(
  providers: Providers,
  config: Config,
  req: ChatRequest,
): Promise<RouteOutcome> {
  const steps: StepTrace[] = [];
  const task = lastUserContent(req.messages);

  // 1. Plan with the strong model.
  const planMessages: Message[] = [{ role: "system", content: PLAN_SYSTEM }, ...req.messages];
  const planned = await callModel(providers, config.strongModel, planMessages, req, "plan: decompose");
  steps.push(planned.step);

  let subtasks = parsePlan(planned.content);
  if (subtasks.length === 0) subtasks = [task]; // fallback: treat whole task as one step

  // 2. Execute each subtask with the cheap model.
  const results: string[] = [];
  for (let i = 0; i < subtasks.length; i++) {
    const execMessages: Message[] = [
      { role: "system", content: EXEC_SYSTEM },
      { role: "user", content: `Overall task:\n${task}\n\nSubtask ${i + 1}: ${subtasks[i]}` },
    ];
    const ex = await callModel(providers, config.cheapModel, execMessages, req, `execute step ${i + 1}`);
    steps.push(ex.step);
    results.push(`Step ${i + 1} (${subtasks[i]}): ${ex.content}`);
  }

  // 3. Synthesize the final answer with the cheap model.
  const synthMessages: Message[] = [
    { role: "system", content: SYNTH_SYSTEM },
    { role: "user", content: `Task:\n${task}\n\nStep results:\n${results.join("\n")}` },
  ];
  const synth = await callModel(providers, config.cheapModel, synthMessages, req, "synthesize");
  steps.push(synth.step);

  // Cost + savings.
  const totalCostUsd = steps.reduce((s, x) => s + x.costUsd, 0);
  // Baseline = the strong model answering the ORIGINAL request in one shot: it reads
  // the user's messages and returns an answer of comparable length. Summing every
  // sub-step's usage would N-count the task context we re-inject into each execute/
  // synthesize call and overstate savings ~N×, so we price the single-shot equivalent.
  const originalPrompt = req.messages.map((m) => m.content).join("\n");
  const baselineUsage: Usage = {
    promptTokens: estimateTokens(originalPrompt),
    completionTokens: estimateTokens(synth.content),
  };
  const baselineCostUsd = costUsd(config.strongModel, baselineUsage);

  return {
    content: synth.content,
    actualModel: `${config.strongModel}+${config.cheapModel} (plan→exec, ${subtasks.length} steps)`,
    strategy: "plan",
    steps,
    totalCostUsd,
    baselineCostUsd,
    // Honest net (may be negative): plan overhead can exceed strong-alone on easy tasks.
    savedUsd: baselineCostUsd - totalCostUsd,
  };
}
