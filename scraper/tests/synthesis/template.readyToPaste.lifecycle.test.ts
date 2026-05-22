import { describe, expect, it } from "vitest";
import {
  synthesizeReportTemplate,
  type SynthesisInput,
} from "../../src/synthesis/template.js";

// Phase E1 regression — readyToPaste must not promote a seeding +
// not_found keyword to title / subtitle / promo text / android short
// description. The pre-Phase-E template happily proposed "Tally — Dupr"
// on a 35-day-old listing where dupr is not_found, creating internal
// contradiction with the keyword-diagnosis layer (which says "still
// seeding, don't decide on this keyword yet").

function makeInput(opts: {
  isAppSeeding: boolean;
  rankBucket: "not_found" | "31-50";
}): SynthesisInput {
  return {
    scoring: {
      metadata: {
        overall: 60,
        title: { score: 70, reasons: [], negativeReasons: [] },
        subtitle: { score: 55, reasons: [], negativeReasons: [] },
        keywordsField: { score: 60, reasons: [], negativeReasons: [] },
        description: { score: 70, reasons: [], negativeReasons: [] },
      },
      keywords: [
        {
          keyword: "dupr",
          rankBucket: opts.rankBucket,
          intentScore: 0.65,
          confidence: "low",
          provenance: "live",
          coverageInTitle: false,
          coverageInSubtitle: false,
          coverageInDescription: false,
          action: "keep_in_keywords_field",
          isAppSeeding: opts.isAppSeeding,
        },
      ],
      competitors: [],
    },
    context: {
      detectedApp: { id: "1", name: "Tally", developer: "Tally" },
      appRecord: {
        id: "1",
        name: "Tally: Everything Pickleball",
        developer: "Tally",
        primaryCategory: "Sports",
        subtitle: "Scoring, drills & overlays",
        description: "Pickleball scoring.",
        ratingsSummary: { average: 5, count: 4 },
        screenshots: [],
        currentVersion: "1.0",
        provenance: "live",
      },
      keywords: ["dupr"],
    },
    inputProvenance: "live",
  };
}

describe("readyToPaste lifecycle gate", () => {
  it("does NOT promote a seeding + not_found keyword to title", () => {
    const result = synthesizeReportTemplate(
      makeInput({ isAppSeeding: true, rankBucket: "not_found" }),
    );
    if (result.readyToPaste.title.recommended !== null) {
      expect(result.readyToPaste.title.recommended.toLowerCase()).not.toContain(
        "dupr",
      );
    }
  });

  it("does NOT promote seeding + not_found to subtitle / promo text / android short desc", () => {
    const result = synthesizeReportTemplate(
      makeInput({ isAppSeeding: true, rankBucket: "not_found" }),
    );
    const surfaces = [
      result.readyToPaste.subtitle.recommended,
      result.readyToPaste.promotionalText?.recommended ?? null,
      result.readyToPaste.androidShortDescription?.recommended ?? null,
    ];
    for (const s of surfaces) {
      if (s !== null) expect(s.toLowerCase()).not.toContain("dupr");
    }
  });

  it("DOES promote when the app is no longer seeding (gate releases)", () => {
    // A mature app with the same not_found rank could still get the
    // gate; non-seeding (e.g., not seeding flag false) opens promotion.
    const result = synthesizeReportTemplate(
      makeInput({ isAppSeeding: false, rankBucket: "31-50" }),
    );
    // Title/subtitle/promo-text aren't always rebuilt (other ineligibility
    // reasons can apply); at minimum, none of the surfaces should be
    // silenced on the basis of the lifecycle gate. Assert at least one
    // surface has dupr-flavored recommended copy.
    const all = [
      result.readyToPaste.title.recommended,
      result.readyToPaste.subtitle.recommended,
      result.readyToPaste.promotionalText?.recommended ?? null,
      result.readyToPaste.androidShortDescription?.recommended ?? null,
      result.readyToPaste.shortDescription.recommended,
    ];
    const anyContainsDupr = all.some(
      (s) => s !== null && s.toLowerCase().includes("dupr"),
    );
    expect(anyContainsDupr).toBe(true);
  });
});
