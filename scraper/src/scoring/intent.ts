// Heuristic intent score for a search keyword on 0–1.
//
// Category-agnostic, structural-only. We score from the SHAPE of the
// keyword — not from a hardcoded vocabulary that only applies to one
// vertical. Older revisions of this file maintained a `HIGH_INTENT_TOKENS`
// set tuned for habit-tracker apps (tracker, planner, journal, habit,
// routine, streak, …). That made every single-word non-productivity
// keyword (pickleball, dupr, photo, finance, yoga) flatline at exactly
// 0.5 − 0.15 = 0.35 — silently broken across most of the App Store.
//
// Signals (cheap, deterministic, no external lookups):
//   • Word count — multi-word phrases carry higher search intent than
//     broad single terms ("habit tracker" > "habit").
//   • Brand-likeness for single-word terms — proper-noun / acronym
//     patterns lift intent (the searcher knows what they want). Detected
//     from: uppercase letters in the original input, length 3–7 with no
//     common English suffix, unusual vowel ratio.
//   • Token length — very short single tokens are usually category
//     browsers ("app", "ai"); long compound tokens are usually specific
//     ("pickleball", "scoreboard").
//   • Generic / discovery stopwords — "best", "top", "free", "new" drop
//     intent (transactional but unspecific).
//
// `popularityWeightedIntent` blends this heuristic with Apple Search Ads
// popularity when available — see below.
//
// Output range: 0.10 – 0.95, never the exact boundaries so a value of 0
// or 1 always reads as "unset" in downstream code.

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

// Common English derivational suffixes. A 4–7 char single-word keyword
// that ends in one of these is much less likely to be a proper noun /
// brand and more likely to be a category-feature word.
const COMMON_SUFFIX_RE =
  /(ing|tion|sion|ness|ment|ity|able|ible|ful|less|ous|ish|ly|er|ed|est|ies)$/;

export function intentScore(keyword: string): number {
  const raw = keyword.trim();
  if (raw.length === 0) return 0.1;

  const normalized = raw.toLowerCase();
  const tokens = normalized.split(/\s+/).filter((t) => t.length > 0);
  const wordCount = tokens.length;

  let score = 0.5;

  if (wordCount === 1) {
    const token = tokens[0]!;
    score += singleWordAdjustment(token, raw);
  } else if (wordCount === 2) {
    score += 0.2; // long-tail sweet spot
  } else if (wordCount === 3) {
    score += 0.15;
  } else if (wordCount === 4) {
    score += 0.05;
  } else {
    score -= 0.05; // 5+ words: sentence, not query
  }

  // Stopword drag — cap at three hits so a search like
  // "for the best app" doesn't go to -0.20 below the floor immediately.
  let stopHits = 0;
  for (const token of tokens) {
    if (LOW_INTENT_TOKENS.has(token)) {
      score -= 0.05;
      stopHits += 1;
      if (stopHits >= 3) break;
    }
  }

  // Stopword-density penalty — when most/all of a phrase's tokens are
  // stopwords ("best free app", "the new top app"), the word-count lift
  // is misleading: it's still a low-intent generic query, just longer.
  // The drag here pushes those phrases back into the drop band.
  if (wordCount >= 2 && stopHits / wordCount >= 0.66) {
    score -= 0.1;
  }

  return clamp(score, 0.1, 0.95);
}

// Single-word intent shaping. Brand-like tokens (proper nouns, acronyms,
// niche names like DUPR) get a lift because the searcher already knows
// what they want. Very short tokens ("app", "ai") get penalized as
// category browse. Long compound tokens ("pickleball") get a small lift
// as specific.
function singleWordAdjustment(token: string, rawKeyword: string): number {
  const hasUpperBody = /[A-Z]/.test(rawKeyword.slice(1));
  const len = token.length;
  const vowels = (token.match(/[aeiou]/g) ?? []).length;
  const vowelRatio = len > 0 ? vowels / len : 0;
  const hasCommonSuffix = COMMON_SUFFIX_RE.test(token);

  let brandLike = 0;
  if (hasUpperBody) brandLike += 0.3;
  if (len >= 3 && len <= 7 && !hasCommonSuffix) brandLike += 0.15;
  if (vowelRatio < 0.3 || vowelRatio > 0.6) brandLike += 0.15;

  if (brandLike >= 0.25) return 0.15; // niche/brand lift (DUPR-class)
  if (len <= 3) return -0.2; // truly broad ("app", "ai")
  if (len >= 8) return 0.05; // compound/specific ("pickleball")
  return 0; // 4-7 char common-English token: neutral
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
