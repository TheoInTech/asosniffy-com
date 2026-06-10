// Observable-signal keyword popularity + app-relative Chance / KEI.
//
// This is Sniffy's OWN popularity estimate, computed purely from public
// signals the scraper has already fetched (iTunes search results, result
// counts, autocomplete suggestions). It is NOT Apple's Search Ads popularity
// index. We deliberately do not depend on that number because:
//   • Apple's only public definition of it is a 1–5 dot bidding aid inside
//     paid Apple Ads docs (ads.apple.com/app-store/best-practices/keywords);
//     the 5–100 integer ASO tools resell is undocumented.
//   • The metric publicly collapsed in Oct 2025 (US keywords above the floor
//     fell -77.4% in four days; respectaso.com/blog/
//     apple-search-ads-popularity-unreliable-aso-keyword-data/, corroborated
//     by MobileAction/APPlyzer/Appfigures), custom reports 403'd Mar 2026,
//     and ASA covers only 91 of 175 storefronts.
//   • This repo's own probe (2026-06-03, providers/apple/search-ads-popularity.ts)
//     confirmed the public Campaign Management API v5 exposes no campaign-free
//     popularity endpoint (/keywords/recommendations → 404).
//
// Methodology sources — ALL community-tested, NONE Apple-documented; every
// output of this module ships with provenance `inferred`:
//   • Six-signal blend adapted from RespectASO's open methodology
//     (github.com/respectlytics/respectaso — result count, leader strength by
//     rating volume, title-match density, market depth, specificity penalty,
//     exact-phrase bonus), plus an autocomplete-presence boost (suggestion
//     presence/order is load-bearing in every commercial Play model per
//     AppTweak, but NO published study validates autocomplete order vs ASA
//     popularity — that study is Sniffy's V4 work, see below).
//   • Chance/KEI shape from AppTweak's published product methodology
//     (apptweak.com/en/aso-blog/ranking-difficulty-chance-score-now-on-apptweak,
//     updated 2025-07-08): Chance is app-relative (your strength vs the
//     top-N), KEI combines volume with chance.
//   • Impressions translation from the SplitMetrics + Phiture empirical fit
//     max daily impressions = 254.44 × e^(0.0615 × SP)
//     (splitmetrics.com/blog/apple-search-popularity-index/; 30,805 US terms,
//     315,993 observations, Aug–Oct 2019). STALE: the data pre-dates both the
//     June-2024 SAP logic change and the Oct-2025 collapse. Shipped only as an
//     "illustrative ceiling" RANGE with source + year attached, never as a
//     measurement, until recalibrated (~$50 ASA discovery campaign, roadmap 1.3).
//
// What this module deliberately does NOT claim:
//   • The 5–100 score is unit-compatible with the ASA scale so existing report
//     consumers keep working, but it is a rank-order ESTIMATE of relative
//     search interest — not search volume, not Apple's number.
//   • V4 validation (rank-order consistency vs autocomplete suggestion order,
//     ~200 keywords × 5 categories — verification-verdicts.md) is PENDING.
//     `methodologyVersion: "obs-1"` gates recalibration: any reweighting after
//     the V4 study bumps the version so cached reports stay comparable.
//   • Chance inherits AppTweak's documented brand-term blind spot ("waze" at
//     KD 47 still can't be won): the formula does not model brand intent.
//     A brand-term flag is follow-up work, not part of obs-1.
//   • averageUserRating is accepted in the input shape (already fetched, kept
//     for forward-compat) but unused in obs-1: popularity ≠ quality, and
//     rating quality is already priced into keyword-difficulty.ts.
//
// Pure deterministic functions. NO network I/O, no clock reads. Inputs are
// already-fetched data passed as parameters. Honesty gates return null when
// there is nothing to estimate from — we never fabricate.

import { classifyKeywordMatch } from "./keyword-match.js";

// Already-fetched observable signals for one keyword in one storefront.
// `topApps` is the top of the iTunes search response (typically 10–15, in
// rank order). `autocompleteRank` is the 1-based position of the keyword in
// Apple's autocomplete suggestions, null when absent from suggestions.
export interface PopularitySignalInput {
  keyword: string;
  appCount: number | null;
  topApps: ReadonlyArray<{
    name: string;
    averageUserRating: number | null;
    userRatingCount: number | null;
  }>;
  autocompleteRank: number | null;
}

