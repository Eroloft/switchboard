import type { Provider, ProviderCall, ProviderResult } from "./types.ts";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

/** Calls the real OpenAI Chat Completions API. Needs OPENAI_API_KEY. */
export class OpenAIProvider implements Provider {
  readonly id = "openai";
  constructor(private apiKey: string, private baseUrl: string = OPENAI_URL) {}

  async complete(call: ProviderCall): Promise<ProviderResult> {
    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: call.model,
        messages: call.messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: call.temperature,
        max_tokens: call.maxTokens,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as any;
    return {
      content: data.choices?.[0]?.message?.content ?? "",
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }
}
