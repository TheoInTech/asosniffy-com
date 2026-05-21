import { describe, expect, it } from "vitest";
import {
  synthesizeReportTemplate,
  type SynthesisInput,
} from "../../src/synthesis/template.js";

// Regression test pinned to the demo PDF: the recommendation card
// "Rewrite the subtitle." cited "Subtitle length (26 chars) is in the
// optimal 20–28 range." as its rationale — a self-contradiction. The
// scorer pushes both positive (optimal length) and negative (no primary
// keyword) reasons; the rewrite trigger now reads `negativeReasons[0]`
// so positive reasons can never end up as the "why".

const baseInput: SynthesisInput = {
  scoring: {
    metadata: {
      overall: 60,
      title: {
        score: 70,
        reasons: ["Title carries 'pickleball' as an exact phrase."],
        negativeReasons: [],
      },
      // Subtitle below 60 — qualifies for the rewrite trigger.
      subtitle: {
        score: 50,
        reasons: [
          "Subtitle length (26 chars) is in the optimal 20–28 range.",
          "Subtitle does not include the primary keyword 'pickleball' — the cheapest fix available.",
        ],
        negativeReasons: [
          "Subtitle does not include the primary keyword 'pickleball' — the cheapest fix available.",
        ],
      },
      keywordsField: { score: 70, reasons: [], negativeReasons: [] },
      description: { score: 70, reasons: [], negativeReasons: [] },
    },
    keywords: [],
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

describe("synthesizeReportTemplate — subtitle-rewrite rationale", () => {
  it("uses a negative reason for the rewrite rationale, never a positive one", () => {
    const result = synthesizeReportTemplate(baseInput);
    const rewriteCard = result.recommendations.find(
      (r) => r.action === "Rewrite the subtitle.",
    );
    expect(rewriteCard).toBeDefined();
    expect(rewriteCard!.rationale.toLowerCase()).not.toContain("optimal");
    expect(rewriteCard!.rationale).toContain(
      "Subtitle does not include the primary keyword 'pickleball'",
    );
  });

  it("does NOT emit the rewrite card when every reason is positive", () => {
    const noNegative: SynthesisInput = {
      ...baseInput,
      scoring: {
        ...baseInput.scoring,
        metadata: {
          ...baseInput.scoring.metadata,
          subtitle: {
            score: 55,
            reasons: ["Subtitle length is in the optimal 20–28 range."],
            negativeReasons: [],
          },
        },
      },
    };
    const result = synthesizeReportTemplate(noNegative);
    const rewriteCard = result.recommendations.find(
      (r) => r.action === "Rewrite the subtitle.",
    );
    expect(rewriteCard).toBeUndefined();
  });
});