export interface ObservablePopularity {
  // 5..100 integer. OUR estimate (provenance `inferred`), unit-compatible
  // with the ASA scale, NOT the broken ASA number.
  score: number;
  // Each component is the raw 0..1 normalized signal. 0 means "no signal
  // observed" — either the signal genuinely measured zero or its input was
  // unavailable. Unavailable signals contribute 0 and are NOT renormalized
  // away: missing evidence can only lower the estimate, never inflate it.
  components: {
    resultDepth: number;
    leaderStrength: number;
    titleMatchDensity: number;
    marketDepth: number;
    specificityPenalty: number;
    exactPhraseBonus: number;
    autocompleteBoost: number;
  };
  methodologyVersion: "obs-1";
}

// --- Tunables (obs-1; bump methodologyVersion on any change) ---

// Score floor/ceiling mirror the ASA display scale (5 = "little to no
// searches" per Appfigures' published guide; 100 = head term).
const SCORE_FLOOR = 5;
const SCORE_CEILING = 100;
const BLEND_POINTS = SCORE_CEILING - SCORE_FLOOR; // 95 points carried by the blend

// iTunes search responses cap near 200 results, so a full page is the
// observable saturation point (matches MAX_COMPETING_APPS in
// keyword-difficulty.ts).
const APP_COUNT_SATURATION = 200;

// Below 3 SERP entries the density/leader signals are noise, not sample —
// treat them as unobserved rather than extrapolate from 1-2 apps.
const MIN_SERP_APPS = 3;

// "Leader strength" reads the head of the SERP only: the top 3 results are
// what users actually see and what rating volume concentrates into.
const LEADER_COUNT = 3;

// Rating volumes span 6+ orders of magnitude; log10 is the honest scale.
// 1M ratings saturates (only global head terms have 1M+ rating leaders).
const LEADER_RATING_SATURATION = 1_000_000;

// An app with >=1,000 ratings is an established player. The fraction of the
// visible SERP at/above this floor measures how DEEP the market runs — a
// keyword where even position 10 has thousands of ratings is a popular one.
const MARKET_DEPTH_RATING_FLOOR = 1_000;

// Specificity penalty: longer, more specific queries are searched less.
// Each token beyond the first costs 0.22; each normalized char beyond 12
// costs 0.015. A 5-token long-tail phrase pins the penalty at 1.
const TOKEN_SPECIFICITY_STEP = 0.22;
const CHAR_SPECIFICITY_FREE = 12;
const CHAR_SPECIFICITY_STEP = 0.015;

// Positive-signal weights (sum to 1.0). Leader strength weighs heaviest —
// rating volume in the SERP head is the strongest public correlate of search
// demand; result depth next (developers crowd searched terms); title-match
// density next (developers actively target the term); market depth and
// exact-phrase round it out. These are obs-1 priors pending V4 calibration.
const RESULT_DEPTH_WEIGHT = 0.25;
const LEADER_STRENGTH_WEIGHT = 0.3;
const TITLE_MATCH_DENSITY_WEIGHT = 0.2;
const MARKET_DEPTH_WEIGHT = 0.15;
const EXACT_PHRASE_WEIGHT = 0.1;

// Penalty multiplier: a fully-specific phrase forfeits up to a quarter of
// the blend (≈24 points) — long-tails can still score when their SERP is
// genuinely strong, but never read as head terms.
const SPECIFICITY_WEIGHT = 0.25;

// Autocomplete presence is direct evidence of real search demand (Apple
// only suggests what users type). It rides ON TOP of the blend as an
// additive boost — absence is NOT penalized because null also means "not
// fetched". Rank 1 earns the full boost, decaying linearly across the
// first 10 suggestions to a presence floor of 0.1 (being suggested at all
// is signal). Max +15 points, clamped at the 100 ceiling.
const AUTOCOMPLETE_RANK_DECAY_RANGE = 10;
const AUTOCOMPLETE_PRESENCE_FLOOR = 0.1;
const AUTOCOMPLETE_MAX_POINTS = 15;

