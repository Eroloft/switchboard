// Persistent per-request statistics using Bun's built-in SQLite.
// Powers cumulative reporting ("you saved $X / handled N tokens") for future
// billing / subscription / comparison views.
import { Database } from "bun:sqlite";

export interface RequestStat {
  ts: number; // unix seconds
  strategy: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  cheapTokens: number; // tokens handled by cheap-tier models
  strongTokens: number; // tokens handled by strong-tier models
  costUsd: number;
  baselineUsd: number; // cost if the strong model did everything alone
  savedUsd: number;
  steps: number;
}

export interface StrategyBreakdown {
  strategy: string;
  requests: number;
  cost_usd: number;
  baseline_usd: number;
  saved_usd: number;
}

export interface StatsSummary {
  requests: number;
  tokens: number;
  cheap_tokens: number;
  strong_tokens: number;
  cheap_token_pct: number;
  cost_usd: number;
  baseline_usd: number;
  saved_usd: number;
  saved_pct: number;
  by_strategy: StrategyBreakdown[];
}

export class Stats {
  private db: Database;

  constructor(path = "switchboard.db") {
    this.db = new Database(path);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        strategy TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL,
        completion_tokens INTEGER NOT NULL,
        cheap_tokens INTEGER NOT NULL,
        strong_tokens INTEGER NOT NULL,
        cost_usd REAL NOT NULL,
        baseline_usd REAL NOT NULL,
        saved_usd REAL NOT NULL,
        steps INTEGER NOT NULL
      )
    `);
  }

  record(s: RequestStat): void {
    this.db
      .query(
        `INSERT INTO requests
           (ts, strategy, model, prompt_tokens, completion_tokens,
            cheap_tokens, strong_tokens, cost_usd, baseline_usd, saved_usd, steps)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        s.ts,
        s.strategy,
        s.model,
        s.promptTokens,
        s.completionTokens,
        s.cheapTokens,
        s.strongTokens,
        s.costUsd,
        s.baselineUsd,
        s.savedUsd,
        s.steps,
      );
  }

  /** Cumulative totals since a given unix timestamp (0 = all time). */
  summary(sinceTs = 0): StatsSummary {
    const total = this.db
      .query(
        `SELECT
           COUNT(*)                                          AS requests,
           COALESCE(SUM(prompt_tokens + completion_tokens),0) AS tokens,
           COALESCE(SUM(cheap_tokens),0)                     AS cheap_tokens,
           COALESCE(SUM(strong_tokens),0)                    AS strong_tokens,
           COALESCE(SUM(cost_usd),0)                         AS cost_usd,
           COALESCE(SUM(baseline_usd),0)                     AS baseline_usd,
           COALESCE(SUM(saved_usd),0)                        AS saved_usd
         FROM requests WHERE ts >= ?`,
      )
      .get(sinceTs) as any;

    const byStrategy = this.db
      .query(
        `SELECT
           strategy,
           COUNT(*)                       AS requests,
           COALESCE(SUM(cost_usd),0)      AS cost_usd,
           COALESCE(SUM(baseline_usd),0)  AS baseline_usd,
           COALESCE(SUM(saved_usd),0)     AS saved_usd
         FROM requests WHERE ts >= ?
         GROUP BY strategy
         ORDER BY saved_usd DESC`,
      )
      .all(sinceTs) as StrategyBreakdown[];

    const tierTokens = total.cheap_tokens + total.strong_tokens;
    return {
      requests: total.requests,
      tokens: total.tokens,
      cheap_tokens: total.cheap_tokens,
      strong_tokens: total.strong_tokens,
      cheap_token_pct: tierTokens > 0 ? Math.round((total.cheap_tokens / tierTokens) * 100) : 0,
      cost_usd: total.cost_usd,
      baseline_usd: total.baseline_usd,
      saved_usd: total.saved_usd,
      saved_pct: total.baseline_usd > 0 ? Math.round((total.saved_usd / total.baseline_usd) * 100) : 0,
      by_strategy: byStrategy,
    };
  }
}
