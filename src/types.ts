// Core internal types used across Switchboard.
// The gateway speaks OpenAI/Anthropic on the edges but works with these inside.

export type Role = "system" | "user" | "assistant" | "tool";

export interface Message {
  role: Role;
  content: string;
}

/** A normalized chat request coming from any client (OpenAI / Anthropic). */
export interface ChatRequest {
  /**
   * Virtual model or strategy name requested by the client
   * (e.g. "auto-cascade") OR a concrete model id (e.g. "gpt-4o-mini").
   */
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
}
