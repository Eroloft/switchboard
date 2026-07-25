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
  // Usage the strong model would spend answering alone. Without escalation we proxy
  // it from the cheap step; with escalation the strong step ran the SAME messages,
  // so its real usage is the true strong-alone cost.
  let strongAloneUsage = cheap.step.usage;

  if (looksLowConfidence(cheap.content)) {
    const strong = await callModel(providers, config.strongModel, req.messages, req, "cascade: escalated");
    steps.push(strong.step);
    content = strong.content;
    actualModel = config.strongModel;
    strongAloneUsage = strong.step.usage;
  }

  const totalCostUsd = steps.reduce((s, x) => s + x.costUsd, 0);
  const baselineCostUsd = costUsd(config.strongModel, strongAloneUsage);

  return {
    content,
    actualModel,
    strategy: "cascade",
    steps,
    totalCostUsd,
    baselineCostUsd,
    // Honest net (may be negative): when a shaky cheap answer forced escalation we
    // paid the wasted cheap call ON TOP of strong-alone, so cumulative /stats no
    // longer overstates savings by hiding the loss behind Math.max(0, …).
    savedUsd: baselineCostUsd - totalCostUsd,
  };
}
