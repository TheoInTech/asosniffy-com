import { describe, expect, it } from "vitest";
import {
  synthesizeReportTemplate,
  type SynthesisInput,
} from "../../src/synthesis/template.js";

// Phase E2 regression — subtitle picker must never duplicate a keyword
// that already appears in the title (current OR recommended). Apple's
// keyword indexer treats title + subtitle as one rank pool; duplication
// wastes the 30-char subtitle budget for zero rank weight.

function inputWithTitleCoverage(): SynthesisInput {
  return {
    scoring: {
      metadata: {
        overall: 60,
        title: { score: 85, reasons: [], negativeReasons: [] },
        subtitle: { score: 55, reasons: [], negativeReasons: [] },
        keywordsField: { score: 60, reasons: [], negativeReasons: [] },
        description: { score: 70, reasons: [], negativeReasons: [] },
      },
      keywords: [
        // pickleball already exact-phrase in the title.
        {
          keyword: "pickleball",
          rankBucket: "31-50",
          intentScore: 0.55,
          confidence: "low",
          provenance: "live",
          coverageInTitle: true,
          coverageInSubtitle: false,
          coverageInDescription: true,
          action: "keep_in_keywords_field",
          isAppSeeding: false,
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
        ratingsSummary: { average: 5, count: 100 },
        screenshots: [],
        currentVersion: "1.0",
        provenance: "live",
      },
      keywords: ["pickleball"],
    },
    inputProvenance: "live",
  };
}

describe("readyToPaste subtitle dedup against title", () => {
  it("never duplicates a keyword already exact-phrase in the current title", () => {
    const result = synthesizeReportTemplate(inputWithTitleCoverage());
    if (result.readyToPaste.subtitle.recommended !== null) {
      expect(
        result.readyToPaste.subtitle.recommended.toLowerCase(),
      ).not.toContain("pickleball");
    }
  });

  it("returns recommended:null when no honest non-duplicating subtitle exists", () => {
    // The only keyword is already in the title; no competitor uniques.
    // The right move is no recommendation, not template filler.
    const result = synthesizeReportTemplate(inputWithTitleCoverage());
    expect(result.readyToPaste.subtitle.recommended).toBeNull();
  });
});
