import type { Provider, ProviderCall, ProviderResult } from "./types.ts";

/**
 * Calls a local Ollama server (default http://localhost:11434).
 * Free and private — nothing leaves your machine, and it never touches a
 * cloud API key or a Claude subscription limit. Perfect as the "cheap" tier.
 */
export class OllamaProvider implements Provider {
  readonly id = "ollama";
  constructor(private baseUrl: string = "http://localhost:11434") {}

  async complete(call: ProviderCall): Promise<ProviderResult> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: call.model,
        messages: call.messages.map((m) => ({ role: m.role, content: m.content })),
        stream: false,
        options: call.temperature != null ? { temperature: call.temperature } : undefined,
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as any;
    return {
      content: data.message?.content ?? "",
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
      },
    };
  }
}
