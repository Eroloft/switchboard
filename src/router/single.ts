import type { ChatRequest, Message } from "../types.ts";
import type { Providers } from "../providers/index.ts";
import type { StepTrace } from "./types.ts";
import { costUsd } from "../cost.ts";

/** Call one concrete model and package the result + a cost step. */
export async function callModel(
  providers: Providers,
  modelId: string,
  messages: Message[],
  req: ChatRequest,
  note?: string,
): Promise<{ content: string; step: StepTrace }> {
  const provider = providers.forModel(modelId);
  const result = await provider.complete({
    model: modelId,
    messages,
    temperature: req.temperature,
    maxTokens: req.maxTokens,
  });

  const step: StepTrace = {
    model: modelId,
    usage: result.usage,
    costUsd: costUsd(modelId, result.usage),
    note,
  };
  return { content: result.content, step };
}
