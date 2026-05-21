import { describe, expect, it } from "vitest";
import { diagnoseKeywords } from "../../src/scoring/keyword-diagnosis.js";
import type { AppRecord } from "../../src/providers/apple/types.js";
import type { KeywordRankDatum } from "../../src/data/report-data.js";

// Regression test pinned to the Tally case: a 35-day-old app with 0.11
// ratings/day shouldn't be told to drop its niche keywords just because
// they aren't ranking yet. `not_found` on a brand-new listing is "still
// seeding," not "low intent." Without the lifecycle gate the previous
// build flagged DUPR (the official pickleball rating system, the most
// niche-relevant keyword the app could possibly own) for drop.

function dayMs(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function makeSeedingApp(): AppRecord {
  return {
    id: "1",
    name: "Tally: Everything Pickleball",
    developer: "Tally",
    primaryCategory: "Sports",
    subtitle: "Scoring, drills & overlays",
    description: "Pickleball scoring and drills.",
    ratingsSummary: { average: 5.0, count: 4 },
    releaseDate: new Date(dayMs(35)).toISOString(),
    screenshots: [],
    currentVersion: "1.0",
    provenance: "live",
  };
}

function makeMatureApp(): AppRecord {
  return {
    id: "2",
    name: "Brand Only",
    developer: "Brand",
    primaryCategory: "Productivity",
    subtitle: "A focused product",
    description: "An established app with broad use.",
    ratingsSummary: { average: 4.5, count: 5000 },
    releaseDate: new Date(dayMs(800)).toISOString(),
    screenshots: [],
    currentVersion: "1.0",
    provenance: "live",
  };
}

function notFound(keyword: string): KeywordRankDatum {
  return {
    keyword,
    rankBucket: "not_found",
    confidence: "low",
    provenance: "live",
  };
}

describe("diagnoseKeywords — lifecycle gate on drop", () => {
  it("does NOT drop niche keywords on a seeding app (young + low velocity)", () => {
    const result = diagnoseKeywords({
      keywords: ["dupr", "scoreboard"],
      ranks: [notFound("dupr"), notFound("scoreboard")],
      app: makeSeedingApp(),
    });
    for (const item of result) {
      expect(item.action).not.toBe("drop");
    }
  });

  it("still drops low-intent generic phrases on a mature app", () => {
    const result = diagnoseKeywords({
      keywords: ["best free app"],
      ranks: [notFound("best free app")],
      app: makeMatureApp(),
    });
    expect(result[0]!.action).toBe("drop");
  });

  it("surfaces 'still seeding' rationale in the keyword recommendation prose", async () => {
    // The deterministic-prose layer reads `isAppSeeding` to swap the
    // recommendation copy for `keep_in_keywords_field + not_found` on a
    // seeding listing. We invoke the prose builder directly via the
    // module under test to keep the assertion local.
    const { buildKeywordRecommendation } = await import(
      "../../src/synthesis/deterministic-prose.js"
    );
    const result = diagnoseKeywords({
      keywords: ["dupr"],
      ranks: [notFound("dupr")],
      app: makeSeedingApp(),
    });
    const prose = buildKeywordRecommendation(result[0]!);
    expect(prose.toLowerCase()).toMatch(/still seeding|re-check|seeding/);
  });
});