export function computeObservablePopularity(
  input: PopularitySignalInput,
): ObservablePopularity | null {
  const tokens = tokenize(input.keyword);
  // Honesty gate: a keyword with no indexable tokens has nothing to estimate.
  if (tokens.length === 0) return null;
  const normalizedKeyword = tokens.join(" ");

  const appCount = nullableCount(input.appCount);
  const autocompleteRank = validRank(input.autocompleteRank);
  const hasSerp = input.topApps.length >= MIN_SERP_APPS;

  // Honesty gate: with no SERP sample, no result count, and no autocomplete
  // observation there is nothing to estimate from — return null, never guess.
  if (!hasSerp && appCount === null && autocompleteRank === null) return null;

  const resultDepth =
    appCount === null ? 0 : clamp(appCount / APP_COUNT_SATURATION, 0, 1);

  let leaderStrength = 0;
  let titleMatchDensity = 0;
  let marketDepth = 0;
  let exactPhraseBonus = 0;
  if (hasSerp) {
    const leaders = input.topApps.slice(0, LEADER_COUNT);
    leaderStrength =
      leaders.reduce((sum, app) => sum + logNormRatingCount(app.userRatingCount), 0) /
      leaders.length;

    const matchKinds = input.topApps.map((app) =>
      classifyKeywordMatch({ keyword: normalizedKeyword, title: app.name }),
    );
    titleMatchDensity =
      matchKinds.filter((kind) => kind !== "none").length / matchKinds.length;
    // For single-token keywords classifyKeywordMatch reports token presence
    // as titleExactPhrase, so the bonus naturally collapses into density.
    exactPhraseBonus =
      matchKinds.filter((kind) => kind === "titleExactPhrase").length /
      matchKinds.length;

    marketDepth =
      input.topApps.filter(
        (app) =>
          (nullableCount(app.userRatingCount) ?? 0) >= MARKET_DEPTH_RATING_FLOOR,
      ).length / input.topApps.length;
  }

  const specificityPenalty = clamp(
    TOKEN_SPECIFICITY_STEP * (tokens.length - 1) +
      CHAR_SPECIFICITY_STEP *
        Math.max(0, normalizedKeyword.length - CHAR_SPECIFICITY_FREE),
    0,
    1,
  );

  const autocompleteBoost =
    autocompleteRank === null
      ? 0
      : clamp(
          1 - (autocompleteRank - 1) / AUTOCOMPLETE_RANK_DECAY_RANGE,
          AUTOCOMPLETE_PRESENCE_FLOOR,
          1,
        );

  const positiveBlend =
    RESULT_DEPTH_WEIGHT * resultDepth +
    LEADER_STRENGTH_WEIGHT * leaderStrength +
    TITLE_MATCH_DENSITY_WEIGHT * titleMatchDensity +
    MARKET_DEPTH_WEIGHT * marketDepth +
    EXACT_PHRASE_WEIGHT * exactPhraseBonus;
  const blend = clamp(positiveBlend - SPECIFICITY_WEIGHT * specificityPenalty, 0, 1);

  const raw =
    SCORE_FLOOR + BLEND_POINTS * blend + AUTOCOMPLETE_MAX_POINTS * autocompleteBoost;

  return {
    score: clamp(Math.round(raw), SCORE_FLOOR, SCORE_CEILING),
    components: {
      resultDepth: round4(resultDepth),
      leaderStrength: round4(leaderStrength),
      titleMatchDensity: round4(titleMatchDensity),
      marketDepth: round4(marketDepth),
      specificityPenalty: round4(specificityPenalty),
      exactPhraseBonus: round4(exactPhraseBonus),
      autocompleteBoost: round4(autocompleteBoost),
    },
    methodologyVersion: "obs-1",
  };
}

// --- SplitMetrics/Phiture impressions translation ---

// max daily impressions = 254.4443 × e^(0.0615 × SP), fitted on 2019 US data.
// Their published lookup: SP 50 ≈ 5,500/day, SP 80 ≈ 35,000/day.
const IMPRESSIONS_COEFFICIENT = 254.44;
const IMPRESSIONS_EXPONENT = 0.0615;
// ±50% band around the point estimate: the curve is a 2019 single-market fit
// whose floor behavior is known-stale post-2024/2025 Apple changes; a wide
// symmetric band communicates "illustrative ceiling", not measurement. The
// factors tighten only when the planned ASA recalibration lands.
const IMPRESSIONS_LOW_FACTOR = 0.5;
const IMPRESSIONS_HIGH_FACTOR = 1.5;
const IMPRESSIONS_SOURCE = "SplitMetrics/Phiture";
const IMPRESSIONS_YEAR = 2019;

