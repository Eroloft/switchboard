import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { loadConfig } from "./config.ts";
import { Providers } from "./providers/index.ts";
import { route } from "./router/index.ts";
import { modelInfo } from "./registry.ts";
import { Stats } from "./stats.ts";
import type { ChatRequest, Message } from "./types.ts";

const config = loadConfig();
const providers = new Providers(config);
const stats = new Stats(config.statsDbPath);
const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok", service: "switchboard" }));

// Cumulative savings across all requests — powers subscription / comparison views.
// Optional ?since=<unix-seconds> to window the totals.
app.get("/stats", (c) => {
  const since = Number(c.req.query("since") ?? 0);
  return c.json(stats.summary(Number.isFinite(since) ? since : 0));
});

// OpenAI-compatible endpoint — this is what Codex / Cursor / Aider talk to.
app.post("/v1/chat/completions", async (c) => {
  const body = (await c.req.json()) as any;

  const req: ChatRequest = {
    model: body.model ?? "auto-cascade",
    messages: (body.messages ?? []).map(
      (m: any): Message => ({
        role: m.role,
        content:
          typeof m.content === "string"
            ? m.content
            : (m.content ?? []).map((p: any) => p.text ?? "").join(""),
      }),
    ),
    temperature: body.temperature,
    maxTokens: body.max_tokens,
    stream: body.stream,
  };

  try {
    const out = await route(providers, config, req);
    const savedPct =
      out.baselineCostUsd > 0 ? Math.round((out.savedUsd / out.baselineCostUsd) * 100) : 0;

    console.log(
      `[switchboard] strategy=${out.strategy} model=${out.actualModel} ` +
        `cost=$${out.totalCostUsd.toFixed(6)} baseline=$${out.baselineCostUsd.toFixed(6)} ` +
        `saved=$${out.savedUsd.toFixed(6)} (${savedPct}%)`,
    );

    const promptTokens = out.steps.reduce((s, x) => s + x.usage.promptTokens, 0);
    const completionTokens = out.steps.reduce((s, x) => s + x.usage.completionTokens, 0);

    // Split tokens by tier so we can report "% handled by cheap models".
    let cheapTokens = 0;
    let strongTokens = 0;
    for (const s of out.steps) {
      const t = s.usage.promptTokens + s.usage.completionTokens;
      if (modelInfo(s.model)?.tier === "strong") strongTokens += t;
      else cheapTokens += t;
    }

    stats.record({
      ts: Math.floor(Date.now() / 1000),
      strategy: out.strategy,
      model: out.actualModel,
      promptTokens,
      completionTokens,
      cheapTokens,
      strongTokens,
      costUsd: out.totalCostUsd,
      baselineUsd: out.baselineCostUsd,
      savedUsd: out.savedUsd,
      steps: out.steps.length,
    });

    // Streaming clients (Cursor, Codex, many SDKs) expect Server-Sent Events.
    // MVP: we run the strategy to completion, then emit the result as valid
    // OpenAI-style SSE chunks so those clients work without breaking.
    if (req.stream) {
      const id = `chatcmpl-sb-${Date.now()}`;
      const created = Math.floor(Date.now() / 1000);
      const chunk = (delta: object, finish: string | null) =>
        JSON.stringify({
          id,
          object: "chat.completion.chunk",
          created,
          model: out.actualModel,
          choices: [{ index: 0, delta, finish_reason: finish }],
        });
      return streamSSE(c, async (sse) => {
        await sse.writeSSE({ data: chunk({ role: "assistant" }, null) });
        await sse.writeSSE({ data: chunk({ content: out.content }, null) });
        await sse.writeSSE({ data: chunk({}, "stop") });
        await sse.writeSSE({ data: "[DONE]" });
      });
    }

    return c.json({
      id: `chatcmpl-sb-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: out.actualModel,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: out.content },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
      // Switchboard's own report: what it did and how much it saved.
      switchboard: {
        strategy: out.strategy,
        steps: out.steps,
        cost_usd: out.totalCostUsd,
        baseline_usd: out.baselineCostUsd,
        saved_usd: out.savedUsd,
        saved_pct: savedPct,
      },
    });
  } catch (err: any) {
    return c.json({ error: { message: String(err?.message ?? err) } }, 500);
  }
});

console.log(`switchboard listening on http://localhost:${config.port}`);
console.log(`  cheap model:  ${config.cheapModel}`);
console.log(`  strong model: ${config.strongModel}`);
console.log(`  stats db:     ${config.statsDbPath}`);

export default { port: config.port, fetch: app.fetch };
