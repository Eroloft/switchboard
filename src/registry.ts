// Model catalog + prices (USD per 1M tokens).
//
// Anthropic prices verified 2026-06-24 via the claude-api reference.
// OpenAI prices verified 2026 (gpt-4o / gpt-4o-mini).
// Always confirm current pricing for your own account/region before trusting
// the dollar numbers — providers change prices and offer intro/volume discounts.

export type Tier = "cheap" | "strong";

export interface ModelInfo {
  /** concrete model id, e.g. "claude-haiku-4-5" */
  id: string;
  /** which provider serves it: "mock" | "openai" | "anthropic" */
  provider: string;
  tier: Tier;
  /** USD per 1M input tokens */
  inputPerM: number;
  /** USD per 1M output tokens */
  outputPerM: number;
}

export const MODELS: Record<string, ModelInfo> = {
  // --- Fake models for the keyless demo ---
  "mock-cheap": { id: "mock-cheap", provider: "mock", tier: "cheap", inputPerM: 0.1, outputPerM: 0.4 },
  "mock-strong": { id: "mock-strong", provider: "mock", tier: "strong", inputPerM: 3.0, outputPerM: 15.0 },

  // --- OpenAI ---
  "gpt-4o-mini": { id: "gpt-4o-mini", provider: "openai", tier: "cheap", inputPerM: 0.15, outputPerM: 0.6 },
  "gpt-4o": { id: "gpt-4o", provider: "openai", tier: "strong", inputPerM: 2.5, outputPerM: 10.0 },

  // --- Anthropic (Claude) ---
  "claude-haiku-4-5": { id: "claude-haiku-4-5", provider: "anthropic", tier: "cheap", inputPerM: 1.0, outputPerM: 5.0 },
  "claude-sonnet-5": { id: "claude-sonnet-5", provider: "anthropic", tier: "strong", inputPerM: 3.0, outputPerM: 15.0 },
  "claude-opus-4-8": { id: "claude-opus-4-8", provider: "anthropic", tier: "strong", inputPerM: 5.0, outputPerM: 25.0 },
  "claude-fable-5": { id: "claude-fable-5", provider: "anthropic", tier: "strong", inputPerM: 10.0, outputPerM: 50.0 },

  // --- Local models via Ollama (free — $0, runs on your machine) ---
  // Great "cheap" tier: offloads easy work so you don't burn API $ or a Claude subscription limit.
  "qwen3.5:2b": { id: "qwen3.5:2b", provider: "ollama", tier: "cheap", inputPerM: 0, outputPerM: 0 },
  "dolphin-mistral": { id: "dolphin-mistral", provider: "ollama", tier: "cheap", inputPerM: 0, outputPerM: 0 },
  "qwen2.5-coder:7b": { id: "qwen2.5-coder:7b", provider: "ollama", tier: "strong", inputPerM: 0, outputPerM: 0 },
};

export function modelInfo(id: string): ModelInfo | undefined {
  return MODELS[id];
}
