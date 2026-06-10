// Static store-conversion benchmark corpus.
//
// This is REPORT data with third-party attribution. It deliberately lives
// here and NOT in @gosniffy/aso-knowledge: the knowledge package is
// primary-source-only (Apple/Google documentation), while everything in this
// file is third-party vendor research (NP Digital, AppTweak-via-Adapty,
// AppFollow, PowerReviews). Keeping the two corpora separate is what lets the
// free MCP server stay "official docs only" while the paid report can still
// cite industry benchmarks honestly.
//
// Sources (as captured in docs/research/2026-06-discoverability/
// research-store-conversion.md and research-ratings-reviews-lever.md,
// corpus compiled 2026-06-10):
//   • NP Digital 49-company study — star-rating → conversion-index curve
//     (1.00@5.0, 0.96@4.5, 0.83@4.0, 0.57@3.0, 0.15@2.0, 0.08@1.0).
//     https://neilpatel.com/marketing-stats/app-downloads-vs-ratings/
//   • AppFollow ASO ranking-factors guide (2026) — 3.5 suppression /
//     4.0 credibility / >4.5 top-3 cluster thresholds.
//     https://appfollow.io/blog/aso-ranking-factors
//   • Adapty benchmark roundup, sourced to AppTweak H1 2024 — per-category
//     iOS page-view-to-install CVR baselines.
//     https://adapty.io/blog/app-store-conversion-rate/
//   • Business of Apps aggregation — the AppTweak 2020 (33.7%) vs H1 2024
//     (25%) cross-vintage conflict that motivates range-not-point shipping.
//     https://www.businessofapps.com/marketplace/app-store-optimization/research/app-store-optimization-statistics/
//   • PowerReviews 20M+ e-commerce-page benchmark — flat 5.0 converts like
//     3.0-3.49 (the thin-volume caveat). E-commerce, NOT app stores.
//     https://www.powerreviews.com/average-rating-impact-on-conversion/
//
// What this corpus deliberately does NOT claim:
//   • None of these numbers are Apple- or Google-documented policy. Every
//     entry is community-tested / third-party-correlational and is labeled
//     as such (`evidence` fields); downstream report fields built from this
//     corpus must carry `inferred` provenance.
//   • Per-category baselines ship ONLY for the categories the research
//     corpus actually quantifies. Unmapped categories must return null
//     downstream — never silently substitute the cross-category default.
//   • "Books" is intentionally absent: the corpus documents an extreme
//     source conflict (7.3% AppTweak 2024 vs 74.2% Statista 2022 — a 10x
//     methodology/sampling disagreement) for which no honest range exists.
//   • Where the corpus does not state a study's publication year, `year`
//     is the corpus access year (2026) — noted inline — rather than an
//     invented publication date.

// Roadmap convention (Part 5): every numeric benchmark from third-party
// research ships as a range object with source + year, never a bare point.
export interface BenchmarkRange {
  low: number;
  high: number;
  source: string;
  year: number;
}

export interface RatingCurveAnchor {
  rating: number; // average star rating, 1.0..5.0
  multiplier: number; // conversion index relative to a 5.0-star app (=1.00)
}

// NP Digital 49-company curve. Anchor points exactly as reported; consumers
// interpolate linearly between anchors (scoring/conversion-index.ts).
// `year` is the corpus access year — the research corpus does not state the
// study's original publication date.
export const RATING_CVR_MULTIPLIER_CURVE = {
  source: "NP Digital 49-company study",
  year: 2026,
  url: "https://neilpatel.com/marketing-stats/app-downloads-vs-ratings/",
  evidence: "third-party-correlational",
  anchors: [
    { rating: 1.0, multiplier: 0.08 },
    { rating: 2.0, multiplier: 0.15 },
    { rating: 3.0, multiplier: 0.57 },
    { rating: 4.0, multiplier: 0.83 },
    { rating: 4.5, multiplier: 0.96 },
    { rating: 5.0, multiplier: 1.0 },
  ] as readonly RatingCurveAnchor[],
} as const;

export interface RatingBandThreshold {
  value: number;
  source: string;
  year: number;
  // "community-tested": vendor/analyst observation, NOT Apple- or
  // Google-documented policy. Nothing in this file is store-documented;
  // the field exists so report copy can make the distinction explicit.
  evidence: "community-tested";
}

// 3.5 / 4.0 / 4.5 rating thresholds. All three are vendor analyses —
// AppFollow's 2026 ranking-factors guide is the primary citation; the 4.0
// featuring floor is triangulated by NP Digital (featured apps dominated by
// 4.4+) and Adapty (90% of featured apps at 4.0+).
export const RATING_BANDS = {
  suppression: {
    value: 3.5,
    source: "AppFollow ASO ranking-factors guide",
    year: 2026,
    evidence: "community-tested",
  },
  credibilityFloor: {
    value: 4.0,
    source:
      "AppFollow ASO ranking-factors guide 2026; NP Digital featured-app analysis (4.4+ dominance); Adapty (90% of featured apps at 4.0+)",
    year: 2026,
    evidence: "community-tested",
  },
  topCluster: {
    value: 4.5,
    source: "AppFollow ASO ranking-factors guide",
    year: 2026,
    evidence: "community-tested",
  },
} as const satisfies Record<string, RatingBandThreshold>;

