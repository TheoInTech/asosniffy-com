import { describe, expect, it } from "vitest";
import {
  competitorScore,
  computeKeywordDifficulty,
  type CompetitorScoreInput,
} from "../../src/scoring/keyword-difficulty.js";

function makeApp(
  overrides: Partial<CompetitorScoreInput> = {},
): CompetitorScoreInput {
  return {
    averageUserRating: 4.5,
    userRatingCount: 1000,
    daysSinceLastRelease: 30,
    daysSinceFirstRelease: 365,
    keywordMatch: "titleExactPhrase",
    ...overrides,
  };
}

describe("competitorScore", () => {
  it("scales score linearly with userRatingCount up to MAX_RATINGS", () => {
    const low = competitorScore(makeApp({ userRatingCount: 100 }));
    const mid = competitorScore(makeApp({ userRatingCount: 5_000 }));
    const high = competitorScore(makeApp({ userRatingCount: 50_000 }));
    expect(low.score).toBeLessThan(mid.score);
    expect(mid.score).toBeLessThanOrEqual(high.score);
    expect(high.normalizedRatingCount).toBe(1);
  });

  it("zeroes the avg-rating contribution when avg <= 3", () => {
    const bad = competitorScore(makeApp({ averageUserRating: 2.5 }));
    expect(bad.normalizedAvgRating).toBe(0);
  });

  it("penalizes stale apps via daysSinceLastRelease", () => {
    const fresh = competitorScore(makeApp({ daysSinceLastRelease: 7 }));
    const stale = competitorScore(makeApp({ daysSinceLastRelease: 400 }));
    expect(fresh.normalizedAge).toBeGreaterThan(stale.normalizedAge);
    expect(stale.normalizedAge).toBe(0);
  });

  it("saturates ratingPerDay at 1.0 above 100/day", () => {
    const saturated = competitorScore(
      makeApp({ userRatingCount: 100_000, daysSinceFirstRelease: 100 }),
    );
    expect(saturated.normalizedRatingPerDay).toBe(1);
  });

  it("maps ratingPerDay = 1 to exactly the piecewise threshold", () => {
    const atThreshold = competitorScore(
      makeApp({ userRatingCount: 365, daysSinceFirstRelease: 365 }),
    );
    expect(atThreshold.ratingPerDay).toBeCloseTo(1, 5);
    // RATING_PER_DAY_MAP_THRESHOLD = 0.25
    expect(atThreshold.normalizedRatingPerDay).toBeCloseTo(0.25, 5);
  });

  it("clamps daysSinceFirstRelease to 1 to avoid Infinity on day-0 apps", () => {
    const newborn = competitorScore(
      makeApp({ userRatingCount: 10, daysSinceFirstRelease: 0 }),
    );
    expect(Number.isFinite(newborn.ratingPerDay)).toBe(true);
    expect(newborn.ratingPerDay).toBe(10);
  });

  it("titleExactPhrase strictly beats titleAllWords for an otherwise-identical app", () => {
    const exact = competitorScore(makeApp({ keywordMatch: "titleExactPhrase" }));
    const all = competitorScore(makeApp({ keywordMatch: "titleAllWords" }));
    expect(exact.score).toBeGreaterThan(all.score);
  });
});

describe("computeKeywordDifficulty", () => {
  it("returns isFallback when fewer than 5 competitor scores are supplied", () => {
    const result = computeKeywordDifficulty({
      competitiveScores: [0.5, 0.6, 0.7, 0.8],
      appCount: 200,
    });
    expect(result.isFallback).toBe(true);
    expect(result.difficultyScore).toBe(1);
  });

  it("returns isFallback when appCount is below the gate", () => {
    const result = computeKeywordDifficulty({
      competitiveScores: [0.5, 0.6, 0.7, 0.8, 0.9],
      appCount: 3,
    });
    expect(result.isFallback).toBe(true);
  });

  it("computes difficulty when both gates pass", () => {
    const result = computeKeywordDifficulty({
      competitiveScores: [0.9, 0.85, 0.8, 0.75, 0.7],
      appCount: 200,
    });
    expect(result.isFallback).toBe(false);
    expect(result.avgCompetitive).toBeCloseTo(0.8, 2);
    expect(result.minCompetitive).toBe(0.7);
    expect(result.normalizedAppCount).toBe(1);
    expect(result.difficultyScore).toBeGreaterThan(70);
    expect(result.difficultyScore).toBeLessThanOrEqual(100);
  });

  it("clamps difficultyScore to a minimum of 1", () => {
    const result = computeKeywordDifficulty({
      competitiveScores: [0, 0, 0, 0, 0],
      appCount: 20,
    });
    expect(result.difficultyScore).toBeGreaterThanOrEqual(1);
  });

  it("ramps normalizedAppCount linearly between 10 and 200 apps", () => {
    const scores = [0.5, 0.5, 0.5, 0.5, 0.5];
    const small = computeKeywordDifficulty({ competitiveScores: scores, appCount: 10 });
    const mid = computeKeywordDifficulty({ competitiveScores: scores, appCount: 105 });
    const big = computeKeywordDifficulty({ competitiveScores: scores, appCount: 200 });
    expect(small.normalizedAppCount).toBe(0);
    expect(mid.normalizedAppCount).toBeCloseTo(0.5, 2);
    expect(big.normalizedAppCount).toBe(1);
  });

  it("weighs minCompetitive more heavily than avgCompetitive", () => {
    // Two scenarios with the same average (0.6) but different min.
    const evenScores = [0.6, 0.6, 0.6, 0.6, 0.6]; // avg 0.6, min 0.6
    const skewedScores = [0.9, 0.8, 0.7, 0.5, 0.1]; // avg 0.6, min 0.1
    const even = computeKeywordDifficulty({ competitiveScores: evenScores, appCount: 200 });
    const skewed = computeKeywordDifficulty({ competitiveScores: skewedScores, appCount: 200 });
    expect(even.avgCompetitive).toBeCloseTo(skewed.avgCompetitive, 5);
    // even has higher min → higher difficulty (min weighed 4x vs avg 2x)
    expect(even.difficultyScore).toBeGreaterThan(skewed.difficultyScore);
  });

  it("respects enforceTopFiveGate=false for early-phase rollouts", () => {
    const result = computeKeywordDifficulty({
      competitiveScores: [0.8, 0.6],
      appCount: 100,
      enforceTopFiveGate: false,
    });
    expect(result.isFallback).toBe(false);
    expect(result.scoreCount).toBe(2);
  });
});
