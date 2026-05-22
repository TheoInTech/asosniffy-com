import type { ReviewSentiment } from "../schemas/index.js";

// Sprint B — review sentiment analyzer for the Expert tier. Heuristic-only:
// keyword-based scoring over fetched review bodies. No LLM call — fully
// deterministic and auditable per request.
//
// Rationale: the cheaper tiers already use review COUNT + average rating
// for the metadataScore.ratingsAndReviews subscore. Expert adds review
// BODY analysis: sentiment distribution + extracted complaint themes. The
// review bodies are already in data.reviewBodies (Apple RSS or Google Play
// reviews); this module is the second consumer alongside the existing
// reviewKeywordFrequency in suggestedKeywords[reason="review-frequency"].
//
// Honest threshold: we return null when fewer than MIN_REVIEWS_FOR_SENTIMENT
// reviews are available. Below that floor a heuristic could swing wildly on
// a single negative outlier, which would mislead the founder. The route
// surfaces null rather than fabricating sentiment over thin data — same
// "no honest signal -> emit null" pattern Sniffy uses for trend and
// difficulty.

export const MIN_REVIEWS_FOR_SENTIMENT = 5;

// Curated keyword dictionaries. Kept small and intentional — broader
// lexicons drift into ambiguity (e.g. "kill" can be positive or negative
// depending on game context). When in doubt, omit. Each list is sorted for
// reviewer-friendly diff; sort order doesn't affect runtime behavior.
const POSITIVE_TOKENS = new Set([
  "amazing",
  "awesome",
  "beautiful",
  "best",
  "brilliant",
  "easy",
  "excellent",
  "fantastic",
  "favorite",
  "fun",
  "good",
  "great",
  "helpful",
  "impressive",
  "incredible",
  "intuitive",
  "love",
  "loved",
  "loving",
  "nice",
  "perfect",
  "polished",
  "quick",
  "recommend",
  "reliable",
  "simple",
  "smart",
  "smooth",
  "solid",
  "stunning",
  "superb",
  "useful",
  "wonderful",
  "worth",
]);

const NEGATIVE_TOKENS = new Set([
  "annoying",
  "awful",
  "bad",
  "broken",
  "buggy",
  "bugs",
  "cheap",
  "confusing",
  "crash",
  "crashes",
  "crashing",
  "disappointed",
  "disappointing",
  "expensive",
  "freezes",
  "frustrating",
  "garbage",
  "glitch",
  "glitches",
  "hate",
  "hated",
  "horrible",
  "lag",
  "laggy",
  "missing",
  "pointless",
  "poor",
  "scam",
  "slow",
  "stuck",
  "stupid",
  "terrible",
  "trash",
  "unusable",
  "useless",
  "worst",
]);

const INTENSIFIERS = new Set([
  "absolutely",
  "completely",
  "extremely",
  "really",
  "so",
  "super",
  "totally",
  "very",
]);

const NEGATIONS = new Set(["never", "no", "not"]);

// Stopwords stripped from complaint-theme extraction. Aggressively short so
// founders see the actual product nouns ("battery", "ads", "subscription")
// not the connective tissue ("with", "this", "very").
const STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "all",
  "also",
  "an",
  "and",
  "any",
  "app",
  "are",
  "as",
  "at",
  "be",
  "been",
  "before",
  "but",
  "by",
  "can",
  "do",
  "doesn",
  "don",
  "even",
  "for",
  "from",
  "get",
  "had",
  "has",
  "have",
  "how",
  "i",
  "if",
  "in",
  "is",
  "it",
  "its",
  "just",
  "like",
  "me",
  "more",
  "my",
  "no",
  "not",
  "now",
  "of",
  "on",
  "one",
  "only",
  "or",
  "other",
  "out",
  "over",
  "since",
  "so",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "thing",
  "things",
  "this",
  "those",
  "through",
  "time",
  "to",
  "too",
  "up",
  "use",
  "used",
  "very",
  "was",
  "way",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "who",
  "why",
  "will",
  "with",
  "would",
  "you",
  "your",
]);

// Tokenize: lowercase, split on non-letter chars, drop empties + 1-2 char
// tokens (always uninformative for sentiment + theme extraction).
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z']+/u)
    .filter((t) => t.length >= 3);
}

interface ScoredReview {
  positive: number;
  negative: number;
  /** All non-stopword tokens length>=4 from this review — used downstream
   *  for complaint-theme extraction when the review classifies negative. */
  contentTokens: string[];
}

