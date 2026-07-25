import type { Provider, ProviderCall, ProviderResult } from "./types.ts";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/** Calls the real Anthropic Messages API. Needs ANTHROPIC_API_KEY. */
export class AnthropicProvider implements Provider {
  readonly id = "anthropic";
  constructor(private apiKey: string, private baseUrl: string = ANTHROPIC_URL) {}

  async complete(call: ProviderCall): Promise<ProviderResult> {
    // Anthropic wants the system prompt separate from the message list.
    const system = call.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");

    const msgs = call.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }));

    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      // Don't let a stalled cloud connection hang the whole cascade/plan chain.
      signal: AbortSignal.timeout(120_000),
      body: JSON.stringify({
        model: call.model,
        system: system || undefined,
        messages: msgs,
        max_tokens: call.maxTokens ?? 1024,
        temperature: call.temperature,
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as any;
    const content = Array.isArray(data.content)
      ? data.content.map((b: any) => b.text ?? "").join("")
      : "";

    return {
      content,
      usage: {
        promptTokens: data.usage?.input_tokens ?? 0,
        completionTokens: data.usage?.output_tokens ?? 0,
      },
    };
  }
}