// Translates a 5..100 popularity score into an estimated max-daily-impressions
// RANGE per the roadmap's { low, high, source, year } benchmark convention.
// Input is clamped into the scale domain; non-finite input collapses to the
// floor rather than propagating NaN.
export function estimateMaxDailyImpressions(popularity: number): {
  low: number;
  high: number;
  source: string;
  year: number;
} {
  const sp = clamp(finiteOr(popularity, SCORE_FLOOR), SCORE_FLOOR, SCORE_CEILING);
  const point = IMPRESSIONS_COEFFICIENT * Math.exp(IMPRESSIONS_EXPONENT * sp);
  return {
    low: Math.round(point * IMPRESSIONS_LOW_FACTOR),
    high: Math.round(point * IMPRESSIONS_HIGH_FACTOR),
    source: IMPRESSIONS_SOURCE,
    year: IMPRESSIONS_YEAR,
  };
}

// --- Chance (app-relative difficulty, AppTweak analog) ---

// Chance answers the question keyword-absolute difficulty can't: where would
// OUR app sit in this keyword's top group? Inputs are competitorScore() 0..1
// values from keyword-difficulty.ts — the target app's score and the already-
// computed scores of the keyword's top-N apps.
export interface ChanceInput {
  targetCompetitiveScore: number | null;
  topCompetitiveScores: readonly number[];
}

// Fewer than 3 comparable top scores is a guess, not a percentile.
const MIN_CHANCE_SCORES = 3;
// A tie with an incumbent is a coin flip, not a win — half credit.
const CHANCE_TIE_CREDIT = 0.5;

// 1..100, higher = better chance to rank. Percentile placement: the fraction
// of top apps the target outscores, mapped onto 1 (beats none) .. 100 (beats
// all). Null when the target score is missing or the top group is too thin.
// Known blind spot (documented by AppTweak themselves): brand terms read as
// winnable when they are not — obs-1 does not model brand intent.
export function computeChance(input: ChanceInput): number | null {
  const target = input.targetCompetitiveScore;
  if (target === null || !Number.isFinite(target)) return null;
  const scores = input.topCompetitiveScores.filter((v) => Number.isFinite(v));
  if (scores.length < MIN_CHANCE_SCORES) return null;

  const beaten = scores.reduce(
    (sum, score) =>
      sum + (target > score ? 1 : target === score ? CHANCE_TIE_CREDIT : 0),
    0,
  );
  return clamp(Math.round(1 + 99 * (beaten / scores.length)), 1, 100);
}

// --- KEI (Keyword Efficiency Index, AppTweak analog) ---

// KEI = "best combination of high volume and high chance" (AppTweak). We use
// the geometric mean √(popularity × chance) rather than the raw product:
//   • it stays on the same 1..100 scale as its inputs (a raw product spans
//     5..10,000 and is unit-incompatible with everything else in the report);
//   • it requires BOTH factors to be high — an arithmetic mean would let a
//     hopeless head term (pop 95, chance 5) outrank a winnable mid-tail.
// Null unless both inputs are present: KEI of a missing factor is fabrication.
export function computeKei(
  popularityScore: number | null,
  chance: number | null,
): number | null {
  if (popularityScore === null || !Number.isFinite(popularityScore)) return null;
  if (chance === null || !Number.isFinite(chance)) return null;
  const pop = clamp(popularityScore, 0, 100);
  const ch = clamp(chance, 0, 100);
  return clamp(Math.round(Math.sqrt(pop * ch)), 1, 100);
}

// --- helpers ---

// Same canonicalization as keyword-match.ts: lowercase, collapse every
// non-alphanumeric run to a single space, so "Habit-Tracker: Pro" and
// "habit tracker pro" reduce to the same token stream.
function tokenize(keyword: string): string[] {
  return keyword
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function logNormRatingCount(count: number | null): number {
  const c = nullableCount(count) ?? 0;
  return clamp(
    Math.log10(1 + c) / Math.log10(1 + LEADER_RATING_SATURATION),
    0,
    1,
  );
}

function nullableCount(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, value);
}

// Autocomplete rank is 1-based; anything below 1 or non-finite is invalid
// input, treated as "not observed" rather than fabricated into a boost.
function validRank(rank: number | null): number | null {
  if (rank === null || !Number.isFinite(rank) || rank < 1) return null;
  return rank;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
