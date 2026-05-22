// Keyword difficulty formula.
//
// Derived from semihcihan/App-Store-Optimization-CLI (MIT), pinned commit
// be885e2d74ec7af59b4efaf6042678ec7dc87f5c (see LICENSE-THIRD-PARTY.md).
// Original at `cli/services/cache-api/services/aso-difficulty.ts`.
//
// What changes from the upstream version:
//   • Input is the already-fetched top-N competitor list; this function
//     initiates NO I/O. Guarantees no per-keyword search amplification.
//   • daysSinceFirstRelease is clamped to >=1 to avoid div-by-zero on
//     brand-new apps — upstream silently produces Infinity here.
//   • TopFiveGate is enforced by default (matches upstream `enforceTopFiveGate`).

import type { KeywordMatchKind } from "./keyword-match.js";
import { keywordMatchScore } from "./keyword-match.js";

// Per-app inputs. Five public-iTunes fields. No Search Ads private auth.
export interface CompetitorScoreInput {
  averageUserRating: number;
  userRatingCount: number;
  daysSinceLastRelease: number;
  daysSinceFirstRelease: number;
  keywordMatch: KeywordMatchKind;
}

export interface CompetitorScoreBreakdown {
  normalizedRatingCount: number;
  normalizedAvgRating: number;
  normalizedAge: number;
  normalizedRatingPerDay: number;
  keywordMatchScore: number;
  ratingPerDay: number;
  score: number; // 0..1
  score100: number; // 0..100
}

// Per-keyword inputs. `competitiveScores` is the array of per-app score (0..1)
// produced by `competitorScore()` for each of the top-N apps. `appCount` is
// the total number of apps competing for the keyword in the iTunes search
// response (not just the top-N we deeply analyzed).
export interface KeywordDifficultyInput {
  competitiveScores: readonly number[];
  appCount: number;
  enforceTopFiveGate?: boolean;
}

export interface KeywordDifficultyBreakdown {
  isFallback: boolean;
  scoreCount: number;
  appCount: number;
  avgCompetitive: number;
  minCompetitive: number;
  normalizedAppCount: number;
  rawDifficulty: number;
  difficultyScore: number; // 1..100, clamped
  minDifficultyScore: number; // 1..100, clamped, weakest of the top group
}

// --- Tunables (upstream constants, preserved verbatim) ---
const MAX_COMPETING_APPS = 200;
const MAX_RATINGS = 10_000;
const AGE_NORMALIZATION_DAYS = 365;
const RATING_PER_DAY_MAX = 100;
const RATING_PER_DAY_MAP_THRESHOLD = 0.25;
const RATING_PER_DAY_THRESHOLD = 1;
const LOW_RATING_COUNT_THRESHOLD = 20;
const MIN_RATING_FOR_POSITIVE_SCORE = 3;
const TOP_DIFFICULTY_DOC_LIMIT = 5;

// Per-app weights (sum to 1.0 after normalization).
const RATING_COUNT_WEIGHT = 0.2;
const AVG_RATING_WEIGHT = 0.1;
const AGE_WEIGHT = 0.1;
const KEYWORD_MATCH_WEIGHT = 0.3;
const RATING_PER_DAY_WEIGHT = 0.3;

// Per-keyword weights. min weighted more than avg because the realistic
// goal is to displace the weakest member of the top group, not the average.
const DIFFICULTY_AVG_WEIGHT = 2;
const DIFFICULTY_MIN_WEIGHT = 4;
const DIFFICULTY_APP_COUNT_WEIGHT = 0.5;

export function competitorScore(
  input: CompetitorScoreInput,
): CompetitorScoreBreakdown {
  const userRatingCount = nonNegative(input.userRatingCount);
  const averageUserRating = nonNegative(input.averageUserRating);
  // Clamp daysSinceFirstRelease to 1 to avoid Infinity on day-0 apps.
  const daysSinceFirstRelease = Math.max(1, finiteOr(input.daysSinceFirstRelease, AGE_NORMALIZATION_DAYS));
  const daysSinceLastRelease = Math.max(1, finiteOr(input.daysSinceLastRelease, AGE_NORMALIZATION_DAYS));
  const matchScore = keywordMatchScore(input.keywordMatch);

  const normalizedAge =
    1 - clamp(daysSinceLastRelease / AGE_NORMALIZATION_DAYS, 0, 1);
  const ratingPerDay = userRatingCount / daysSinceFirstRelease;
  const normalizedRatingPerDay = normalizeRatingCountPerDay(ratingPerDay);
  const normalizedRatingCount = clamp(userRatingCount / MAX_RATINGS, 0, 1);
  const normalizedAvgRating = normalizeAvgRating(
    averageUserRating,
    userRatingCount,
  );

  const score = Math.max(
    0,
    (RATING_COUNT_WEIGHT * normalizedRatingCount +
      AVG_RATING_WEIGHT * normalizedAvgRating +
      AGE_WEIGHT * normalizedAge +
      KEYWORD_MATCH_WEIGHT * matchScore +
      RATING_PER_DAY_WEIGHT * normalizedRatingPerDay) /
      (RATING_COUNT_WEIGHT +
        AVG_RATING_WEIGHT +
        AGE_WEIGHT +
        KEYWORD_MATCH_WEIGHT +
        RATING_PER_DAY_WEIGHT),
  );

  return {
    normalizedRatingCount,
    normalizedAvgRating,
    normalizedAge,
    normalizedRatingPerDay,
    keywordMatchScore: matchScore,
    ratingPerDay,
    score,
    score100: score * 100,
  };
}

