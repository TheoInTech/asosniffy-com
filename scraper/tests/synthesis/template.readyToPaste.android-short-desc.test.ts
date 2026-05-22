import { describe, expect, it } from "vitest";
import {
  synthesizeReportTemplate,
  type SynthesisInput,
} from "../../src/synthesis/template.js";
import { ANDROID_SHORT_DESCRIPTION_CAP } from "../../src/synthesis/template.js";

// Phase F regression — Google Play short description field built with cap
// 80. Always emitted when at least one eligible opportunity exists.

function inputWithEligibleKeywords(): SynthesisInput {
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
        {
          keyword: "drills",
          rankBucket: "51-100",
          intentScore: 0.5,
          confidence: "low",
          provenance: "live",
          coverageInTitle: false,
          coverageInSubtitle: false,
          coverageInDescription: false,
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
      keywords: ["scoreboard", "drills"],
    },
    inputProvenance: "live",
  };
}

describe("readyToPaste android short description (Phase F)", () => {
  it("emits a recommended value under the 80-char cap", () => {
    const result = synthesizeReportTemplate(inputWithEligibleKeywords());
    expect(result.readyToPaste.androidShortDescription).not.toBeNull();
    const recommended =
      result.readyToPaste.androidShortDescription!.recommended;
    expect(recommended).not.toBeNull();
    expect(recommended!.length).toBeLessThanOrEqual(
      ANDROID_SHORT_DESCRIPTION_CAP,
    );
    expect(result.readyToPaste.androidShortDescription!.charLimit).toBe(
      ANDROID_SHORT_DESCRIPTION_CAP,
    );
  });

  it("returns recommended:null when no eligible opportunities exist", () => {
    const empty = inputWithEligibleKeywords();
    empty.scoring.keywords = [];
    const result = synthesizeReportTemplate(empty);
    expect(
      result.readyToPaste.androidShortDescription?.recommended ?? null,
    ).toBeNull();
  });
});
