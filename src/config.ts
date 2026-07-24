export interface Config {
  port: number;
  openaiKey?: string;
  anthropicKey?: string;
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

  // Pick sensible default cheap/strong models based on which keys are present.
  // Anthropic is preferred when available; otherwise OpenAI; otherwise mock.
  let cheapDefault = "mock-cheap";
  let strongDefault = "mock-strong";
  if (hasAnthropic) {
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
    cheapModel: env.CHEAP_MODEL ?? cheapDefault,
    strongModel: env.STRONG_MODEL ?? strongDefault,
    statsDbPath: env.STATS_DB ?? "switchboard.db",
  };
}
