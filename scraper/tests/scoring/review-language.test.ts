import { describe, expect, it } from "vitest";
import { extractReviewLanguageTokens } from "../../src/scoring/review-language.js";
import type { AppRecord } from "../../src/providers/apple/types.js";

// Phase D — Review-language extractor unit tests. Verifies the filter on
// top of reviewKeywordFrequency: ≥2-distinct-review threshold, dedup
// against the user's title/subtitle/description/keywords, brand+category
// exclusion.

function makeAppRecord(overrides: Partial<AppRecord> = {}): AppRecord {
  return {
    id: "T",
    name: "Tally",
    developer: "Tally Inc",
    primaryCategory: "Sports",
    description: "",
    ratingsSummary: { average: 5, count: 100 },
    screenshots: [],
    currentVersion: "1.0",
    provenance: "live",
    ...overrides,
  };
}

describe("extractReviewLanguageTokens", () => {
  it("returns empty when reviewBodies is empty", () => {
    const result = extractReviewLanguageTokens({
      reviewBodies: [],
      appRecord: makeAppRecord(),
      userKeywords: ["pickleball"],
    });
    expect(result.languageTokens).toEqual([]);
  });

  it("surfaces tokens that appear in ≥2 distinct reviews (review-distribution floor)", () => {
    const result = extractReviewLanguageTokens({
      reviewBodies: [
        "Great app for tournament scoring on the court.",
        "Love the tournament feature. Best on the court.",
        "Tournament mode is exactly what I needed.",
      ],
      appRecord: makeAppRecord({
        description: "Pickleball scoring widget.",
      }),
      userKeywords: ["pickleball"],
    });
    expect(result.languageTokens).toContain("tournament");
    expect(result.languageTokens).toContain("court");
  });

  it("drops tokens that appear in only ONE review (single-user echo)", () => {
    const result = extractReviewLanguageTokens({
      reviewBodies: [
        "Tournament mode with leaderboard analytics dashboard widget refresh.",
        "Tournament is great.",
        "Tournament mode is great.",
      ],
      appRecord: makeAppRecord({
        description: "Pickleball companion.",
      }),
      userKeywords: ["pickleball"],
    });
    // "leaderboard" / "analytics" / "dashboard" only appeared in 1 review;
    // they shouldn't surface. "tournament" appears in 3 → surfaces.
    expect(result.languageTokens).toContain("tournament");
    expect(result.languageTokens).not.toContain("leaderboard");
    expect(result.languageTokens).not.toContain("analytics");
    expect(result.languageTokens).not.toContain("dashboard");
  });

  it("dedups tokens already in the user's surface (title/subtitle/description/keywords)", () => {
    const result = extractReviewLanguageTokens({
      reviewBodies: [
        "Great pickleball tournament app for scoring matches.",
        "Pickleball tournament mode is the best.",
        "Tournament scoring is awesome for pickleball.",
      ],
      appRecord: makeAppRecord({
        name: "Tally: Everything Pickleball",
        subtitle: "Pickleball Companion",
        description:
          "The full pickleball scoring suite for tournament directors. " +
          "Track matches and run brackets across the pickleball circuit. " +
          "Used by tournament organizers nationwide for years.",
      }),
      userKeywords: ["pickleball"],
    });
    // "pickleball" appears everywhere in the user's surface → filtered.
    // "tournament" appears in description → filtered.
    expect(result.languageTokens).not.toContain("pickleball");
    expect(result.languageTokens).not.toContain("tournament");
  });

  it("respects the lemmatized comparison (matches 'scoring' in description against 'scored' in reviews)", () => {
    const result = extractReviewLanguageTokens({
      reviewBodies: [
        "I scored 11-9 last night using this app.",
        "Easy to keep track of my scored matches.",
        "Best app for scoring rounds quickly.",
      ],
      appRecord: makeAppRecord({
        name: "Tally",
        description:
          "Tally is the all-in-one app for keeping score on the pickleball court. " +
          "Track your scoring across leagues and tournaments. " +
          "Trusted by pickleball communities for clean scoring.",
      }),
      userKeywords: [],
    });
    // "scored" lemmatizes to "score" (matches "scoring" → "scor" wait that's
    // wrong). Actually the SUFFIX_RULES strip 'ing' to '' and 'ed' to '' —
    // so "scoring" → "scor" and "scored" → "scor". Both collapse to "scor".
    // The surface set will have "scor" from description; the review side
    // will also produce "scor". So "scor" should be filtered.
    expect(result.languageTokens).not.toContain("scor");
    expect(result.languageTokens).not.toContain("scoring");
    expect(result.languageTokens).not.toContain("scored");
  });

  it("filters brand and category tokens", () => {
    const result = extractReviewLanguageTokens({
      reviewBodies: [
        "Tally is the best Tally app for tournament tracking.",
        "I love Tally because Sports apps usually miss this.",
        "Tally beats the other Sports apps in tournament mode.",
      ],
      appRecord: makeAppRecord({
        name: "Tally",
        developer: "Tally Inc",
        primaryCategory: "Sports",
      }),
      userKeywords: [],
    });
    // Brand tokens (tally) and category tokens (sports) excluded by
    // reviewKeywordFrequency via brand/category parameters.
    expect(result.languageTokens).not.toContain("tally");
    expect(result.languageTokens).not.toContain("sports");
    expect(result.languageTokens).toContain("tournament");
  });

  it("respects the topN cap (default 15)", () => {
    // 20 review-distinct tokens; default topN is 15.
    const bodies: string[] = [];
    const tokens = [
      "tournament", "scoring", "drills", "bracket", "overlays",
      "league", "match", "court", "round", "rally",
      "serve", "return", "smash", "dink", "volley",
      "score", "point", "game", "set", "win",
    ];
    // 3 reviews per token (each token in 3 distinct reviews).
    for (const t of tokens) {
      bodies.push(`This ${t} is great.`);
      bodies.push(`I love this ${t}.`);
      bodies.push(`Best ${t} ever.`);
    }
    const result = extractReviewLanguageTokens({
      reviewBodies: bodies,
      appRecord: makeAppRecord(),
      userKeywords: [],
    });
    expect(result.languageTokens.length).toBeLessThanOrEqual(15);
  });

  it("explicit topN parameter caps output", () => {
    const result = extractReviewLanguageTokens({
      reviewBodies: [
        "tournament court scoring drills bracket overlays league",
        "tournament court scoring drills bracket overlays league",
        "tournament court scoring drills bracket overlays league",
      ],
      appRecord: makeAppRecord({ description: "" }),
      userKeywords: [],
      topN: 3,
    });
    expect(result.languageTokens.length).toBeLessThanOrEqual(3);
  });
});
