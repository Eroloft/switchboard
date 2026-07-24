import type { Message, Usage } from "../types.ts";

export interface ProviderCall {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
}

export interface ProviderResult {
  content: string;
  usage: Usage;
}

/** A backend that can run a concrete model (OpenAI, Anthropic, a mock, ...). */
export interface Provider {
  readonly id: string;
  complete(call: ProviderCall): Promise<ProviderResult>;
}
