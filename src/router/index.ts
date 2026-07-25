import type { ChatRequest } from "../types.ts";
import type { Providers } from "../providers/index.ts";
import type { Config } from "../config.ts";
import type { RouteOutcome } from "./types.ts";
import { modelInfo } from "../registry.ts";
import { callModel } from "./single.ts";
import { runCascade } from "./cascade.ts";
import { runPlan } from "./plan.ts";
import { runClassify } from "./classify.ts";

/**
 * Entry point: look at the requested "model" name and pick a behavior.
 *   - "auto-cascade" / "auto" -> cheap-first, escalate if shaky
 *   - a concrete model id     -> just call that model (pass-through)
 *
 * Coming next: "auto-classify" (judge difficulty) and "auto-plan" (plan -> execute).
 */
export async function route(
  providers: Providers,
  config: Config,
  req: ChatRequest,
): Promise<RouteOutcome> {
  const name = req.model;

  if (name === "auto-cascade" || name === "auto") {
    return runCascade(providers, config, req);
  }

  if (name === "auto-plan") {
    return runPlan(providers, config, req);
  }

  if (name === "auto-classify") {
    return runClassify(providers, config, req);
  }

  // Concrete model pass-through.
  if (modelInfo(name)) {
    const { content, step } = await callModel(providers, name, req.messages, req, "direct");
    return {
      content,
      actualModel: name,
      strategy: "passthrough",
      steps: [step],
      totalCostUsd: step.costUsd,
      baselineCostUsd: step.costUsd,
      savedUsd: 0,
    };
  }

  throw new Error(`Unknown model/strategy "${name}". Try "auto-cascade" or a known model id.`);
}
