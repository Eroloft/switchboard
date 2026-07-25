import { existsSync, readFileSync } from "node:fs";
import { registerModel, type Tier } from "./registry.ts";

export interface Config {
  port: number;
  openaiKey?: string;
  anthropicKey?: string;
  /** base URL of a local Ollama server (free local models) */
  ollamaBaseUrl: string;
  /** concrete cheap/strong models the strategies use */
  cheapModel: string;
  strongModel: string;
  /** path to the SQLite file that stores cumulative stats */
  statsDbPath: string;
  /** difficulty >= this routes to the strong model (auto-classify) */
  classifyThreshold: number;
}

interface FileModel {
  provider: string;
  tier: Tier;
  inputPerM: number;
  outputPerM: number;
}

interface FileConfig {
  port?: number;
  cheapModel?: string;
  strongModel?: string;
  ollamaBaseUrl?: string;
  statsDbPath?: string;
  classifyThreshold?: number;
  /** extra models to add to (or override in) the registry */
  models?: Record<string, FileModel>;
}

/** Read an optional switchboard.config.json (path overridable via SWITCHBOARD_CONFIG). */
function loadFile(): FileConfig {
  const path = process.env.SWITCHBOARD_CONFIG ?? "switchboard.config.json";
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as FileConfig;
  } catch (err: any) {
    console.warn(`[switchboard] ignoring bad config file "${path}": ${String(err?.message ?? err)}`);
    return {};
  }
}

export function loadConfig(): Config {
  const env = process.env;
  const file = loadFile();

  // Register any custom models declared in the config file.
  if (file.models) {
    for (const [id, m] of Object.entries(file.models)) {
      registerModel({ id, provider: m.provider, tier: m.tier, inputPerM: m.inputPerM, outputPerM: m.outputPerM });
    }
  }

  const hasAnthropic = Boolean(env.ANTHROPIC_API_KEY);
  const hasOpenAI = Boolean(env.OPENAI_API_KEY);
  const useLocal = env.LOCAL === "1" || env.USE_LOCAL === "1";

  // Default cheap/strong pair based on what's available.
  let cheapDefault = "mock-cheap";
  let strongDefault = "mock-strong";
  if (useLocal) {
    cheapDefault = "qwen3.5:2b";
    strongDefault = "qwen2.5-coder:7b";
  } else if (hasAnthropic) {
    cheapDefault = "claude-haiku-4-5";
    strongDefault = "claude-opus-4-8";
  } else if (hasOpenAI) {
    cheapDefault = "gpt-4o-mini";
    strongDefault = "gpt-4o";
  }

  // Precedence: environment variable > config file > computed default.
  return {
    port: Number(env.PORT ?? file.port ?? 4000),
    openaiKey: env.OPENAI_API_KEY,
    anthropicKey: env.ANTHROPIC_API_KEY,
    ollamaBaseUrl: env.OLLAMA_BASE_URL ?? file.ollamaBaseUrl ?? "http://localhost:11434",
    cheapModel: env.CHEAP_MODEL ?? file.cheapModel ?? cheapDefault,
    strongModel: env.STRONG_MODEL ?? file.strongModel ?? strongDefault,
    statsDbPath: env.STATS_DB ?? file.statsDbPath ?? "switchboard.db",
    classifyThreshold: Number(env.CLASSIFY_THRESHOLD ?? file.classifyThreshold ?? 0.4),
  };
}
