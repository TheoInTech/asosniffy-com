import { describe, expect, it } from "vitest";
import {
  synthesizeReportTemplate,
  type SynthesisInput,
} from "../../src/synthesis/template.js";
import { PROMOTIONAL_TEXT_CAP } from "../../src/synthesis/template.js";

// Phase F regression — Apple promotional text field is built with cap 170
// and emitted on every successful deterministic synthesis. Skipped when
// no eligible keyword opportunities exist.

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
          keyword: "habit tracker",
          rankBucket: "31-50",
          intentScore: 0.7,
          confidence: "medium",
          provenance: "live",
          coverageInTitle: false,
          coverageInSubtitle: false,
          coverageInDescription: true,
          action: "add_to_title",
          isAppSeeding: false,
        },
      ],
      competitors: [],
    },
    context: {
      detectedApp: { id: "1", name: "Pawprint", developer: "Sniffy Labs" },
      appRecord: {
        id: "1",
        name: "Pawprint Habits",
        developer: "Sniffy Labs",
        primaryCategory: "Productivity",
        subtitle: "Daily Routine",
        description: "A habit tracker.",
        ratingsSummary: { average: 4.6, count: 800 },
        screenshots: [],
        currentVersion: "1.0",
        provenance: "live",
      },
      keywords: ["habit tracker"],
    },
    inputProvenance: "live",
  };
}

describe("readyToPaste promotional text (Phase F)", () => {
  it("emits a recommended value under the 170-char cap", () => {
    const result = synthesizeReportTemplate(inputWithEligibleKeywords());
    expect(result.readyToPaste.promotionalText).not.toBeNull();
    const recommended = result.readyToPaste.promotionalText!.recommended;
    expect(recommended).not.toBeNull();
    expect(recommended!.length).toBeLessThanOrEqual(PROMOTIONAL_TEXT_CAP);
    expect(result.readyToPaste.promotionalText!.charLimit).toBe(
      PROMOTIONAL_TEXT_CAP,
    );
  });

  it("populates the recommended text with the top-intent keyword", () => {
    const result = synthesizeReportTemplate(inputWithEligibleKeywords());
    const recommended = result.readyToPaste.promotionalText!.recommended!;
    expect(recommended.toLowerCase()).toContain("habit tracker");
  });

  it("returns recommended:null when no eligible opportunities exist", () => {
    const empty = inputWithEligibleKeywords();
    empty.scoring.keywords = [];
    const result = synthesizeReportTemplate(empty);
    expect(
      result.readyToPaste.promotionalText?.recommended ?? null,
    ).toBeNull();
  });
});
