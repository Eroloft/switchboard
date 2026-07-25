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
Switchboard also supports **plan → execute**: a strong model writes a short plan,
cheap models do the bulk of the work, then a final synthesis. That is where the real token
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

The (non-streaming) JSON response includes a `switchboard` block showing the route, the cost, and how much was saved.

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

For Anthropic-format clients (Claude Code and other Claude SDKs):

```bash
export ANTHROPIC_BASE_URL="http://localhost:4000"
export ANTHROPIC_API_KEY="anything"
```

Switchboard serves **both** APIs: `POST /v1/chat/completions` (OpenAI) and
`POST /v1/messages` (Anthropic) — same routing engine behind each.

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

## Prove it — `bun run eval`

See the savings and the routing quality for yourself:

```bash
bun run eval                            # default strategy: auto-classify
EVAL_STRATEGY=auto-cascade bun run eval
```

It runs a labelled prompt set through the router and reports **routing accuracy**
(did easy prompts go cheap and hard prompts go strong?) and **% cost saved** vs
running the strong model on everything:

```
--- summary (8 cases) ---
routing accuracy: 100%  (8/8 sent to the right tier)
SAVED:    33%
```

Point it at your real models (via `.env`) for real dollar figures. This is the
"save X% without losing quality" claim, measured — and it makes the savings-vs-accuracy
trade-off between strategies explicit (cascade saves more but leans on the confidence
signal; classify routes more precisely).

### Measuring quality, not just savings

Add `EVAL_JUDGE=1` and a capable judge model to prove the router's cheaper answers
are *as good as* the strong model's:

```bash
EVAL_JUDGE=1 EVAL_JUDGE_MODEL=gpt-4o bun run eval
```

For each case it fetches a reference answer from the strong model and asks the judge
whether the router's answer is `ACCEPTABLE` or `WORSE`, then reports **quality retained %**
next to the savings — the full "saved X% *without losing quality*" proof. (A mock judge
reports `n/a`; point it at a real model for real scores.)

## Configuration

Everything works from env vars and sensible defaults, but you can drop a
`switchboard.config.json` (copy `switchboard.config.example.json`) to set the models,
the classifier threshold, or register custom models with pricing:

```json
{
  "cheapModel": "gpt-4o-mini",
  "strongModel": "gpt-4o",
  "classifyThreshold": 0.4,
  "models": {
    "my-custom-model": { "provider": "openai", "tier": "strong", "inputPerM": 5, "outputPerM": 15 }
  }
}
```

Precedence is **env var > config file > built-in default**. Point elsewhere with
`SWITCHBOARD_CONFIG=/path/to/config.json`.

## Roadmap

- [x] OpenAI-compatible `/v1/chat/completions`
- [x] Cascade strategy + cost/savings reporting
- [x] `auto-plan` (plan → execute) strategy
- [x] `auto-classify` (judge difficulty first) strategy
- [x] Cumulative stats (SQLite) + `/stats` endpoint (saved $, tokens, per strategy)
- [x] Streaming (SSE) responses — OpenAI-compatible chunks (so Cursor/Codex/SDKs work)
- [x] Real, verified pricing table (Anthropic + OpenAI)
- [x] Eval harness (`bun run eval`) — routing accuracy + % cost saved
- [x] LLM-judge quality scoring in eval (`EVAL_JUDGE=1`) — prove quality is unchanged
- [x] Config file (`switchboard.config.json`) — models, classifier threshold, custom pricing
- [ ] True incremental (token-by-token) streaming
- [x] Anthropic-native `/v1/messages` endpoint (Claude Code / Claude SDK clients)
- [x] Provider fallback (same-tier, cross-provider) on errors

## Status

Early MVP. Prices in `src/registry.ts` are real published rates (Anthropic verified
2026-06-24, OpenAI 2026) — still confirm current pricing for your own account/region.

MIT licensed.
