// A small labelled benchmark. `expectHard` = the task should go to the strong
// model; otherwise the cheap model is enough. Edit / extend for your own domain.

export interface EvalCase {
  prompt: string;
  expectHard: boolean;
}

export const DATASET: EvalCase[] = [
  // --- easy: the cheap model should handle these ---
  { prompt: "What is the capital of France?", expectHard: false },
  { prompt: "Translate 'good morning' into Spanish.", expectHard: false },
  { prompt: "Summarize this in one sentence: the cat sat on the mat.", expectHard: false },
  { prompt: "hello there", expectHard: false },

  // --- hard: these deserve the strong model ---
  { prompt: "Design a scalable architecture for a real-time chat app and explain the trade-offs.", expectHard: true },
  { prompt: "Debug why this recursive function causes a stack overflow and prove the root cause.", expectHard: true },
  { prompt: "Refactor this module to remove the race condition in its concurrency logic.", expectHard: true },
  { prompt: "Optimize this database query's performance and explain the algorithm you used.", expectHard: true },
];
