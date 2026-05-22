import { describe, expect, it } from "vitest";
import {
  synthesizeReportTemplate,
  type SynthesisInput,
} from "../../src/synthesis/template.js";

// Phase B — Product-context wiring. Verifies that ProductProfile tokens
// surfaced by the scrape-based provider land in the synthesis opportunity
// pool and outrank a thin competitor pool. This is the Tally regression
// case from Phase 0 with the new Phase B signal added: the developer's
// own marketing site mentions "scoring", "drills", "overlays" — those
// should make it into subtitle/keywords-field over the generic competitor
// verb "play".

function tallyInputWithProductProfile(): SynthesisInput {
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
        // Empty subtitle so the net-value guard from Phase 0 doesn't
        // block the new product-context recommendation.
        subtitle: "",
        description: "Pickleball app.",
        ratingsSummary: { average: 5, count: 100 },
        screenshots: [],
        currentVersion: "1.0",
        provenance: "live",
        sellerUrl: "https://tally.example/",
      },
      keywords: ["pickleball"],
    },
    inputProvenance: "live",
    productProfile: {
      sourceUrls: [
        "https://tally.example/",
        "https://tally.example/features",
      ],
      productOneLiner: "Tally — Everything Pickleball",
      // featureTokens get weight 0.7 — higher than the shoulder competitor's
      // "play" at 0.35, so they should win the subtitle slot.
      featureTokens: ["scoring", "drills", "overlays"],
      audienceTokens: ["tournament directors"],
      topicalKeywords: ["scoring", "match", "drills"],
      provenance: "live",
    },
  };
}

describe("template — product-context opportunity wiring (Phase B)", () => {
  it("subtitle picks a feature token from the product profile, not the shoulder competitor's 'play'", () => {
    const result = synthesizeReportTemplate(tallyInputWithProductProfile());
    expect(result.readyToPaste.subtitle.recommended).not.toBeNull();
    const recommended = result.readyToPaste.subtitle.recommended!.toLowerCase();
    // One of the product feature tokens should win.
    const productTokens = ["scoring", "drills", "overlays"];
    expect(productTokens.some((t) => recommended.includes(t))).toBe(true);
    // The shoulder competitor's "play" should NOT have outranked them.
    expect(recommended).not.toContain("play");
  });

  it("keywords field includes product-context tokens before shoulder competitor terms", () => {
    const result = synthesizeReportTemplate(tallyInputWithProductProfile());
    const kw = result.readyToPaste.keywordsField.recommended ?? "";
    // At least one of the product-context feature tokens should appear.
    const productTokens = ["scoring", "drills", "overlays"];
    expect(productTokens.some((t) => kw.includes(t))).toBe(true);
    // If "play" appears at all, the product-context terms still come first
    // (sorted by weight desc in the opportunity pool, joined preserving
    // insertion order). We check string-position rather than presence so a
    // future implementation that includes "play" lower doesn't break.
    const firstProductIdx = Math.min(
      ...productTokens.map((t) => kw.indexOf(t)).filter((i) => i >= 0),
    );
    const playIdx = kw.indexOf("play");
    if (playIdx >= 0) {
      expect(firstProductIdx).toBeLessThan(playIdx);
    }
  });

  it("ignores productProfile when provenance is 'degraded' (no extraction happened)", () => {
    const input = tallyInputWithProductProfile();
    const degradedProductProfile = {
      sourceUrls: [],
      productOneLiner: null,
      featureTokens: [],
      audienceTokens: [],
      topicalKeywords: [],
      provenance: "degraded" as const,
    };
    const degraded: SynthesisInput = {
      ...input,
      productProfile: degradedProductProfile,
    };
    const result = synthesizeReportTemplate(degraded);
    // Without product-context tokens, the only opportunity is the
    // shoulder competitor's "play" — which is what the subtitle picker
    // falls back to (recommendation may still get net-value-guarded
    // depending on incumbent copy, but it won't contain "scoring").
    const subtitle = result.readyToPaste.subtitle.recommended ?? "";
    expect(subtitle.toLowerCase()).not.toContain("scoring");
  });

  it("legacy callers without productProfile behave identically to pre-Phase-B (back-compat)", () => {
    const input = tallyInputWithProductProfile();
    // Strip productProfile to simulate a legacy caller.
    const { productProfile: _unused, ...legacy } = input;
    const result = synthesizeReportTemplate(legacy);
    // With no product context + only "play" as competitor opportunity,
    // subtitle either falls back to "play" or NO CHANGE depending on the
    // net-value guard. Either way, no product token appears.
    const subtitle = result.readyToPaste.subtitle.recommended ?? "";
    expect(subtitle.toLowerCase()).not.toContain("scoring");
    expect(subtitle.toLowerCase()).not.toContain("drills");
  });
});
