import { describe, expect, it } from "vitest";
import {
  synthesizeReportTemplate,
  type SynthesisInput,
} from "../../src/synthesis/template.js";

// Phase E6 regression — short description must NOT echo the full current
// title. Pre-Phase-E template emitted "Tally: Everything Pickleball: dupr
// and pickleball for players, leagues, and clubs." — wasting 28 of 240
// chars on a verbatim repeat of the title.

function makeInput(): SynthesisInput {
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
          keyword: "scoreboard",
          rankBucket: "31-50",
          intentScore: 0.55,
          confidence: "low",
          provenance: "live",
          coverageInTitle: false,
          coverageInSubtitle: false,
          coverageInDescription: false,
          action: "add_to_subtitle",
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
      keywords: ["scoreboard"],
    },
    inputProvenance: "live",
  };
}

describe("readyToPaste short description — no title echo", () => {
  it("never echoes the full current title verbatim", () => {
    const result = synthesizeReportTemplate(makeInput());
    const shortDesc = result.readyToPaste.shortDescription.recommended;
    if (shortDesc !== null) {
      expect(shortDesc).not.toContain("Tally: Everything Pickleball");
    }
  });
});
