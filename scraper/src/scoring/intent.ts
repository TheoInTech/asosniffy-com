// Heuristic intent score for a search keyword on 0–1.
//
// The schema (`KeywordDiagnosisItem.intentScore`) expects a continuous value;
// the synthesis layer reads it back into low/medium/high buckets for prose.
//
// Signals (cheap, deterministic, no external lookups):
//   • Length & word count — multi-word phrases tend to carry higher intent
//     than single broad terms ("habit tracker" > "habit").
//   • Specificity modifiers — verbs like "track", "build", "log", concrete
//     nouns like "tracker", "planner" lift intent.
//   • Generic / discovery words — "app", "best", "top", "free", "new" drop
//     intent (transactional but unspecific).
//   • Very short single tokens — often category browsers, lower intent.
//
// Output range: 0.10 – 0.95, never the exact boundaries so a value of 0 or 1
// always reads as "unset" in downstream code.

const HIGH_INTENT_TOKENS = new Set([
  "tracker",
  "planner",
  "journal",
  "habit",
  "routine",
  "streak",
  "log",
  "logger",
  "manager",
  "schedule",
  "scheduler",
  "checklist",
  "timer",
  "reminder",
  "todo",
  "task",
  "tasks",
  "goal",
  "goals",
  "challenge",
  "build",
  "track",
  "monitor",
]);

const LOW_INTENT_TOKENS = new Set([
  "app",
  "apps",
  "best",
  "top",
  "free",
  "new",
  "good",
  "great",
  "popular",
  "the",
  "and",
  "or",
  "with",
  "for",
  "to",
  "of",
  "a",
  "an",
  "my",
]);

export function intentScore(keyword: string): number {
  const normalized = keyword.trim().toLowerCase();
  if (normalized.length === 0) return 0.1;

  const tokens = normalized.split(/\s+/).filter((t) => t.length > 0);
  const wordCount = tokens.length;

  let score = 0.5;

  // Word-count signal: 1 word floor, 2 words ideal, 3–4 still strong, 5+ falls
  // off (becomes a sentence rather than a search query).
  if (wordCount === 1) score -= 0.15;
  else if (wordCount === 2) score += 0.15;
  else if (wordCount === 3) score += 0.1;
  else if (wordCount >= 5) score -= 0.05;

  // Token-level lift / drag.
  for (const token of tokens) {
    if (HIGH_INTENT_TOKENS.has(token)) score += 0.08;
    if (LOW_INTENT_TOKENS.has(token)) score -= 0.05;
  }

  // Single-character or very short tokens are rarely searched intentionally.
  if (wordCount === 1 && tokens[0]!.length <= 3) score -= 0.05;

  return clamp(score, 0.1, 0.95);
}

export function intentBucket(score: number): "low" | "medium" | "high" {
  if (score >= 0.7) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// Phase 3 — popularity-weighted intent.
//
// When Apple Search Ads popularity is live, prefer it: it's the canonical
// iOS demand signal. When degraded (ASA disabled, auth-failed, rate-limited),
// fall back to the heuristic but CAP the score so consumers can see the
// confidence gap — a heuristic 0.95 should not outrank a real ASA 80.
//
// Apple's popularity is on a 5–100 scale; we project to 0–1:
//     (score - 5) / 95
//
// The popularity-weighted blend leans heavily on the real signal (0.75)
// with the heuristic as a secondary check (0.25) so degenerate cases
// (a high-popularity keyword that fails heuristic checks) stay coherent.
export interface PopularityWeightedIntentInput {
  keyword: string;
  popularityScore: number | null;
  popularitySource: "apple-search-ads" | "heuristic";
}

export function popularityWeightedIntent(
  input: PopularityWeightedIntentInput,
): number {
  const heuristic = intentScore(input.keyword);

  if (
    input.popularitySource !== "apple-search-ads" ||
    input.popularityScore === null
  ) {
    // Degraded path: heuristic only, with a small cap so callers can see
    // it sits below "Apple-corroborated demand."
    return Math.min(heuristic, 0.85);
  }

  const normalized = clamp((input.popularityScore - 5) / 95, 0, 1);
  // Weighted blend (0.75 real / 0.25 heuristic) so a heuristic floor still
  // matters but the real signal dominates.
  const blended = normalized * 0.75 + heuristic * 0.25;
  return clamp(blended, 0.1, 0.95);
}
