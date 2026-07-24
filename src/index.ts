import { Hono } from "hono";
import { loadConfig } from "./config.ts";
import { Providers } from "./providers/index.ts";
import { route } from "./router/index.ts";
import type { ChatRequest, Message } from "./types.ts";

const config = loadConfig();
const providers = new Providers(config);
const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok", service: "switchboard" }));

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

export default { port: config.port, fetch: app.fetch };
