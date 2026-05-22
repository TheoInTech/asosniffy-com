import { describe, expect, it } from "vitest";
import {
  synthesizeReportTemplate,
  type SynthesisInput,
} from "../../src/synthesis/template.js";

// Phase E3 regression — displayCasing must preserve brand acronym casing
// at every paste-able splice point. The pre-Phase-E template flattened
// "DUPR" (user-input or brand-like-detected) to "Dupr" via Title Case,
// destroying the brand recognition.

function makeInput(originalKeyword: string): SynthesisInput {
  return {
    scoring: {
      metadata: {
        overall: 60,
        title: { score: 60, reasons: [], negativeReasons: [] },
        subtitle: { score: 55, reasons: [], negativeReasons: [] },
        keywordsField: { score: 60, reasons: [], negativeReasons: [] },
        description: { score: 70, reasons: [], negativeReasons: [] },
      },
      keywords: [
        {
          keyword: originalKeyword,
          rankBucket: "31-50",
          intentScore: 0.65,
          confidence: "low",
          provenance: "live",
          coverageInTitle: false,
          coverageInSubtitle: false,
          coverageInDescription: false,
          action: "add_to_title",
          isAppSeeding: false,
        },
      ],
      competitors: [],
    },
    context: {
      detectedApp: { id: "1", name: "BrandOnly", developer: "Brand" },
      appRecord: {
        id: "1",
        name: "BrandOnly",
        developer: "Brand",
        primaryCategory: "Sports",
        subtitle: "",
        description: "Test description.",
        ratingsSummary: { average: 4.5, count: 200 },
        screenshots: [],
        currentVersion: "1.0",
        provenance: "live",
      },
      keywords: [originalKeyword],
    },
    inputProvenance: "live",
  };
}

describe("readyToPaste displayCasing — brand preservation", () => {
  it("preserves uppercase acronym typed by the user (DUPR → DUPR)", () => {
    const result = synthesizeReportTemplate(makeInput("DUPR"));
    const recommended = result.readyToPaste.title.recommended;
    expect(recommended).not.toBeNull();
    expect(recommended).toContain("DUPR");
    expect(recommended).not.toContain("Dupr");
  });

  it("UPPERCASEs structurally brand-like lowercase input (dupr → DUPR)", () => {
    // dupr: 4 chars, no common English suffix, vowel ratio 1/4 = 0.25
    // (outside [0.3, 0.6]) — structurally brand-like by the heuristic.
    const result = synthesizeReportTemplate(makeInput("dupr"));
    const recommended = result.readyToPaste.title.recommended;
    expect(recommended).not.toBeNull();
    expect(recommended).toContain("DUPR");
    expect(recommended).not.toContain("Dupr");
  });

  it("Title-Cases ordinary English words (pickleball → Pickleball)", () => {
    const result = synthesizeReportTemplate(makeInput("pickleball"));
    const recommended = result.readyToPaste.title.recommended;
    expect(recommended).not.toBeNull();
    expect(recommended).toContain("Pickleball");
    expect(recommended).not.toContain("PICKLEBALL");
  });
});