export function computeKeywordDifficulty(
  input: KeywordDifficultyInput,
): KeywordDifficultyBreakdown {
  const scores = input.competitiveScores.filter((v) => Number.isFinite(v));
  const appCount = nonNegative(input.appCount);
  const enforceTopFiveGate = input.enforceTopFiveGate !== false;
  const scoreCount = scores.length;

  if (
    scoreCount === 0 ||
    (enforceTopFiveGate && !hasDifficultyDetails({ scoreCount, appCount }))
  ) {
    return {
      isFallback: true,
      scoreCount,
      appCount,
      avgCompetitive: 0,
      minCompetitive: 0,
      normalizedAppCount: 0,
      rawDifficulty: 0,
      difficultyScore: 1,
      minDifficultyScore: 1,
    };
  }

  const avgCompetitive = scores.reduce((s, v) => s + v, 0) / scoreCount;
  const minCompetitive = Math.min(...scores);
  const normalizedAppCount = normalizedAppCountScore(appCount);
  const weightSum =
    DIFFICULTY_AVG_WEIGHT + DIFFICULTY_MIN_WEIGHT + DIFFICULTY_APP_COUNT_WEIGHT;
  const rawDifficulty =
    (DIFFICULTY_APP_COUNT_WEIGHT * normalizedAppCount +
      DIFFICULTY_AVG_WEIGHT * avgCompetitive +
      DIFFICULTY_MIN_WEIGHT * minCompetitive) /
    weightSum;

  return {
    isFallback: false,
    scoreCount,
    appCount,
    avgCompetitive,
    minCompetitive,
    normalizedAppCount,
    rawDifficulty,
    difficultyScore: clamp(rawDifficulty * 100, 1, 100),
    // Floor at 1 to match the public API contract:
    // DiagnosePaidResponse.keywordDiagnosis[].minDifficulty is
    // z.number().int().min(1).max(100). A "no signal in the top group" is
    // already communicated to consumers via `difficultyIsFallback` + `null`,
    // never via a sub-1 minDifficulty.
    minDifficultyScore: clamp(minCompetitive * 100, 1, 100),
  };
}

function hasDifficultyDetails(p: {
  scoreCount: number;
  appCount: number;
}): boolean {
  return (
    p.scoreCount >= TOP_DIFFICULTY_DOC_LIMIT &&
    p.appCount >= TOP_DIFFICULTY_DOC_LIMIT
  );
}

function normalizedAppCountScore(appCount: number): number {
  if (appCount <= 10) return 0;
  if (appCount >= MAX_COMPETING_APPS) return 1;
  return clamp((appCount - 10) / (MAX_COMPETING_APPS - 10), 0, 1);
}

// Piecewise-linear: ≤1 rpd → [0, 0.25]; 1..100 → [0.25, 1]; ≥100 → 1.
// The kink at rpd=1 reflects "below 1 review/day is barely a signal,
// above 100 is saturation".
function normalizeRatingCountPerDay(ratingPerDay: number): number {
  if (ratingPerDay <= 0) return 0;
  if (ratingPerDay <= RATING_PER_DAY_THRESHOLD) {
    return ratingPerDay * RATING_PER_DAY_MAP_THRESHOLD;
  }
  if (ratingPerDay < RATING_PER_DAY_MAX) {
    const t =
      (ratingPerDay - RATING_PER_DAY_THRESHOLD) /
      (RATING_PER_DAY_MAX - RATING_PER_DAY_THRESHOLD);
    return RATING_PER_DAY_MAP_THRESHOLD + (1 - RATING_PER_DAY_MAP_THRESHOLD) * t;
  }
  return 1;
}

// 0 below 3-star avg (an app no user likes contributes nothing to keyword
// difficulty no matter how many ratings it has). Above 3, the lift is
// confidence-weighted by ratingCount with saturation at LOW_RATING_COUNT_THRESHOLD.
function normalizeAvgRating(avgRating: number, ratingCount: number): number {
  if (avgRating <= MIN_RATING_FOR_POSITIVE_SCORE) return 0;
  let normalized =
    (avgRating - MIN_RATING_FOR_POSITIVE_SCORE) /
    (5 - MIN_RATING_FOR_POSITIVE_SCORE);
  normalized = clamp(normalized, 0, 1);
  return (
    (normalized * Math.min(ratingCount, LOW_RATING_COUNT_THRESHOLD)) /
    LOW_RATING_COUNT_THRESHOLD
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function nonNegative(value: number): number {
  return Math.max(0, finiteOr(value, 0));
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
