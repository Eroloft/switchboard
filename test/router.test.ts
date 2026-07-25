import { test, expect } from "bun:test";
import { classify } from "../src/router/classify.ts";
import { costUsd, estimateTokens } from "../src/cost.ts";
import { Providers } from "../src/providers/index.ts";
import { route } from "../src/router/index.ts";
import type { Config } from "../src/config.ts";

// Deterministic mock config — no keys, no env dependence.
function mockConfig(overrides: Partial<Config> = {}): Config {
  return {
    port: 4000,
    ollamaBaseUrl: "http://localhost:11434",
    cheapModel: "mock-cheap",
    strongModel: "mock-strong",
    statsDbPath: ":memory:",
    classifyThreshold: 0.4,
    ...overrides,
  };
}

// --- classifier ---------------------------------------------------------

test("classify: an easy prompt is not hard", () => {
  expect(classify("hello there").hard).toBe(false);
});

test("classify: a hard prompt is hard", () => {
  const d = classify("Design a scalable architecture and explain the concurrency trade-offs");
  expect(d.hard).toBe(true);
});

test("classify: a higher threshold raises the bar", () => {
  const prompt = "Design a scalable architecture and explain the concurrency trade-offs";
  expect(classify(prompt, 0.9).hard).toBe(false);
});

// --- cost math ----------------------------------------------------------

test("estimateTokens ~ chars/4", () => {
  expect(estimateTokens("abcd")).toBe(1);
  expect(estimateTokens("a".repeat(40))).toBe(10);
});

test("costUsd uses the price table", () => {
  // mock-strong = $3 / 1M input
  expect(costUsd("mock-strong", { promptTokens: 1_000_000, completionTokens: 0 })).toBeCloseTo(3, 5);
  expect(costUsd("does-not-exist", { promptTokens: 999, completionTokens: 999 })).toBe(0);
});

// --- routing (integration, mock provider) -------------------------------

test("auto-classify sends an easy prompt to the cheap model", async () => {
  const config = mockConfig();
  const out = await route(new Providers(config), config, {
    model: "auto-classify",
    messages: [{ role: "user", content: "hello" }],
  });
  expect(out.actualModel).toBe("mock-cheap");
  expect(out.strategy).toBe("classify");
});

test("auto-classify sends a hard prompt to the strong model", async () => {
  const config = mockConfig();
  const out = await route(new Providers(config), config, {
    model: "auto-classify",
    messages: [{ role: "user", content: "Refactor the concurrency logic and prove the race condition root cause" }],
  });
  expect(out.actualModel).toBe("mock-strong");
});

test("auto-plan runs the plan -> execute strategy", async () => {
  const config = mockConfig();
  const out = await route(new Providers(config), config, {
    model: "auto-plan",
    messages: [{ role: "user", content: "explain recursion" }],
  });
  expect(out.strategy).toBe("plan");
  expect(out.steps.length).toBeGreaterThan(1); // plan + execute(s) + synthesize
});

test("a concrete model id passes straight through", async () => {
  const config = mockConfig();
  const out = await route(new Providers(config), config, {
    model: "mock-strong",
    messages: [{ role: "user", content: "hi" }],
  });
  expect(out.actualModel).toBe("mock-strong");
  expect(out.strategy).toBe("passthrough");
});

test("cascade reports savings vs the strong-only baseline", async () => {
  const config = mockConfig();
  const out = await route(new Providers(config), config, {
    model: "auto-cascade",
    messages: [{ role: "user", content: "what is 2 + 2?" }],
  });
  expect(out.strategy).toBe("cascade");
  expect(out.savedUsd).toBeGreaterThanOrEqual(0);
  expect(out.baselineCostUsd).toBeGreaterThanOrEqual(out.totalCostUsd);
});

test("cascade escalation records the wasted cheap call as negative savings", async () => {
  // A cheap answer echoing "i don't know" trips the low-confidence check → escalates.
  const config = mockConfig();
  const out = await route(new Providers(config), config, {
    model: "auto-cascade",
    messages: [{ role: "user", content: "i don't know, please explain in detail" }],
  });
  expect(out.strategy).toBe("cascade");
  expect(out.actualModel).toBe("mock-strong");
  expect(out.steps.length).toBe(2); // cheap attempt + escalated strong
  // We paid the wasted cheap call ON TOP of strong-alone, so net savings are negative.
  expect(out.totalCostUsd).toBeGreaterThan(out.baselineCostUsd);
  expect(out.savedUsd).toBeLessThan(0);
});

test("auto-plan baseline is single-shot, not the N-counted step sum", async () => {
  const config = mockConfig();
  const out = await route(new Providers(config), config, {
    model: "auto-plan",
    messages: [{ role: "user", content: "explain recursion clearly with an example" }],
  });
  expect(out.strategy).toBe("plan");
  // The old bug summed every sub-step's usage (task context re-injected N times),
  // inflating the strong-alone baseline ~N×. The fix prices a single strong-alone shot.
  const summed = out.steps.reduce(
    (u, s) => ({
      promptTokens: u.promptTokens + s.usage.promptTokens,
      completionTokens: u.completionTokens + s.usage.completionTokens,
    }),
    { promptTokens: 0, completionTokens: 0 },
  );
  const inflatedBaseline = costUsd("mock-strong", summed);
  expect(out.baselineCostUsd).toBeLessThan(inflatedBaseline);
});
