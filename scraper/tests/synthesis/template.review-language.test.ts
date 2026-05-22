import { describe, expect, it } from "vitest";
import {
  synthesizeReportTemplate,
  type SynthesisInput,
} from "../../src/synthesis/template.js";

// Phase D — Review-language synthesis wiring. Verifies that
// reviewLanguageTokens passed in on SynthesisInput flow into the
// opportunity pool and surface in readyToPaste output. This is the
// final layer in the 4-source ladder:
//
//   user-keyword          variable (intent score)
//   product-context       0.55-0.70
//   competitor leader     0.50-0.60
//   description-extract   0.50-0.65
//   review-language       0.50  ← Phase D
//   competitor peer       0.40-0.50
//   competitor shoulder   0.25-0.35

function tallyWithReviewLanguage(): SynthesisInput {
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
      // Only a shoulder competitor with the generic "play" verb — same
      // Tally regression case as Phase 0/A/B/C tests.
      competitors: [
        {
          appId: "C1",
          name: "Pickleball Stars",
          overlapKeywords: ["pickleball"],
          uniqueToCompetitor: ["play"],
          overlapScore: 0.4,
          provenance: "live",
          tier: "shoulder",
          searchPosition: 12,
        },
      ],
    },
    context: {
      detectedApp: { id: "T", name: "Tally", developer: "Tally" },
      appRecord: {
        id: "T",
        name: "Tally: Everything Pickleball",
        developer: "Tally",
        primaryCategory: "Sports",
        // Subtitle empty so net-value guard doesn't block a substitution.
        subtitle: "",
        // Description deliberately thin — bullet-free and below the 300-
        // char gate — so description-extract contributes nothing. Lets
        // review-language tokens carry the load.
        description: "Pickleball app.",
        ratingsSummary: { average: 5, count: 100 },
        screenshots: [],
        currentVersion: "1.0",
        provenance: "live",
      },
      keywords: ["pickleball"],
    },
    inputProvenance: "live",
    // The customer-vocab gap surfaced by the review extractor.
    reviewLanguageTokens: ["tournament", "court", "round", "league"],
  };
}

describe("template — review-language opportunity wiring (Phase D)", () => {
  it("subtitle picks a review-language token over the shoulder competitor's 'play'", () => {
    const result = synthesizeReportTemplate(tallyWithReviewLanguage());
    expect(result.readyToPaste.subtitle.recommended).not.toBeNull();
    const recommended = result.readyToPaste.subtitle.recommended!.toLowerCase();
    const reviewTokens = ["tournament", "court", "round", "league"];
    // Review-language tokens at 0.50 outrank shoulder competitor at 0.35.
    expect(reviewTokens.some((t) => recommended.includes(t))).toBe(true);
    expect(recommended).not.toBe("play");
  });

  it("keywords field surfaces review-language tokens as entries", () => {
    const result = synthesizeReportTemplate(tallyWithReviewLanguage());
    const entries = (result.readyToPaste.keywordsField.recommended ?? "")
      .split(",")
      .map((s) => s.trim());
    const reviewTokens = ["tournament", "court", "round", "league"];
    expect(reviewTokens.some((t) => entries.includes(t))).toBe(true);
  });

  it("changeReason copy distinguishes review-language additions", () => {
    const result = synthesizeReportTemplate(tallyWithReviewLanguage());
    const kw = result.readyToPaste.keywordsField;
    expect(kw.recommended).not.toBeNull();
    expect(kw.changeReason).not.toBeNull();
    // When review-language is the strongest first-party source (no
    // product-context, no description-extract featureTokens), the reason
    // copy calls them out by name.
    expect(kw.changeReason!.toLowerCase()).toMatch(
      /review-language|customers already use/,
    );
  });

  it("legacy callers without reviewLanguageTokens behave identically (back-compat)", () => {
    const input = tallyWithReviewLanguage();
    const { reviewLanguageTokens: _drop, ...legacy } = input;
    const result = synthesizeReportTemplate(legacy);
    // Without review tokens, the only opportunity is the shoulder
    // competitor's "play" — net-value guard may or may not let it through,
    // but the review tokens are absent from the output.
    const subtitle = result.readyToPaste.subtitle.recommended ?? "";
    expect(subtitle.toLowerCase()).not.toContain("tournament");
    expect(subtitle.toLowerCase()).not.toContain("court");
  });

  it("empty reviewLanguageTokens array is a no-op (no fake recommendations)", () => {
    const input = tallyWithReviewLanguage();
    const empty: SynthesisInput = { ...input, reviewLanguageTokens: [] };
    const result = synthesizeReportTemplate(empty);
    const subtitle = result.readyToPaste.subtitle.recommended ?? "";
    expect(subtitle.toLowerCase()).not.toContain("tournament");
  });
});
