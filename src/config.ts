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
}

export function loadConfig(): Config {
  const env = process.env;
  const hasAnthropic = Boolean(env.ANTHROPIC_API_KEY);
  const hasOpenAI = Boolean(env.OPENAI_API_KEY);
  const useLocal = env.LOCAL === "1" || env.USE_LOCAL === "1";

  // Pick sensible default cheap/strong models.
  // Priority: explicit LOCAL mode -> Anthropic key -> OpenAI key -> keyless mock.
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

  return {
    port: Number(env.PORT ?? 4000),
    openaiKey: env.OPENAI_API_KEY,
    anthropicKey: env.ANTHROPIC_API_KEY,
    ollamaBaseUrl: env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    cheapModel: env.CHEAP_MODEL ?? cheapDefault,
    strongModel: env.STRONG_MODEL ?? strongDefault,
    statsDbPath: env.STATS_DB ?? "switchboard.db",
  };
}
