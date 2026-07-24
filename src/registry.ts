// Model catalog + prices. Prices are EXAMPLES — edit them for your account/region.
// The structure matters more than the exact numbers for the MVP.

export type Tier = "cheap" | "strong";

export interface ModelInfo {
  /** concrete model id, e.g. "gpt-4o-mini" */
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

  // --- Real models (verify pricing before trusting the $ numbers) ---
  "gpt-4o-mini": { id: "gpt-4o-mini", provider: "openai", tier: "cheap", inputPerM: 0.15, outputPerM: 0.6 },
  "gpt-4o": { id: "gpt-4o", provider: "openai", tier: "strong", inputPerM: 2.5, outputPerM: 10.0 },

  // Anthropic prices below are PLACEHOLDERS — TODO: confirm current pricing.
  "claude-haiku-4-5-20251001": {
    id: "claude-haiku-4-5-20251001", provider: "anthropic", tier: "cheap", inputPerM: 1.0, outputPerM: 5.0,
  },
  "claude-opus-4-8": {
    id: "claude-opus-4-8", provider: "anthropic", tier: "strong", inputPerM: 15.0, outputPerM: 75.0,
  },
};

export function modelInfo(id: string): ModelInfo | undefined {
  return MODELS[id];
}