// The only repeated cross-vintage measurement in the corpus is the US iOS
// average page-view-to-install rate: 33.7% (AppTweak 2020) vs 25% (AppTweak
// H1 2024) — a spread of roughly +/-15% around the midpoint. We use that
// documented drift to widen the single-source per-category point estimates
// below into honest ranges. ASSUMPTION: cross-vintage drift is our best
// available proxy for single-source uncertainty; it is not a statistical
// confidence interval.
export const CATEGORY_BASELINE_DRIFT = 0.15;

const CATEGORY_BASELINE_SOURCE = "AppTweak H1 2024 (via Adapty)";
const CATEGORY_BASELINE_YEAR = 2024;

function widen(pointEstimate: number): BenchmarkRange {
  return {
    low: round1(pointEstimate * (1 - CATEGORY_BASELINE_DRIFT)),
    high: round1(pointEstimate * (1 + CATEGORY_BASELINE_DRIFT)),
    source: CATEGORY_BASELINE_SOURCE,
    year: CATEGORY_BASELINE_YEAR,
  };
}

// iOS page-view-to-install CVR baselines (percent), keyed by iTunes
// `primaryGenreName` verbatim. ONLY the categories the research corpus
// quantifies (AppTweak H1 2024 via Adapty); point estimates in the trailing
// comments, widened by CATEGORY_BASELINE_DRIFT. Notes:
//   • These are iOS numbers. Platform direction flips per category
//     (Finance: iOS 32.8% vs Play 19.7%; Education: iOS 16.8% vs Play
//     30.4%), so this map must never be used for Android.
//   • "Navigation" exceeds 100% because Apple counts first-time installs /
//     page views and most Navigation installs happen straight from search
//     results without a page view. It is a metric artifact, kept as-is.
//   • Source said "Social"; the iTunes primaryGenreName is
//     "Social Networking".
//   • Games categories are omitted (games are out of the ICP per roadmap).
export const CATEGORY_CVR_BASELINES: Readonly<Record<string, BenchmarkRange>> = {
  Business: widen(66.7), // 66.7%
  Weather: widen(79.8), // 79.8%
  Navigation: widen(115), // 115% (see artifact note above)
  "Photo & Video": widen(60.8), // 60.8%
  Productivity: widen(59.7), // 59.7%
  "Health & Fitness": widen(47.1), // 47.1%
  Utilities: widen(40.6), // 40.6%
  Finance: widen(32.8), // 32.8% iOS (Play: 19.7%)
  Education: widen(16.8), // 16.8% iOS (Play: 30.4%)
  "Social Networking": widen(13.1), // 13.1%
};

// Cross-category US iOS average page-view-to-install rate. CLEARLY LABELED:
// this is the all-category blend, exported for report copy / comparison
// only. computeConversionIndex() does NOT substitute it for unmapped
// categories — those return null. The range IS the documented source
// conflict (AppTweak 2020 vs H1 2024).
export const DEFAULT_CVR_BASELINE: BenchmarkRange = {
  low: 25, // AppTweak H1 2024
  high: 33.7, // AppTweak 2020
  source:
    "Cross-category US iOS average: AppTweak H1 2024 (25%) vs AppTweak 2020 (33.7%), via Adapty / Business of Apps",
  year: 2024,
};

// Thin-volume caveat: PowerReviews' 20M+ e-commerce-page benchmark found
// flat 5.0-star products convert no better than 3.0-3.49 products
// ("too good to be true" distrust). Cross-domain evidence — e-commerce, not
// app stores — so it ships as a flag + widened range, never a fact.
//
// ASSUMPTIONS (ours, documented, not from PowerReviews):
//   • ratingFloor 4.95 — what counts as a "flat 5.0" after store display
//     rounding of near-perfect averages.
//   • countCeiling 50 — below ~50 ratings a perfect average is
//     statistically unsurprising and reads as thin; the corpus gives no
//     count threshold (Apple's own docs separately warn that few ratings
//     discourage downloads). Trigger is count < countCeiling, strict.
// `year` is the corpus access year — the research corpus does not date the
// PowerReviews benchmark.
export const THIN_VOLUME = {
  ratingFloor: 4.95,
  countCeiling: 50,
  // The rating band a flat 5.0 "converts like", per PowerReviews; mapped
  // through RATING_CVR_MULTIPLIER_CURVE by the scoring layer.
  convertsLikeRating: { low: 3.0, high: 3.49 },
  source: "PowerReviews 20M+ e-commerce-page benchmark (e-commerce, not app stores)",
  year: 2026,
  url: "https://www.powerreviews.com/average-rating-impact-on-conversion/",
  evidence: "community-tested",
} as const;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
