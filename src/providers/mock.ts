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
    const prompt = call.messages.map((m) => m.content).join("\n");

    // Fake a little latency so it feels real.
    await new Promise((r) => setTimeout(r, 30));

    // When asked to plan (the auto-plan strategy), return a small demo JSON plan
    // so the keyless demo shows a real multi-step plan -> execute flow.
    if (prompt.includes("[SWITCHBOARD_PLAN]")) {
      const plan = JSON.stringify({
        steps: [
          "Define the concept in one plain sentence",
          "Give a simple everyday analogy",
          "Show one tiny concrete example",
        ],
      });
      return {
        content: plan,
        usage: { promptTokens: estimateTokens(prompt), completionTokens: estimateTokens(plan) },
      };
    }

    const lastUser = [...call.messages].reverse().find((m) => m.role === "user");
    const strong = call.model.includes("strong");
    const answer = strong
      ? `[${call.model}] Detailed, verified answer to: "${lastUser?.content ?? ""}"`
      : `[${call.model}] Short answer to: "${lastUser?.content ?? ""}"`;

    return {
      content: answer,
      usage: {
        promptTokens: estimateTokens(prompt),
        completionTokens: estimateTokens(answer),
      },
    };
  }
}
