import type { Provider, ProviderCall, ProviderResult } from "./types.ts";
import { estimateTokens } from "../cost.ts";

/**
 * A fake provider so Switchboard runs with zero API keys.
 * It echoes a short answer and fakes token usage, letting you see routing,
 * cost math and savings without spending a cent.
 */
export class MockProvider implements Provider {
  readonly id = "mock";

  async complete(call: ProviderCall): Promise<ProviderResult> {
    const lastUser = [...call.messages].reverse().find((m) => m.role === "user");
    const prompt = call.messages.map((m) => m.content).join("\n");
    const strong = call.model.includes("strong");
    const answer = strong
      ? `[${call.model}] Detailed, verified answer to: "${lastUser?.content ?? ""}"`
      : `[${call.model}] Short answer to: "${lastUser?.content ?? ""}"`;

    // Fake a little latency so it feels real.
    await new Promise((r) => setTimeout(r, 30));

    return {
      content: answer,
      usage: {
        promptTokens: estimateTokens(prompt),
        completionTokens: estimateTokens(answer),
      },
    };
  }
}
