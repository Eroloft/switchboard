// Switchboard eval harness.
//
// Always reports:
//   • routing accuracy — did easy prompts go cheap and hard prompts go strong?
//   • % cost saved      — vs running the strong model on everything (baseline)
//
// With EVAL_JUDGE=1 it also measures QUALITY RETENTION: for each case it gets a
// reference answer from the strong model and asks a judge model whether the
// router's answer is "as good as" the reference — the proof that we save money
// *without losing quality*.
//
// Run:  bun run eval
//       EVAL_STRATEGY=auto-cascade bun run eval
//       EVAL_JUDGE=1 EVAL_LIMIT=3 bun run eval        (needs a real judge model)

import { loadConfig } from "../config.ts";
import { Providers } from "../providers/index.ts";
import { route } from "../router/index.ts";
import { modelInfo } from "../registry.ts";
import { callModel } from "../router/single.ts";
import { DATASET } from "./dataset.ts";
import type { ChatRequest } from "../types.ts";

const strategy = process.env.EVAL_STRATEGY ?? "auto-classify";
const judgeMode = process.env.EVAL_JUDGE === "1";
const config = loadConfig();
const judgeModel = process.env.EVAL_JUDGE_MODEL ?? config.strongModel;
const limit = Number(process.env.EVAL_LIMIT ?? DATASET.length);
const cases = DATASET.slice(0, Math.max(1, limit));

const providers = new Providers(config);

function req(model: string, prompt: string): ChatRequest {
  return { model, messages: [{ role: "user", content: prompt }], temperature: 0 };
}

/** Ask the judge model whether `candidate` is as good as `reference`. */
async function judge(task: string, reference: string, candidate: string): Promise<boolean | null> {
  if (modelInfo(judgeModel)?.provider === "mock") return null; // a fake model can't judge
  const prompt =
    `Task:\n${task}\n\n` +
    `Reference answer (from the strong model):\n${reference}\n\n` +
    `Candidate answer (from the router):\n${candidate}\n\n` +
    `Is the candidate answer as good as the reference for this task? ` +
    `Reply with exactly one word: ACCEPTABLE or WORSE.`;
  const { content } = await callModel(providers, judgeModel, [{ role: "user", content: prompt }], req(judgeModel, prompt));
  const v = content.toUpperCase();
  if (v.includes("ACCEPTABLE")) return true;
  if (v.includes("WORSE")) return false;
  return null; // unclear
}

console.log(`\nSwitchboard eval — strategy: ${strategy}${judgeMode ? `  judge: ${judgeModel}` : ""}`);
console.log(`cheap=${config.cheapModel}  strong=${config.strongModel}  (${cases.length} cases)\n`);

let totalCost = 0;
let totalBaseline = 0;
let correct = 0;
let judged = 0;
let acceptable = 0;

for (const testCase of cases) {
  const out = await route(providers, config, req(strategy, testCase.prompt));

  const usedStrong = out.steps.some((s) => modelInfo(s.model)?.tier === "strong");
  const routedRight = usedStrong === testCase.expectHard;
  if (routedRight) correct++;
  totalCost += out.totalCostUsd;
  totalBaseline += out.baselineCostUsd;

  let quality = "";
  if (judgeMode) {
    const ref = await callModel(providers, config.strongModel, [{ role: "user", content: testCase.prompt }], req(config.strongModel, testCase.prompt));
    const verdict = await judge(testCase.prompt, ref.content, out.content);
    if (verdict !== null) {
      judged++;
      if (verdict) acceptable++;
      quality = verdict ? "  quality=OK" : "  quality=WORSE";
    } else {
      quality = "  quality=n/a";
    }
  }

  const mark = routedRight ? "OK  " : "MISS";
  console.log(
    `[${mark}] expect=${testCase.expectHard ? "hard" : "easy"} ` +
      `routed=${usedStrong ? "strong" : "cheap"}  $${out.totalCostUsd.toFixed(6)}${quality}  ` +
      testCase.prompt.slice(0, 44),
  );
}

const savedPct = totalBaseline > 0 ? Math.round((1 - totalCost / totalBaseline) * 100) : 0;
const accuracy = Math.round((correct / cases.length) * 100);

console.log(`\n--- summary (${cases.length} cases) ---`);
console.log(`routing accuracy: ${accuracy}%  (${correct}/${cases.length} sent to the right tier)`);
if (judgeMode) {
  if (judged > 0) {
    console.log(`quality retained: ${Math.round((acceptable / judged) * 100)}%  (${acceptable}/${judged} judged as good as strong-only)`);
  } else {
    console.log(`quality retained: n/a  (set EVAL_JUDGE_MODEL to a real model — a mock judge can't score)`);
  }
}
console.log(`cost:     $${totalCost.toFixed(6)}`);
console.log(`baseline: $${totalBaseline.toFixed(6)}  (strong model on everything)`);
console.log(`SAVED:    ${savedPct}%\n`);
