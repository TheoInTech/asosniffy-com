import { describe, expect, it } from "vitest";
import { computeKeywordDistribution } from "../../src/scoring/keyword-distribution.js";

// Phase G regression — cross-field keyword distribution matrix. The
// matrix data backs both the UI coverage view and the "move" prose; both
// need correct per-field presence classification.

describe("computeKeywordDistribution", () => {
  it("marks a keyword present in title as 'exact'", () => {
    const rows = computeKeywordDistribution({
      keywords: ["pickleball"],
      fields: {
        title: "Tally: Everything Pickleball",
        subtitle: "",
        keywordsField: [],
        description: "",
      },
    });
    expect(rows[0]!.locations.title).toBe("exact");
  });

  it("marks a keyword present in BOTH keywords field AND title as 'duplicate' in kwField", () => {
    const rows = computeKeywordDistribution({
      keywords: ["pickleball"],
      fields: {
        title: "Tally: Everything Pickleball",
        subtitle: "",
        keywordsField: ["pickleball"],
        description: "",
      },
    });
    expect(rows[0]!.locations.title).toBe("exact");
    expect(rows[0]!.locations.keywordsField).toBe("duplicate");
  });

  it("emits a 'drop from keywords field' move when duplicate is detected", () => {
    const rows = computeKeywordDistribution({
      keywords: ["pickleball"],
      fields: {
        title: "Tally: Everything Pickleball",
        subtitle: "",
        keywordsField: ["pickleball"],
        description: "",
      },
    });
    expect(rows[0]!.moves.some((m) => m.toLowerCase().includes("drop"))).toBe(
      true,
    );
  });

  it("respects the lifecycle gate when emitting move prose", () => {
    const rows = computeKeywordDistribution({
      keywords: ["dupr"],
      fields: {
        title: "Tally: Everything Pickleball",
        subtitle: "Scoring",
        keywordsField: ["dupr"],
        description: "Pickleball scoring.",
      },
      diagnosis: [
        {
          keyword: "dupr",
          rankBucket: "not_found",
          intentScore: 0.65,
          confidence: "low",
          provenance: "live",
          coverageInTitle: false,
          coverageInSubtitle: false,
          coverageInDescription: false,
          action: "keep_in_keywords_field",
          popularityScore: null,
          popularitySource: "heuristic",
          popularityAsOf: null,
          relatedTerms: [],
          difficulty: null,
          minDifficulty: null,
          difficultyIsFallback: true,
          matchKind: "none",
          isAppSeeding: true,
        },
      ],
    });
    // Lifecycle-blocked: should NOT suggest promoting to a visible field;
    // instead surface the "keep watching" prose.
    const moves = rows[0]!.moves;
    const hasPromote = moves.some((m) => m.toLowerCase().includes("add"));
    const hasWatch = moves.some((m) =>
      m.toLowerCase().includes("still seeding"),
    );
    expect(hasPromote).toBe(false);
    expect(hasWatch).toBe(true);
  });

  it("returns one row per input keyword in order", () => {
    const rows = computeKeywordDistribution({
      keywords: ["pickleball", "dupr", "scoreboard"],
      fields: {
        title: "Tally",
        subtitle: "",
        keywordsField: [],
        description: "",
      },
    });
    expect(rows.map((r) => r.keyword)).toEqual([
      "pickleball",
      "dupr",
      "scoreboard",
    ]);
  });
});
