import { describe, expect, it } from "vitest";
import {
  computeChance,
  computeKei,
  computeObservablePopularity,
  estimateMaxDailyImpressions,
  type PopularitySignalInput,
} from "../../src/scoring/keyword-popularity.js";

function makeApp(
  overrides: Partial<PopularitySignalInput["topApps"][number]> = {},
): PopularitySignalInput["topApps"][number] {
  return {
    name: "Habit Tracker",
    averageUserRating: 4.6,
    userRatingCount: 50_000,
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<PopularitySignalInput> = {},
): PopularitySignalInput {
  return {
    keyword: "habit tracker",
    appCount: 120,
    topApps: [
      makeApp({ name: "Habit Tracker", userRatingCount: 120_000 }),
      makeApp({ name: "Daily Habits — Tracker", userRatingCount: 40_000 }),
      makeApp({ name: "Streaks", userRatingCount: 25_000 }),
      makeApp({ name: "Focus Timer", userRatingCount: 800 }),
      makeApp({ name: "Routinely", userRatingCount: 300 }),
    ],
    autocompleteRank: 3,
    ...overrides,
  };
}

describe("computeObservablePopularity", () => {
  it("is deterministic for identical input", () => {
    const a = computeObservablePopularity(makeInput());
    const b = computeObservablePopularity(makeInput());
    expect(a).toEqual(b);
  });

  it("returns an integer score in [5, 100] tagged obs-1", () => {
    const result = computeObservablePopularity(makeInput());
    expect(result).not.toBeNull();
    expect(Number.isInteger(result!.score)).toBe(true);
    expect(result!.score).toBeGreaterThanOrEqual(5);
    expect(result!.score).toBeLessThanOrEqual(100);
    expect(result!.methodologyVersion).toBe("obs-1");
  });

  // --- Honesty gates ---

  it("returns null when topApps < 3 AND appCount is null AND autocompleteRank is null", () => {
    const result = computeObservablePopularity(
      makeInput({
        topApps: [makeApp(), makeApp()],
        appCount: null,
        autocompleteRank: null,
      }),
    );
    expect(result).toBeNull();
  });

  it("computes when only appCount is available", () => {
    const result = computeObservablePopularity(
      makeInput({ topApps: [], appCount: 80, autocompleteRank: null }),
    );
    expect(result).not.toBeNull();
    // SERP-derived signals report 0 (unobserved), never fabricated values.
    expect(result!.components.leaderStrength).toBe(0);
    expect(result!.components.titleMatchDensity).toBe(0);
    expect(result!.components.marketDepth).toBe(0);
    expect(result!.components.exactPhraseBonus).toBe(0);
  });

  it("computes when only autocompleteRank is available", () => {
    const result = computeObservablePopularity(
      makeInput({ topApps: [], appCount: null, autocompleteRank: 1 }),
    );
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(5);
  });

  it("returns null for an empty / token-free keyword", () => {
    expect(computeObservablePopularity(makeInput({ keyword: "  " }))).toBeNull();
    expect(computeObservablePopularity(makeInput({ keyword: "!!!" }))).toBeNull();
  });

  it("treats topApps below the 3-app SERP minimum as unobserved, not as a tiny sample", () => {
    const result = computeObservablePopularity(
      makeInput({
        topApps: [makeApp({ userRatingCount: 1_000_000 })],
        appCount: 150,
        autocompleteRank: null,
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.components.leaderStrength).toBe(0);
    expect(result!.components.marketDepth).toBe(0);
  });

  // --- Monotonicity ---

  it("more rating volume in the leaders raises leaderStrength and the score", () => {
    const weak = computeObservablePopularity(
      makeInput({
        topApps: makeInput().topApps.map((a) => ({ ...a, userRatingCount: 500 })),
      }),
    );
    const strong = computeObservablePopularity(
      makeInput({
        topApps: makeInput().topApps.map((a) => ({
          ...a,
          userRatingCount: 500_000,
        })),
      }),
    );
    expect(strong!.components.leaderStrength).toBeGreaterThan(
      weak!.components.leaderStrength,
    );
    expect(strong!.score).toBeGreaterThan(weak!.score);
  });

  it("longer, more specific keywords carry a larger specificityPenalty and a lower score", () => {
    // Names match neither keyword so title signals stay constant at 0.
    const neutralApps = [
      makeApp({ name: "Alpha", userRatingCount: 50_000 }),
      makeApp({ name: "Beta", userRatingCount: 50_000 }),
      makeApp({ name: "Gamma", userRatingCount: 50_000 }),
    ];
    const short = computeObservablePopularity(
      makeInput({ keyword: "chess", topApps: neutralApps, autocompleteRank: null }),
    );
    const long = computeObservablePopularity(
      makeInput({
        keyword: "chess opening trainer for beginners",
        topApps: neutralApps,
        autocompleteRank: null,
      }),
    );
    expect(long!.components.specificityPenalty).toBeGreaterThan(
      short!.components.specificityPenalty,
    );
    expect(long!.score).toBeLessThan(short!.score);
  });

  it("single short token carries zero specificityPenalty; penalty follows token and char count", () => {
    const short = computeObservablePopularity(makeInput({ keyword: "chess" }));
    expect(short!.components.specificityPenalty).toBe(0);
    // "habit tracker" = 2 tokens, 13 normalized chars:
    // 0.22 * (2 - 1) + 0.015 * (13 - 12) = 0.235
    const two = computeObservablePopularity(makeInput({ keyword: "habit tracker" }));
    expect(two!.components.specificityPenalty).toBeCloseTo(0.235, 4);
  });

  // --- Title-derived signals ---

  it("titleMatchDensity is the fraction of topApps whose name carries all keyword tokens", () => {
    const result = computeObservablePopularity(
      makeInput({
        keyword: "habit tracker",
        topApps: [
          makeApp({ name: "Habit Tracker" }), // exact phrase
          makeApp({ name: "Daily Habits — Tracker" }), // all words
          makeApp({ name: "Focus" }), // none
        ],
      }),
    );
    expect(result!.components.titleMatchDensity).toBeCloseTo(2 / 3, 4);
    expect(result!.components.exactPhraseBonus).toBeCloseTo(1 / 3, 4);
  });

  it("exact-phrase titles score a higher exactPhraseBonus than scrambled-word titles", () => {
    const exact = computeObservablePopularity(
      makeInput({
        topApps: [
          makeApp({ name: "Habit Tracker" }),
          makeApp({ name: "Habit Tracker Pro" }),
          makeApp({ name: "My Habit Tracker" }),
        ],
      }),
    );
    const scrambled = computeObservablePopularity(
      makeInput({
        topApps: [
          makeApp({ name: "Tracker of Habits" }),
          makeApp({ name: "Tracker for Every Habit" }),
          makeApp({ name: "Habit & Sleep Tracker" }),
        ],
      }),
    );
    expect(exact!.components.exactPhraseBonus).toBeGreaterThan(
      scrambled!.components.exactPhraseBonus,
    );
  });

  it("marketDepth is the fraction of topApps at or above the 1,000-rating floor", () => {
    const result = computeObservablePopularity(
      makeInput({
        topApps: [
          makeApp({ userRatingCount: 5_000 }),
          makeApp({ userRatingCount: 2_000 }),
          makeApp({ userRatingCount: 800 }),
          makeApp({ userRatingCount: null }),
          makeApp({ userRatingCount: 100 }),
        ],
      }),
    );
    expect(result!.components.marketDepth).toBeCloseTo(2 / 5, 4);
  });

  // --- Autocomplete boost ---

  it("autocomplete presence boosts the score; rank 1 beats rank 10 beats absent", () => {
    const base = makeInput({ autocompleteRank: null });
    const absent = computeObservablePopularity(base);
    const rank10 = computeObservablePopularity({ ...base, autocompleteRank: 10 });
    const rank1 = computeObservablePopularity({ ...base, autocompleteRank: 1 });
    expect(rank1!.score).toBeGreaterThan(rank10!.score);
    expect(rank10!.score).toBeGreaterThan(absent!.score);
    expect(absent!.components.autocompleteBoost).toBe(0);
    expect(rank1!.components.autocompleteBoost).toBe(1);
  });

  it("ranks beyond the decay range still earn the presence floor", () => {
    const r50 = computeObservablePopularity(makeInput({ autocompleteRank: 50 }));
    expect(r50!.components.autocompleteBoost).toBeCloseTo(0.1, 4);
  });

  it("ignores invalid autocomplete ranks (< 1, non-finite) instead of fabricating a boost", () => {
    const invalid = computeObservablePopularity(makeInput({ autocompleteRank: 0 }));
    expect(invalid!.components.autocompleteBoost).toBe(0);
  });

  // --- Clamping ---

  it("clamps a maximal head term to exactly 100", () => {
    const result = computeObservablePopularity({
      keyword: "chess",
      appCount: 200,
      topApps: Array.from({ length: 10 }, () =>
        makeApp({ name: "Chess", userRatingCount: 2_000_000 }),
      ),
      autocompleteRank: 1,
    });
    expect(result!.score).toBe(100);
  });

  it("floors a hopeless long-tail at exactly 5 (the ASA floor analog)", () => {
    const result = computeObservablePopularity({
      keyword: "hyperlocal artisanal kombucha brewing logbook",
      appCount: 1,
      topApps: [
        makeApp({ name: "Alpha", userRatingCount: 0 }),
        makeApp({ name: "Beta", userRatingCount: 0 }),
        makeApp({ name: "Gamma", userRatingCount: 0 }),
      ],
      autocompleteRank: null,
    });
    expect(result!.score).toBe(5);
  });

  it("never produces NaN when rating fields are null", () => {
    const result = computeObservablePopularity(
      makeInput({
        topApps: [
          makeApp({ averageUserRating: null, userRatingCount: null }),
          makeApp({ averageUserRating: null, userRatingCount: null }),
          makeApp({ averageUserRating: null, userRatingCount: null }),
        ],
      }),
    );
    expect(result).not.toBeNull();
    expect(Number.isFinite(result!.score)).toBe(true);
    for (const value of Object.values(result!.components)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});

describe("estimateMaxDailyImpressions", () => {
  it("matches the SplitMetrics/Phiture exponential at SP=50, shipped as a ±50% range", () => {
    const point = 254.44 * Math.exp(0.0615 * 50);
    const result = estimateMaxDailyImpressions(50);
    expect(result.low).toBe(Math.round(point * 0.5));
    expect(result.high).toBe(Math.round(point * 1.5));
    expect(result.source).toBe("SplitMetrics/Phiture");
    expect(result.year).toBe(2019);
    // Published lookup table sanity: SP 50 ≈ 5,500 impressions/day.
    expect(point).toBeGreaterThan(5_000);
    expect(point).toBeLessThan(6_000);
  });

  it("is monotonically increasing in popularity", () => {
    const low = estimateMaxDailyImpressions(20);
    const high = estimateMaxDailyImpressions(80);
    expect(high.low).toBeGreaterThan(low.low);
    expect(high.high).toBeGreaterThan(low.high);
  });

  it("clamps popularity into the 5..100 scale domain", () => {
    expect(estimateMaxDailyImpressions(200)).toEqual(
      estimateMaxDailyImpressions(100),
    );
    expect(estimateMaxDailyImpressions(0)).toEqual(estimateMaxDailyImpressions(5));
  });
});

describe("computeChance", () => {
  const topScores = [0.5, 0.6, 0.7, 0.8, 0.4];

  it("returns 100 when the target outscores every top app", () => {
    expect(
      computeChance({ targetCompetitiveScore: 0.9, topCompetitiveScores: topScores }),
    ).toBe(100);
  });

  it("returns 1 when the target outscores none", () => {
    expect(
      computeChance({ targetCompetitiveScore: 0.1, topCompetitiveScores: topScores }),
    ).toBe(1);
  });

  it("places a mid-pack target proportionally (3 of 5 beaten → 60)", () => {
    expect(
      computeChance({
        targetCompetitiveScore: 0.65,
        topCompetitiveScores: topScores,
      }),
    ).toBe(60);
  });

  it("orders chance by target strength", () => {
    const weaker = computeChance({
      targetCompetitiveScore: 0.55,
      topCompetitiveScores: topScores,
    });
    const stronger = computeChance({
      targetCompetitiveScore: 0.75,
      topCompetitiveScores: topScores,
    });
    expect(stronger!).toBeGreaterThan(weaker!);
  });

  it("gives ties half credit", () => {
    // beaten = 1.5 of 3 → 1 + 99 * 0.5 = 50.5 → 51
    expect(
      computeChance({
        targetCompetitiveScore: 0.5,
        topCompetitiveScores: [0.5, 0.5, 0.5],
      }),
    ).toBe(51);
  });

  it("returns null when the target score is null", () => {
    expect(
      computeChance({ targetCompetitiveScore: null, topCompetitiveScores: topScores }),
    ).toBeNull();
  });

  it("returns null with fewer than 3 finite top scores", () => {
    expect(
      computeChance({
        targetCompetitiveScore: 0.5,
        topCompetitiveScores: [0.4, 0.6],
      }),
    ).toBeNull();
    expect(
      computeChance({
        targetCompetitiveScore: 0.5,
        topCompetitiveScores: [0.4, Number.NaN, 0.6],
      }),
    ).toBeNull();
  });
});

describe("computeKei", () => {
  it("returns null unless both popularity and chance are present", () => {
    expect(computeKei(null, 50)).toBeNull();
    expect(computeKei(50, null)).toBeNull();
    expect(computeKei(null, null)).toBeNull();
  });

  it("is the geometric mean of popularity and chance, on the same 1..100 scale", () => {
    expect(computeKei(64, 36)).toBe(48); // sqrt(64 * 36) = 48
    expect(computeKei(100, 100)).toBe(100);
  });

  it("rounds and floors at 1 for floor-value inputs", () => {
    expect(computeKei(5, 1)).toBe(2); // sqrt(5) ≈ 2.24
    const result = computeKei(5, 1);
    expect(result).toBeGreaterThanOrEqual(1);
  });

  it("rewards balanced keywords over one-sided ones with the same sum", () => {
    // 50+50 vs 95+5: geometric mean punishes imbalance.
    expect(computeKei(50, 50)!).toBeGreaterThan(computeKei(95, 5)!);
  });
});
