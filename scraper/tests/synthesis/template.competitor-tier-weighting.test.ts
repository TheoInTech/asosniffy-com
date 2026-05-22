import { describe, expect, it } from "vitest";
import {
  synthesizeReportTemplate,
  type SynthesisInput,
} from "../../src/synthesis/template.js";

// Phase A — Tier-aware competitor weighting. A leader's unique term should
// outrank a shoulder's at the same on-topic label, so the subtitle picker
// and keywords-field rewriter both pick the leader's term first when two
// candidates fit the same slot.

function makeInputWithTwoTiers(): SynthesisInput {
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
        // Shoulder competitor — listed FIRST in the array to prove that
        // the synthesis layer ranks by tier-weighted score, not by the
        // competitor-input array order.
        {
          appId: "S",
          name: "Adjacent Sports",
          overlapKeywords: [],
          uniqueToCompetitor: ["drills"],
          overlapScore: 0,
          provenance: "live",
          tier: "shoulder",
          searchPosition: 12,
        },
        // Leader — should win on subtitle/keywords-field picks via the
        // tier weighting even though it appears second in the input array.
        {
          appId: "L",
          name: "PicklePro",
          overlapKeywords: [],
          uniqueToCompetitor: ["scoreboard"],
          overlapScore: 0,
          provenance: "live",
          tier: "leader",
          searchPosition: 1,
        },
      ],
    },
    context: {
      detectedApp: { id: "X", name: "Tally", developer: "Tally" },
      appRecord: {
        id: "X",
        name: "Tally: Everything Pickleball",
        developer: "Tally",
        primaryCategory: "Sports",
        // Empty subtitle — the net-value guard's regression check needs
        // current to have fewer rank-meaningful tokens than recommended,
        // and an empty current trivially gives the recommendation room.
        subtitle: "",
        description: "Pickleball app.",
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

describe("template — competitor tier weighting", () => {
  it("subtitle picks the leader's unique term over the shoulder's at the same on-topic label", () => {
    const result = synthesizeReportTemplate(makeInputWithTwoTiers());
    expect(result.readyToPaste.subtitle.recommended).not.toBeNull();
    // Leader's "Scoreboard" (weight 0.6) should beat shoulder's "Drills"
    // (weight 0.35). displayCasing produces "Scoreboard" / "Drills".
    expect(result.readyToPaste.subtitle.recommended!.toLowerCase()).toContain(
      "scoreboard",
    );
    expect(result.readyToPaste.subtitle.recommended!.toLowerCase()).not.toContain(
      "drills",
    );
  });

  it("keywords field places the leader's term before the shoulder's in the joined output", () => {
    const result = synthesizeReportTemplate(makeInputWithTwoTiers());
    const kw = result.readyToPaste.keywordsField.recommended ?? "";
    const scoreboardIdx = kw.indexOf("scoreboard");
    const drillsIdx = kw.indexOf("drills");
    expect(scoreboardIdx).toBeGreaterThanOrEqual(0);
    expect(drillsIdx).toBeGreaterThanOrEqual(0);
    // Leader appears first in the joined string because the opportunity
    // pool is sorted by weight desc and Set iteration preserves insertion.
    expect(scoreboardIdx).toBeLessThan(drillsIdx);
  });

  it("legacy competitors without tier still rank via the flat 0.5/0.4 scheme (back-compat)", () => {
    const input = makeInputWithTwoTiers();
    // Strip tier from both competitors — simulates a fixture / legacy caller
    // that hasn't been updated to the new shape.
    const legacy = {
      ...input,
      scoring: {
        ...input.scoring,
        competitors: input.scoring.competitors.map((c) => ({
          ...c,
          tier: undefined,
          searchPosition: undefined,
        })),
      },
    };
    const result = synthesizeReportTemplate(legacy);
    // With flat 0.5 weight for both, the input-array order determines
    // ranking. Shoulder appears first in the array → drills should win
    // the subtitle slot. This locks in the no-regression contract for
    // existing fixtures that haven't migrated.
    expect(result.readyToPaste.subtitle.recommended).not.toBeNull();
    expect(result.readyToPaste.subtitle.recommended!.toLowerCase()).toContain(
      "drills",
    );
  });
});
