import { describe, expect, it } from "vitest";
import {
  synthesizeReportTemplate,
  type SynthesisInput,
} from "../../src/synthesis/template.js";

// Apple indexes title + subtitle automatically — tokens already in those
// fields are wasted budget in the hidden keywords field. The Tally case
// has "pickleball" in the title AND in the keywords field, costing 10
// chars of the 100-char keywords budget. Before B2 this was fixed
// silently in the readyToPaste diff; the user couldn't see WHY. Now it
// surfaces as a quantified recommendation card.

function inputFor(args: {
  title: string;
  subtitle: string;
  keywords: readonly string[];
}): SynthesisInput {
  return {
    scoring: {
      metadata: {
        overall: 60,
        title: { score: 70, reasons: [], negativeReasons: [] },
        subtitle: { score: 70, reasons: [], negativeReasons: [] },
        keywordsField: { score: 60, reasons: [], negativeReasons: [] },
        description: { score: 70, reasons: [], negativeReasons: [] },
      },
      keywords: [],
      competitors: [],
    },
    context: {
      detectedApp: { id: "1", name: "Tally", developer: "Tally" },
      appRecord: {
        id: "1",
        name: args.title,
        developer: "Tally",
        primaryCategory: "Sports",
        subtitle: args.subtitle,
        description: "Pickleball scoring.",
        ratingsSummary: { average: 5, count: 100 },
        screenshots: [],
        currentVersion: "1.0",
        provenance: "live",
      },
      keywords: args.keywords,
    },
    inputProvenance: "live",
  };
}

describe("synthesizeReportTemplate — Apple keyword-field dedup card", () => {
  it("fires when a single-token user keyword duplicates the title", () => {
    const result = synthesizeReportTemplate(
      inputFor({
        title: "Tally: Everything Pickleball",
        subtitle: "Scoring, drills & overlays",
        keywords: ["pickleball", "dupr", "scoreboard"],
      }),
    );
    const dedupCard = result.recommendations.find((r) =>
      r.action.startsWith("Apple keyword dedup"),
    );
    expect(dedupCard).toBeDefined();
    expect(dedupCard!.action).toContain('"pickleball"');
    // "pickleball" is 10 chars + 0 separators saved on a single dupe = 10.
    expect(dedupCard!.rationale).toMatch(/10 character/);
  });

  it("does NOT fire when keywords are multi-token (handled elsewhere)", () => {
    const result = synthesizeReportTemplate(
      inputFor({
        title: "Pawprint Habits",
        subtitle: "Daily Routine & Streaks",
        keywords: ["habit tracker", "morning routine"],
      }),
    );
    const dedupCard = result.recommendations.find((r) =>
      r.action.startsWith("Apple keyword dedup"),
    );
    // Multi-token keywords get handled by the readyToPaste field builder,
    // not by this recommendation card — single-token duplication is the
    // only case the card surfaces.
    expect(dedupCard).toBeUndefined();
  });

  it("does NOT fire when wasted chars < 6 threshold", () => {
    const result = synthesizeReportTemplate(
      inputFor({
        title: "Brand X",
        subtitle: "Tagline here",
        keywords: ["x"], // 1 char dupe; below the 6-char fire threshold
      }),
    );
    const dedupCard = result.recommendations.find((r) =>
      r.action.startsWith("Apple keyword dedup"),
    );
    expect(dedupCard).toBeUndefined();
  });
});
