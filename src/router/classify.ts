import type { ChatRequest, Message } from "../types.ts";
import type { Providers } from "../providers/index.ts";
import type { Config } from "../config.ts";
import type { RouteOutcome } from "./types.ts";
import { costUsd } from "../cost.ts";
import { callModel } from "./single.ts";

// Words that suggest a HARD task (route to the strong model).
const HARD_MARKERS = [
  "architecture", "design", "refactor", "debug", "why", "prove", "optimize",
  "algorithm", "concurrency", "security", "race condition", "performance",
  "trade-off", "tradeoff", "explain how", "root cause", "edge case", "migrate",
];

// Words that suggest an EASY task (the cheap model is enough).
const EASY_MARKERS = [
  "hello", "hi ", "translate", "rename", "typo", "format", "what is",
  "define", "summarize", "capital of", "spelling", "list the",
];

export interface Difficulty {
  score: number; // 0..1, higher = harder
  hard: boolean;
  reasons: string[];
}

/**
 * A fast, free heuristic that estimates how hard a prompt is.
 * (Deterministic and zero-cost; a cheap-model or trained classifier can be
 * swapped in later for more accuracy.)
 */
export function classify(text: string): Difficulty {
  const t = text.toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  const len = text.length;
  if (len > 800) {
    score += 0.4;
    reasons.push("long prompt");
  } else if (len > 300) {
    score += 0.2;
    reasons.push("medium length");
  }

  if (/```|function |class |def |=>|import /.test(text)) {
    score += 0.25;
    reasons.push("contains code");
  }

  const hardHits = HARD_MARKERS.filter((m) => t.includes(m));
  if (hardHits.length) {
    score += Math.min(0.5, hardHits.length * 0.2);
    reasons.push(`hard signals: ${hardHits.slice(0, 3).join(", ")}`);
  }

  const easyHits = EASY_MARKERS.filter((m) => t.includes(m));
  if (easyHits.length) {
    score -= 0.25;
    reasons.push(`easy signals: ${easyHits.slice(0, 3).join(", ")}`);
  }

  score = Math.max(0, Math.min(1, score));
  return { score, hard: score >= 0.4, reasons: reasons.length ? reasons : ["no strong signals"] };
}

function lastUserContent(messages: Message[]): string {
  return [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
}

/**
 * classify: judge difficulty in one pass, then send the request to the cheap
 * or strong model accordingly. No escalation, no extra round-trips — the
 * cheapest way to route when you trust the difficulty signal.
 */
export async function runClassify(
  providers: Providers,
  config: Config,
  req: ChatRequest,
): Promise<RouteOutcome> {
  const d = classify(lastUserContent(req.messages));
  const model = d.hard ? config.strongModel : config.cheapModel;

  const { content, step } = await callModel(
    providers,
    model,
    req.messages,
    req,
    `classify -> ${d.hard ? "hard" : "easy"} (score ${d.score.toFixed(2)}: ${d.reasons.join("; ")})`,
  );

  const baselineCostUsd = costUsd(config.strongModel, step.usage);
  return {
    content,
    actualModel: model,
    strategy: "classify",
    steps: [step],
    totalCostUsd: step.costUsd,
    baselineCostUsd,
    savedUsd: Math.max(0, baselineCostUsd - step.costUsd),
  };
}
