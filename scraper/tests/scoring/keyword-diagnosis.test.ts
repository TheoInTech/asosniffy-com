import { describe, expect, it } from "vitest";
import { diagnoseKeywords } from "../../src/scoring/keyword-diagnosis.js";
import type { AppRecord } from "../../src/providers/apple/types.js";
import type { KeywordRankDatum } from "../../src/data/report-data.js";

function makeApp(overrides: Partial<AppRecord> = {}): AppRecord {
  return {
    id: "1",
    name: "Pawprint Habits",
    developer: "Sniffy Labs",
    primaryCategory: "Productivity",
    subtitle: "Daily Routine & Streaks",
    description: "Pawprint Habits is a habit tracker for daily routines.",
    ratingsSummary: { average: 4.6, count: 1200 },
    screenshots: [],
    currentVersion: "1.0",
    provenance: "live",
    ...overrides,
  };
}

function rank(
  keyword: string,
  bucket: KeywordRankDatum["rankBucket"],
  prov: KeywordRankDatum["provenance"] = "live",
): KeywordRankDatum {
  return { keyword, rankBucket: bucket, confidence: "medium", provenance: prov };
}

describe("diagnoseKeywords", () => {
  it("returns one entry per input keyword", () => {
    const result = diagnoseKeywords({
      keywords: ["habit tracker", "daily routine", "streaks"],
      ranks: [rank("habit tracker", "11-30"), rank("daily routine", "51-100")],
      app: makeApp(),
    });
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.keyword)).toEqual([
      "habit tracker",
      "daily routine",
      "streaks",
    ]);
  });

  it("flags coverageInTitle/coverageInSubtitle accurately", () => {
    const result = diagnoseKeywords({
      keywords: ["streaks", "habit tracker"],
      ranks: [],
      app: makeApp(),
    });
    const streaks = result.find((r) => r.keyword === "streaks")!;
    const habit = result.find((r) => r.keyword === "habit tracker")!;
    // Subtitle "Daily Routine & Streaks" contains "streaks" but not "habit tracker".
    expect(streaks.coverageInSubtitle).toBe(true);
    expect(habit.coverageInSubtitle).toBe(false);
    // Title "Pawprint Habits" contains neither full phrase.
    expect(streaks.coverageInTitle).toBe(false);
    expect(habit.coverageInTitle).toBe(false);
  });

  it("recommends `add_to_title` for high-intent uncovered keywords", () => {
    const result = diagnoseKeywords({
      keywords: ["habit tracker"],
      ranks: [rank("habit tracker", "31-50")],
      app: makeApp({ name: "BrandOnly", subtitle: "An app for everyone" }),
    });
    expect(result[0]!.action).toBe("add_to_title");
  });

  it("recommends `add_to_subtitle` for medium-intent uncovered keywords", () => {
    // "morning meditation" has no HIGH_INTENT_TOKENS but the 2-word bonus
    // lifts it into the medium band (~0.65) — exactly the case `add_to_subtitle`
    // is designed for.
    const result = diagnoseKeywords({
      keywords: ["morning meditation"],
      ranks: [rank("morning meditation", "51-100")],
      app: makeApp({ name: "BrandOnly", subtitle: "Tracker for everyone" }),
    });
    expect(result[0]!.action).toBe("add_to_subtitle");
  });

  it("recommends `drop` for low-intent, not-ranking, no-coverage keywords", () => {
    const result = diagnoseKeywords({
      keywords: ["best free app"],
      ranks: [rank("best free app", "not_found")],
      app: makeApp({ name: "BrandOnly", subtitle: "A focused product" }),
    });
    expect(result[0]!.action).toBe("drop");
  });

  it("preserves provenance from the rank source", () => {
    const result = diagnoseKeywords({
      keywords: ["habit tracker", "daily routine"],
      ranks: [
        rank("habit tracker", "11-30", "live"),
        rank("daily routine", "51-100", "cached"),
      ],
      app: makeApp(),
    });
    expect(result.find((r) => r.keyword === "habit tracker")?.provenance).toBe("live");
    expect(result.find((r) => r.keyword === "daily routine")?.provenance).toBe("cached");
  });

  it("falls back to not_found + fixture provenance when no rank datum present", () => {
    const result = diagnoseKeywords({
      keywords: ["new keyword"],
      ranks: [],
      app: makeApp(),
    });
    expect(result[0]!.rankBucket).toBe("not_found");
    expect(result[0]!.provenance).toBe("fixture");
    expect(result[0]!.confidence).toBe("low");
  });

  it("is deterministic for identical input", () => {
    const input = {
      keywords: ["habit tracker", "daily routine"],
      ranks: [rank("habit tracker", "11-30")],
      app: makeApp(),
    };
    expect(diagnoseKeywords(input)).toEqual(diagnoseKeywords(input));
  });
});
