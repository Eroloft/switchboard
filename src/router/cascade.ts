import type { ChatRequest } from "../types.ts";
import type { Providers } from "../providers/index.ts";
import type { Config } from "../config.ts";
import type { RouteOutcome, StepTrace } from "./types.ts";
import { costUsd } from "../cost.ts";
import { callModel } from "./single.ts";
import { looksLowConfidence } from "./confidence.ts";

/**
 * Cascade: try the cheap model first. If its answer looks shaky, escalate to
 * the strong model. Most easy questions stop at the cheap step = big savings.
 */
export async function runCascade(
  providers: Providers,
  config: Config,
  req: ChatRequest,
): Promise<RouteOutcome> {
  const steps: StepTrace[] = [];

  const cheap = await callModel(providers, config.cheapModel, req.messages, req, "cascade: cheap attempt");
  steps.push(cheap.step);

  let content = cheap.content;
  let actualModel = config.cheapModel;

  if (looksLowConfidence(cheap.content)) {
    const strong = await callModel(providers, config.strongModel, req.messages, req, "cascade: escalated");
    steps.push(strong.step);
    content = strong.content;
    actualModel = config.strongModel;
  }

  const totalCostUsd = steps.reduce((s, x) => s + x.costUsd, 0);
  // Baseline = the strong model doing the same work alone
  // (we reuse the cheap step's token counts as a proxy for the prompt size).
  const baselineCostUsd = costUsd(config.strongModel, cheap.step.usage);

  return {
    content,
    actualModel,
    strategy: "cascade",
    steps,
    totalCostUsd,
    baselineCostUsd,
    savedUsd: Math.max(0, baselineCostUsd - totalCostUsd),
  };
}