// Score one review body. Walks the token stream tracking a small lookback
// window (1 token) for negations + intensifiers. A "very bad" hit gets
// double-counted as negative; a "not good" gets one negative-direction
// flip; a bare "great" counts as one positive.
function scoreReview(body: string): ScoredReview {
  const tokens = tokenize(body);
  let positive = 0;
  let negative = 0;
  const contentTokens: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const isPositive = POSITIVE_TOKENS.has(token);
    const isNegative = NEGATIVE_TOKENS.has(token);

    // Theme candidates: non-sentiment, non-intensifier, non-stopword tokens
    // that the user is actually complaining about. 3-char minimum so common
    // app complaints like "ads" / "fee" / "bug" make the cut.
    if (
      token.length >= 3 &&
      !STOPWORDS.has(token) &&
      !isPositive &&
      !isNegative &&
      !INTENSIFIERS.has(token) &&
      !NEGATIONS.has(token)
    ) {
      contentTokens.push(token);
    }

    if (!isPositive && !isNegative) continue;

    const prior = tokens[i - 1];
    const negated = prior !== undefined && NEGATIONS.has(prior);
    const intensified =
      prior !== undefined && INTENSIFIERS.has(prior) ? 2 : 1;

    // negation flips the polarity (with the same weight).
    if (isPositive) {
      if (negated) negative += intensified;
      else positive += intensified;
    } else {
      if (negated) positive += intensified;
      else negative += intensified;
    }
  }

  return { positive, negative, contentTokens };
}

type Polarity = "positive" | "negative" | "neutral";

function classify(score: ScoredReview): Polarity {
  const margin = score.positive - score.negative;
  // Margin ≥ 1 / ≤ -1 — a single clear sentiment marker is enough to call
  // the polarity. App-store reviews tend to be short; requiring margin ≥ 2
  // pushed too many one-liner reviews to neutral and obscured the signal.
  if (margin >= 1) return "positive";
  if (margin <= -1) return "negative";
  return "neutral";
}

export interface AnalyzeSentimentInput {
  reviewBodies: readonly string[];
  // The orchestrator passes this through so we don't double-derive it from
  // the body count. "skipped" / "unavailable" → return null regardless of
  // body count.
  reviewCoverage: "complete" | "partial" | "unavailable" | "skipped";
}

// Returns null when the coverage is unusable for sentiment OR the body
// count is below MIN_REVIEWS_FOR_SENTIMENT. Honest-floor pattern: better
// to surface "no signal" than fabricate sentiment from 1-2 reviews.
export function analyzeReviewSentiment(
  input: AnalyzeSentimentInput,
): ReviewSentiment | null {
  if (
    input.reviewCoverage === "skipped" ||
    input.reviewCoverage === "unavailable"
  ) {
    return null;
  }
  if (input.reviewBodies.length < MIN_REVIEWS_FOR_SENTIMENT) {
    return null;
  }

  const polarityCounts = { positive: 0, neutral: 0, negative: 0 };
  // Word-frequency map across reviews classified negative — the source for
  // complaint themes. Map<lowercased-token, distinct-review-count>.
  const negativeWordReviewCount = new Map<string, number>();

  for (const body of input.reviewBodies) {
    const score = scoreReview(body);
    const polarity = classify(score);
    polarityCounts[polarity]++;

    if (polarity === "negative") {
      // Distinct token set per review — a review that mentions "battery" 5
      // times still counts as 1 toward the theme's sampleCount.
      const distinctTokens = new Set(
        score.contentTokens.filter((t) => !STOPWORDS.has(t)),
      );
      for (const token of distinctTokens) {
        negativeWordReviewCount.set(
          token,
          (negativeWordReviewCount.get(token) ?? 0) + 1,
        );
      }
    }
  }

  const total = input.reviewBodies.length;
  // Round to integer percent so the three values sum cleanly (modulo
  // rounding drift, which we accept — UI shouldn't depend on exact sum).
  const positivePercent = Math.round((polarityCounts.positive / total) * 100);
  const negativePercent = Math.round((polarityCounts.negative / total) * 100);
  const neutralPercent = Math.max(0, 100 - positivePercent - negativePercent);

  // Extract top complaint themes. Filter to tokens that appeared in ≥2
  // distinct negative reviews so a single outlier review doesn't drive the
  // theme list. Sort by frequency desc, then alphabetically for stability.
  const themes = Array.from(negativeWordReviewCount.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => {
      if (a[1] !== b[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, 5)
    .map(([theme, sampleCount]) => ({ theme, sampleCount }));

  return {
    positivePercent,
    neutralPercent,
    negativePercent,
    totalReviewsAnalyzed: total,
    topComplaintThemes: themes,
  };
}
