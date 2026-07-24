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
| `auto-classify` | Judge difficulty first, then pick the model              | 🔜     |
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

Copy `.env.example` to `.env` and add keys:

```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
CHEAP_MODEL=gpt-4o-mini
STRONG_MODEL=gpt-4o
```

## Plug into your tools

```bash
export OPENAI_BASE_URL="http://localhost:4000/v1"
export OPENAI_API_KEY="anything"   # Switchboard uses your provider keys from .env
```

Then run Codex / Cursor / Aider as usual — every request now flows through Switchboard.

> Claude Code speaks the Anthropic format; a native `/v1/messages` endpoint is on the roadmap.

## Roadmap

- [x] OpenAI-compatible `/v1/chat/completions`
- [x] Cascade strategy + cost/savings reporting
- [x] `auto-plan` (plan → execute) strategy
- [ ] `auto-classify` (judge difficulty first) strategy
- [ ] Streaming (SSE)
- [ ] Anthropic-native `/v1/messages` (Claude Code support)
- [ ] Real, verified pricing table + eval harness ("saved X %, quality unchanged")

## Status

Early MVP. Prices in `src/registry.ts` are **examples** — verify them before trusting the dollar numbers.

MIT licensed.
