// Cheap heuristic: does the cheap model's answer look shaky?
// If yes, the cascade strategy escalates to the strong model.
// Later this can be replaced by a judge model or a trained classifier.

const LOW_CONFIDENCE_MARKERS = [
  "i'm not sure",
  "i am not sure",
  "i don't know",
  "i do not know",
  "cannot help",
  "can't help",
  "as an ai",
  "i'm unable",
  "i am unable",
  "не уверен",
  "не знаю",
  "не могу помочь",
];

export function looksLowConfidence(answer: string): boolean {
  const a = answer.toLowerCase().trim();
  if (!a) return true; // empty answer — escalate (a short but valid answer like "4" must NOT)
  return LOW_CONFIDENCE_MARKERS.some((m) => a.includes(m));
}
