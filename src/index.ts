import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { loadConfig } from "./config.ts";
import { Providers } from "./providers/index.ts";
import { route } from "./router/index.ts";
import { modelInfo } from "./registry.ts";
import { Stats } from "./stats.ts";
import type { RouteOutcome } from "./router/types.ts";
import type { ChatRequest, Message } from "./types.ts";

const config = loadConfig();
const providers = new Providers(config);
const stats = new Stats(config.statsDbPath);
const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok", service: "switchboard" }));

// Cumulative savings across all requests — powers subscription / comparison views.
app.get("/stats", (c) => {
  const since = Number(c.req.query("since") ?? 0);
  return c.json(stats.summary(Number.isFinite(since) ? since : 0));
});

// --- helpers -------------------------------------------------------------

/** Flatten OpenAI/Anthropic message content (string or block array) to text. */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p: any) => p?.text ?? "").join("");
  return "";
}

function fromOpenAI(body: any): ChatRequest {
  return {
    model: body.model ?? "auto-cascade",
    messages: (body.messages ?? []).map((m: any): Message => ({ role: m.role, content: textOf(m.content) })),
    temperature: body.temperature,
    maxTokens: body.max_tokens,
    stream: body.stream,
  };
}

function fromAnthropic(body: any): ChatRequest {
  const messages: Message[] = [];
  if (body.system) {
    const sys = textOf(body.system);
    if (sys) messages.push({ role: "system", content: sys });
  }
  for (const m of body.messages ?? []) {
    messages.push({ role: m.role, content: textOf(m.content) });
  }
  return {
    model: body.model ?? "auto-cascade",
    messages,
    temperature: body.temperature,
    maxTokens: body.max_tokens,
    stream: body.stream,
  };
}

interface RunResult {
  out: RouteOutcome;
  savedPct: number;
  promptTokens: number;
  completionTokens: number;
}

/** Client errors (malformed body / unknown model) → 400; everything else → 500. */
function statusFor(err: unknown): 400 | 500 {
  if (err instanceof SyntaxError) return 400; // c.req.json() on a malformed body
  const msg = String((err as any)?.message ?? err);
  return msg.startsWith("Unknown model/strategy") ? 400 : 500;
}

/** Route a request, log it, record stats. Shared by both API surfaces. */
async function runAndRecord(req: ChatRequest): Promise<RunResult> {
  const out = await route(providers, config, req);
  const savedPct = out.baselineCostUsd > 0 ? Math.round((out.savedUsd / out.baselineCostUsd) * 100) : 0;

  console.log(
    `[switchboard] strategy=${out.strategy} model=${out.actualModel} ` +
      `cost=$${out.totalCostUsd.toFixed(6)} baseline=$${out.baselineCostUsd.toFixed(6)} ` +
      `saved=$${out.savedUsd.toFixed(6)} (${savedPct}%)`,
  );

  const promptTokens = out.steps.reduce((s, x) => s + x.usage.promptTokens, 0);
  const completionTokens = out.steps.reduce((s, x) => s + x.usage.completionTokens, 0);

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

  return { out, savedPct, promptTokens, completionTokens };
}

// --- OpenAI-compatible endpoint (Codex / Cursor / Aider / SDKs) -----------

app.post("/v1/chat/completions", async (c) => {
  try {
    const req = fromOpenAI((await c.req.json()) as any);
    const { out, savedPct, promptTokens, completionTokens } = await runAndRecord(req);

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
      choices: [{ index: 0, message: { role: "assistant", content: out.content }, finish_reason: "stop" }],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
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
    return c.json({ error: { message: String(err?.message ?? err) } }, statusFor(err));
  }
});

// --- Anthropic-compatible endpoint (Claude Code and other Claude clients) --

app.post("/v1/messages", async (c) => {
  try {
    const req = fromAnthropic((await c.req.json()) as any);
    const { out, promptTokens, completionTokens } = await runAndRecord(req);
    const id = `msg_sb_${Date.now()}`;

    if (req.stream) {
      return streamSSE(c, async (sse) => {
        await sse.writeSSE({
          event: "message_start",
          data: JSON.stringify({
            type: "message_start",
            message: {
              id,
              type: "message",
              role: "assistant",
              model: out.actualModel,
              content: [],
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: promptTokens, output_tokens: 0 },
            },
          }),
        });
        await sse.writeSSE({
          event: "content_block_start",
          data: JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
        });
        await sse.writeSSE({
          event: "content_block_delta",
          data: JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: out.content } }),
        });
        await sse.writeSSE({ event: "content_block_stop", data: JSON.stringify({ type: "content_block_stop", index: 0 }) });
        await sse.writeSSE({
          event: "message_delta",
          data: JSON.stringify({
            type: "message_delta",
            delta: { stop_reason: "end_turn", stop_sequence: null },
            usage: { output_tokens: completionTokens },
          }),
        });
        await sse.writeSSE({ event: "message_stop", data: JSON.stringify({ type: "message_stop" }) });
      });
    }

    return c.json({
      id,
      type: "message",
      role: "assistant",
      model: out.actualModel,
      content: [{ type: "text", text: out.content }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: promptTokens, output_tokens: completionTokens },
    });
  } catch (err: any) {
    return c.json({ type: "error", error: { type: "api_error", message: String(err?.message ?? err) } }, statusFor(err));
  }
});

console.log(`switchboard listening on http://localhost:${config.port}`);
console.log(`  OpenAI    endpoint: POST /v1/chat/completions`);
console.log(`  Anthropic endpoint: POST /v1/messages`);
console.log(`  cheap model:  ${config.cheapModel}`);
console.log(`  strong model: ${config.strongModel}`);
console.log(`  stats db:     ${config.statsDbPath}`);

export default { port: config.port, fetch: app.fetch };
