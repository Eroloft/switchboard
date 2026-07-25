// Switchboard eval harness.
//
// Runs a labelled prompt set through the router and reports:
//   • routing accuracy — did easy prompts go cheap and hard prompts go strong?
//   • % cost saved      — vs running the strong model on everything (baseline)
//
// Works with any configured models. With mock/local models the $ numbers are
// illustrative; point it at real paid models (via .env) for real dollar figures.
//
// Run:  bun run eval           (default strategy: auto-classify)
//       EVAL_STRATEGY=auto-cascade bun run eval

import { loadConfig } from "../config.ts";
import { Providers } from "../providers/index.ts";
import { route } from "../router/index.ts";
import { modelInfo } from "../registry.ts";
import { DATASET } from "./dataset.ts";

const strategy = process.env.EVAL_STRATEGY ?? "auto-classify";
const config = loadConfig();
const providers = new Providers(config);

console.log(`\nSwitchboard eval — strategy: ${strategy}`);
console.log(`cheap=${config.cheapModel}  strong=${config.strongModel}\n`);

let totalCost = 0;
let totalBaseline = 0;
let correct = 0;

for (const testCase of DATASET) {
  const out = await route(providers, config, {
    model: strategy,
    messages: [{ role: "user", content: testCase.prompt }],
  });

  // A case "used strong" if any step ran on a strong-tier model.
  const usedStrong = out.steps.some((s) => modelInfo(s.model)?.tier === "strong");
  const routedRight = usedStrong === testCase.expectHard;
  if (routedRight) correct++;

  totalCost += out.totalCostUsd;
  totalBaseline += out.baselineCostUsd;

  const mark = routedRight ? "OK  " : "MISS";
  console.log(
    `[${mark}] expect=${testCase.expectHard ? "hard" : "easy"} ` +
      `routed=${usedStrong ? "strong" : "cheap"}  ` +
      `$${out.totalCostUsd.toFixed(6)}  ${testCase.prompt.slice(0, 48)}`,
  );
}

const savedPct = totalBaseline > 0 ? Math.round((1 - totalCost / totalBaseline) * 100) : 0;
const accuracy = Math.round((correct / DATASET.length) * 100);

console.log(`\n--- summary (${DATASET.length} cases) ---`);
console.log(`routing accuracy: ${accuracy}%  (${correct}/${DATASET.length} sent to the right tier)`);
console.log(`cost:     $${totalCost.toFixed(6)}`);
console.log(`baseline: $${totalBaseline.toFixed(6)}  (strong model on everything)`);
console.log(`SAVED:    ${savedPct}%\n`);
