import type { Provider } from "./types.ts";
import { MockProvider } from "./mock.ts";
import { OpenAIProvider } from "./openai.ts";
import { AnthropicProvider } from "./anthropic.ts";
import { modelInfo } from "../registry.ts";
import type { Config } from "../config.ts";

/** Wires up the available provider backends from config. */
export class Providers {
  private byId = new Map<string, Provider>();

  constructor(config: Config) {
    this.byId.set("mock", new MockProvider());
    if (config.openaiKey) this.byId.set("openai", new OpenAIProvider(config.openaiKey));
    if (config.anthropicKey) this.byId.set("anthropic", new AnthropicProvider(config.anthropicKey));
  }

  /** Find the provider that serves a concrete model id. */
  forModel(modelId: string): Provider {
    const info = modelInfo(modelId);
    if (!info) throw new Error(`Unknown model "${modelId}". Add it to src/registry.ts.`);
    const p = this.byId.get(info.provider);
    if (!p) {
      throw new Error(
        `Provider "${info.provider}" is not configured (missing API key?). ` +
          `Model "${modelId}" cannot be used.`,
      );
    }
    return p;
  }
}
