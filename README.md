# Switchboard

**A smart LLM gateway that plans with a strong model and executes with cheap ones — so you save tokens without losing quality.**

Point any OpenAI-compatible tool (Codex, Cursor, Aider, Continue) at Switchboard and it decides, per request, how to get a good answer for the least money.

## Простыми словами

Модели — как работники: дорогая (Opus) = опытный спец, дешёвая = стажёр.
Switchboard — это «прораб» посередине. Он сам решает, кого позвать на каждую задачу,
а для сложного просит дорогую модель написать короткий **план** и отдаёт работу дешёвым.
Ты ничего не переключаешь руками — оно само, вживую.

## What makes it different

Most gateways (LiteLLM, RouteLLM) pick **one** model per request.
Switchboard also aims to support **plan → execute**: a strong model writes a short plan,
cheap models do the bulk of the work, then a quick check. That is where the real token
savings on hard tasks come from.

Strategies are chosen by the `model` field of the request:

| `model` value   | What it does                                             | Status |
| --------------- | -------------------------------------------------------- | ------ |
| `auto-cascade`  | Try cheap first; escalate to strong only if answer shaky | ✅ MVP  |
| `auto-classify` | Judge difficulty first, then pick the model in one pass   | ✅ MVP  |
| `auto-plan`     | Strong plans, cheap executes, then synthesize            | ✅ MVP  |
| a concrete id   | Pass straight through to that model                      | ✅      |

## Quickstart

Runs with **zero API keys** using fake "mock" models, so you can see it work immediately.

```bash
bun install
bun start
```

In another terminal:

```bash
curl http://localhost:4000/v1/chat/completions -H "content-type: application/json" -d "{\"model\":\"auto-cascade\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello!\"}]}"
```

The response includes a `switchboard` block showing the route, the cost, and how much was saved.

## Use real models

Copy `.env.example` to `.env` and add whichever key you have:

```
# Anthropic (cheap/strong auto-picks claude-haiku-4-5 / claude-opus-4-8)
ANTHROPIC_API_KEY=sk-ant-...

# or OpenAI (auto-picks gpt-4o-mini / gpt-4o)
OPENAI_API_KEY=sk-...
```

The cheap/strong pair is chosen automatically from your keys; override with
`CHEAP_MODEL` / `STRONG_MODEL` to pick any models from `src/registry.ts`
(e.g. `claude-haiku-4-5`, `claude-sonnet-5`, `claude-opus-4-8`, `claude-fable-5`).

## Local mode — free & private (great for stretching subscription limits)

Route the easy majority of your work to **free local models** (via [Ollama](https://ollama.com))
and save an expensive cloud model (or a rate-limited subscription) for the hard parts.
Nothing leaves your machine, and no API tokens or subscription limits are spent on routine work.

```bash
ollama pull qwen2.5-coder:7b   # capable local "strong" model (planner)
ollama pull qwen3.5:2b         # fast local "cheap" model (executor)
bun run start:local            # cheap=qwen3.5:2b, strong=qwen2.5-coder:7b, all $0
```

Every request is now answered locally for **$0**. Point a tool at it (below) and your
day-to-day coding assistant runs free — you only reach for the paid/subscription model
when the task is genuinely hard.

> Small local models (7B) are great for chat and routine coding, but heavy agentic tools
> may need a larger model. Pull `qwen2.5-coder:14b` for more capability (slower on ≤8 GB VRAM).

## Plug into your tools

```bash
export OPENAI_BASE_URL="http://localhost:4000/v1"
export OPENAI_API_KEY="anything"   # Switchboard uses your provider keys from .env
```

Then run Codex / Cursor / Aider as usual — every request now flows through Switchboard.

> Claude Code speaks the Anthropic format; a native `/v1/messages` endpoint is on the roadmap.

## Stats & savings

Every request is logged to a local SQLite file (`switchboard.db`). Ask the gateway
for cumulative totals:

```bash
curl http://localhost:4000/stats
```

You get requests, tokens, **% of tokens handled by cheap models**, dollars spent vs
the strong-only baseline, dollars saved and saved %, plus a per-strategy breakdown.
Add `?since=<unix-seconds>` to window it (e.g. this month). This is the raw material
for a "you saved $X this month" dashboard or subscription view.

## Roadmap

- [x] OpenAI-compatible `/v1/chat/completions`
- [x] Cascade strategy + cost/savings reporting
- [x] `auto-plan` (plan → execute) strategy
- [x] `auto-classify` (judge difficulty first) strategy
- [x] Cumulative stats (SQLite) + `/stats` endpoint (saved $, tokens, per strategy)
- [ ] Streaming (SSE)
- [ ] Anthropic-native `/v1/messages` (Claude Code support)
- [ ] Real, verified pricing table + eval harness ("saved X %, quality unchanged")

## Status

Early MVP. Prices in `src/registry.ts` are real published rates (Anthropic verified
2026-06-24, OpenAI 2026) — still confirm current pricing for your own account/region.

MIT licensed.
