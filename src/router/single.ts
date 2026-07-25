import type { ChatRequest, Message } from "../types.ts";
import type { Providers } from "../providers/index.ts";
import type { StepTrace } from "./types.ts";
import { costUsd } from "../cost.ts";
import { MODELS, modelInfo } from "../registry.ts";

/**
 * Ordered list of models to try for a request: the requested model first,
 * then same-tier models from OTHER configured providers as fallbacks.
 * (mock is never used as a silent fallback.)
 */
function candidatesFor(modelId: string, providers: Providers): string[] {
  const list = [modelId];
  const tier = modelInfo(modelId)?.tier;
  if (!tier) return list;

  for (const id of Object.keys(MODELS)) {
    if (id === modelId) continue;
    const info = MODELS[id];
    if (info.tier !== tier) continue;
    if (info.provider === "mock") continue; // don't answer with a fake model
    if (!providers.has(info.provider)) continue; // provider not configured
    list.push(id);
  }
  return list;
}

/**
 * Call a model with automatic fallback: if the requested model errors (auth,
 * rate-limit, provider down), transparently retry on a same-tier model from
 * another configured provider. The returned step records which model actually
 * answered, so cost and stats stay accurate.
 */
export async function callModel(
  providers: Providers,
  modelId: string,
  messages: Message[],
  req: ChatRequest,
  note?: string,
): Promise<{ content: string; step: StepTrace }> {
  const candidates = candidatesFor(modelId, providers);
  let lastError: unknown;

  for (let i = 0; i < candidates.length; i++) {
    const id = candidates[i];
    try {
      const provider = providers.forModel(id);
      const result = await provider.complete({
        model: id,
        messages,
        temperature: req.temperature,
        maxTokens: req.maxTokens,
      });

      const fellBack = i > 0;
      const step: StepTrace = {
        model: id,
        usage: result.usage,
        costUsd: costUsd(id, result.usage),
        note: fellBack ? `${note ? note + " " : ""}[fallback from ${modelId}]` : note,
      };
      return { content: result.content, step };
    } catch (err) {
      lastError = err;
      console.warn(
        `[switchboard] model "${id}" failed, trying next: ${String((err as any)?.message ?? err)}`,
      );
    }
  }

  throw new Error(
    `All candidates failed for "${modelId}" (${candidates.join(", ")}): ` +
      String((lastError as any)?.message ?? lastError),
  );
}
