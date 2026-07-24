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
  const hasKeys = Boolean(env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY);
  return {
    port: Number(env.PORT ?? 4000),
    openaiKey: env.OPENAI_API_KEY,
    anthropicKey: env.ANTHROPIC_API_KEY,
    // Default to the keyless mock models so `bun start` works out of the box.
    cheapModel: env.CHEAP_MODEL ?? (hasKeys ? "gpt-4o-mini" : "mock-cheap"),
    strongModel: env.STRONG_MODEL ?? (hasKeys ? "gpt-4o" : "mock-strong"),
    statsDbPath: env.STATS_DB ?? "switchboard.db",
  };
}
