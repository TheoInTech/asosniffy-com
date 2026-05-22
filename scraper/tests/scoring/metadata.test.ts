import { describe, expect, it } from "vitest";
import {
  APPLE_CAPS,
  METADATA_WEIGHTS,
  composeOverall,
  scoreKeywordRankings,
  scoreMetadata,
  scoreMetadataFull,
  scoreRatingsAndReviews,
} from "../../src/scoring/metadata.js";
import type { AppRecord } from "../../src/providers/apple/types.js";

const ZERO_SUB = { score: 0, reasons: [], negativeReasons: [] };

function makeApp(overrides: Partial<AppRecord> = {}): AppRecord {
  return {
    id: "1",
    name: "Pawprint Habits",
    developer: "Sniffy Labs",
    primaryCategory: "Productivity",
    subtitle: "Daily Routine & Streaks",
    description:
      "Pawprint Habits turns your daily routines into streaks you actually keep. Build habits, track progress, and start your day on track. Download free and try the habit tracker built for indie hackers.",
    ratingsSummary: { average: 4.6, count: 1200 },
    screenshots: [],
    currentVersion: "1.0",
    provenance: "live",
    ...overrides,
  };
}

describe("scoreMetadata", () => {
  it("returns all six subscores with reasons", () => {
    const result = scoreMetadata({
      app: makeApp(),
      detectedApp: { id: "1", name: "Pawprint Habits", developer: "Sniffy" },
      keywords: ["habit tracker", "daily routine"],
      rankedKeywords: [{ rankBucket: "1-10" }, { rankBucket: "11-30" }],
    });

    expect(result.title.reasons.length).toBeGreaterThan(0);
    expect(result.subtitle.reasons.length).toBeGreaterThan(0);
    expect(result.keywordsField.reasons.length).toBeGreaterThan(0);
    expect(result.description.reasons.length).toBeGreaterThan(0);
    expect(result.ratingsAndReviews.reasons.length).toBeGreaterThan(0);
    expect(result.keywordRankings.reasons.length).toBeGreaterThan(0);
  });

  it("penalizes title that exceeds the 30-char cap", () => {
    const longName = "A".repeat(APPLE_CAPS.title + 5);
    const result = scoreMetadata({
      app: makeApp({ name: longName }),
      detectedApp: { id: "1", name: longName, developer: "Sniffy" },
      keywords: ["habit"],
    });
    expect(result.title.score).toBeLessThan(50);
    expect(result.title.reasons.some((r) => r.includes("truncate"))).toBe(true);
  });

  it("rewards subtitles that lead with the primary keyword", () => {
    const leading = scoreMetadata({
      app: makeApp({ subtitle: "Habit Tracker & Streaks" }),
      detectedApp: { id: "1", name: "Brand", developer: "X" },
      keywords: ["habit tracker"],
    }).subtitle;
    const trailing = scoreMetadata({
      app: makeApp({ subtitle: "Streaks & Habit Tracker" }),
      detectedApp: { id: "1", name: "Brand", developer: "X" },
      keywords: ["habit tracker"],
    }).subtitle;
    expect(leading.score).toBeGreaterThan(trailing.score);
  });

  it("penalizes empty subtitle", () => {
    const result = scoreMetadata({
      app: makeApp({ subtitle: "" }),
      detectedApp: { id: "1", name: "Brand", developer: "X" },
      keywords: ["habit"],
    });
    expect(result.subtitle.score).toBeLessThanOrEqual(30);
  });

  it("emits 'source unavailable' (not 'empty') when storefront fetch was degraded", () => {
    const result = scoreMetadata({
      app: makeApp({ subtitle: "", subtitleProvenance: "degraded" }),
      detectedApp: { id: "1", name: "Brand", developer: "X" },
      keywords: ["habit"],
    });
    expect(result.subtitle.reasons[0]?.toLowerCase()).toContain(
      "source unavailable",
    );
  });

  it("claims subtitle empty honestly when storefront fetch succeeded", () => {
    const result = scoreMetadata({
      app: makeApp({ subtitle: "", subtitleProvenance: "live" }),
      detectedApp: { id: "1", name: "Brand", developer: "X" },
      keywords: ["habit"],
    });
    expect(result.subtitle.reasons[0]?.toLowerCase()).toContain("empty");
  });

  it("flags keyword-field duplicates with title/subtitle words", () => {
    const result = scoreMetadata({
      app: makeApp({ name: "Habit Brand", subtitle: "Tracker Streaks" }),
      detectedApp: { id: "1", name: "Habit Brand", developer: "X" },
      keywords: ["habit", "tracker", "streaks"],
    });
    expect(
      result.keywordsField.reasons.some((r) =>
        r.toLowerCase().includes("duplicate"),
      ),
    ).toBe(true);
  });

  it("is deterministic for identical input", () => {
    const a = scoreMetadataFull({
      app: makeApp(),
      detectedApp: { id: "1", name: "Pawprint Habits", developer: "Sniffy" },
      keywords: ["habit tracker"],
    });
    const b = scoreMetadataFull({
      app: makeApp(),
      detectedApp: { id: "1", name: "Pawprint Habits", developer: "Sniffy" },
      keywords: ["habit tracker"],
    });
    expect(a).toEqual(b);
  });
});

