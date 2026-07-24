import type { Usage } from "../types.ts";

/** One model call that happened while serving a request. */
export interface StepTrace {
  model: string;
  usage: Usage;
  costUsd: number;
  note?: string;
}

/** The full result of routing one request, including a cost/savings report. */
export interface RouteOutcome {
  content: string;
  /** label of the model the client "sees" as the responder */
  actualModel: string;
  strategy: string;
  steps: StepTrace[];
  totalCostUsd: number;
  /** what it would have cost if the strong model did everything alone */
  baselineCostUsd: number;
  savedUsd: number;
}
