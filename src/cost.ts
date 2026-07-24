import type { Usage } from "./types.ts";
import { modelInfo } from "./registry.ts";

/** Very rough token estimate (~4 chars per token). Good enough for mock + logging. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Cost in USD for a given model + usage, using the price table. */
export function costUsd(modelId: string, usage: Usage): number {
  const info = modelInfo(modelId);
  if (!info) return 0;
  return (
    (usage.promptTokens / 1_000_000) * info.inputPerM +
    (usage.completionTokens / 1_000_000) * info.outputPerM
  );
}
