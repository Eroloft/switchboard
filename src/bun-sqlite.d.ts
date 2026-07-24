// Minimal ambient types for Bun's built-in SQLite so a plain `tsc` is happy.
// (Full types come from the `bun-types` package; we only declare what we use.)
declare module "bun:sqlite" {
  interface Statement {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }
  export class Database {
    constructor(path?: string, options?: unknown);
    run(sql: string, ...params: unknown[]): void;
    query(sql: string): Statement;
  }
}