describe("composeOverall", () => {
  it("isolates the title weight when only title scores", () => {
    const overall = composeOverall({
      title: { score: 100, reasons: [], negativeReasons: [] },
      subtitle: ZERO_SUB,
      keywordsField: ZERO_SUB,
      description: ZERO_SUB,
      ratingsAndReviews: ZERO_SUB,
      keywordRankings: ZERO_SUB,
    });
    expect(overall).toBe(Math.round(METADATA_WEIGHTS.title * 100));
  });

  it("treats overall as the weighted sum to ±1 rounding", () => {
    const parts = {
      title: { score: 80, reasons: [], negativeReasons: [] },
      subtitle: { score: 60, reasons: [], negativeReasons: [] },
      keywordsField: { score: 50, reasons: [], negativeReasons: [] },
      description: { score: 70, reasons: [], negativeReasons: [] },
      ratingsAndReviews: { score: 95, reasons: [], negativeReasons: [] },
      keywordRankings: { score: 40, reasons: [], negativeReasons: [] },
    };
    const expected =
      parts.title.score * METADATA_WEIGHTS.title +
      parts.subtitle.score * METADATA_WEIGHTS.subtitle +
      parts.keywordsField.score * METADATA_WEIGHTS.keywordsField +
      parts.description.score * METADATA_WEIGHTS.description +
      parts.ratingsAndReviews.score * METADATA_WEIGHTS.ratingsAndReviews +
      parts.keywordRankings.score * METADATA_WEIGHTS.keywordRankings;
    expect(composeOverall(parts)).toBe(Math.round(expected));
  });

  it("returns an integer 0–100", () => {
    const overall = composeOverall({
      title: { score: 73, reasons: [], negativeReasons: [] },
      subtitle: { score: 61, reasons: [], negativeReasons: [] },
      keywordsField: { score: 44, reasons: [], negativeReasons: [] },
      description: { score: 80, reasons: [], negativeReasons: [] },
      ratingsAndReviews: { score: 50, reasons: [], negativeReasons: [] },
      keywordRankings: { score: 65, reasons: [], negativeReasons: [] },
    });
    expect(Number.isInteger(overall)).toBe(true);
    expect(overall).toBeGreaterThanOrEqual(0);
    expect(overall).toBeLessThanOrEqual(100);
  });

  it("weights sum to 1.0 (so the rubric is honest)", () => {
    const sum =
      METADATA_WEIGHTS.title +
      METADATA_WEIGHTS.subtitle +
      METADATA_WEIGHTS.keywordsField +
      METADATA_WEIGHTS.description +
      METADATA_WEIGHTS.ratingsAndReviews +
      METADATA_WEIGHTS.keywordRankings;
    expect(sum).toBeCloseTo(1.0, 5);
  });
});

describe("scoreRatingsAndReviews", () => {
  function withRatings(average: number, count: number): AppRecord {
    return makeApp({ ratingsSummary: { average, count } });
  }

  it("returns 0 with an honest unavailable note when app is null", () => {
    const result = scoreRatingsAndReviews(null);
    expect(result.score).toBe(0);
    expect(result.reasons[0]?.toLowerCase()).toContain("unavailable");
  });

  it("returns 0 when the count is zero (no ratings at all)", () => {
    const result = scoreRatingsAndReviews(withRatings(0, 0));
    expect(result.score).toBe(0);
  });

  it("scores the strong tier highly", () => {
    const result = scoreRatingsAndReviews(withRatings(4.8, 5000));
    expect(result.score).toBeGreaterThanOrEqual(90);
  });

  it("scores thin rating bases below the mid tier", () => {
    const result = scoreRatingsAndReviews(withRatings(4.5, 30));
    expect(result.score).toBeLessThanOrEqual(40);
    expect(result.reasons[0]).toMatch(/ratings|count/i);
  });

  it("scores sub-3.5 averages low even with many ratings", () => {
    const result = scoreRatingsAndReviews(withRatings(3.1, 10000));
    expect(result.score).toBeLessThanOrEqual(20);
  });
});

describe("scoreKeywordRankings", () => {
  it("returns 0 with an honest note when no ranks are provided", () => {
    const result = scoreKeywordRankings([]);
    expect(result.score).toBe(0);
    expect(result.reasons[0]?.toLowerCase()).toContain("unavailable");
  });

  it("scores 100 when every keyword ranks top-10", () => {
    const result = scoreKeywordRankings([
      { rankBucket: "1-10" },
      { rankBucket: "1-10" },
      { rankBucket: "1-10" },
    ]);
    expect(result.score).toBe(100);
  });

  it("scores 0 when every keyword is not_found", () => {
    const result = scoreKeywordRankings([
      { rankBucket: "not_found" },
      { rankBucket: "not_found" },
    ]);
    expect(result.score).toBe(0);
  });

  it("weights 11-30 at half credit", () => {
    const result = scoreKeywordRankings([
      { rankBucket: "11-30" },
      { rankBucket: "11-30" },
    ]);
    expect(result.score).toBe(50);
  });

  it("surfaces a negative reason when keywords are not_found", () => {
    const result = scoreKeywordRankings([
      { rankBucket: "1-10" },
      { rankBucket: "not_found" },
      { rankBucket: "not_found" },
    ]);
    expect(result.negativeReasons.length).toBeGreaterThan(0);
  });
});

describe("scoreMetadataFull", () => {
  it("returns a complete result with populated overall", () => {
    const result = scoreMetadataFull({
      app: makeApp(),
      detectedApp: { id: "1", name: "Pawprint Habits", developer: "Sniffy" },
      keywords: ["habit tracker", "daily routine"],
    });
    expect(result.overall).toBeGreaterThan(0);
    expect(result.overall).toBeLessThanOrEqual(100);
  });

  it("handles null AppRecord (fixture-only path) without throwing", () => {
    const result = scoreMetadataFull({
      app: null,
      detectedApp: { id: "1", name: "Pawprint Habits", developer: "Sniffy" },
      keywords: ["habit tracker"],
    });
    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.subtitle.reasons.length).toBeGreaterThan(0);
  });
});
