import { describe, expect, it } from "vitest";
import { buildDescriptionDensityRecommendation } from "../../src/synthesis/template.js";
import type { DescriptionDensityRow } from "../../src/scoring/index.js";

// Phase H regression — "Lift mentions of X" recommendation card fires
// when a user keyword is under-density in the description, surfaces the
// worst-gap keyword first, and never fabricates a card when no keyword
// is under.

describe("buildDescriptionDensityRecommendation", () => {
  it("fires when a user keyword is under-density", () => {
    const density: DescriptionDensityRow[] = [
      { keyword: "dupr", count: 0, charsPerMention: null, target: 4, polarity: "under" },
    ];
    const rec = buildDescriptionDensityRecommendation(density, ["dupr"], 3);
    expect(rec).not.toBeNull();
    expect(rec!.action).toContain("dupr");
    expect(rec!.action).toContain("from 0 to 4");
    expect(rec!.rank).toBe(3);
  });

  it("returns null when no user keyword is under", () => {
    const density: DescriptionDensityRow[] = [
      { keyword: "pickleball", count: 3, charsPerMention: 700, target: 4, polarity: "at" },
      { keyword: "scoreboard", count: 6, charsPerMention: 350, target: 4, polarity: "over" },
    ];
    const rec = buildDescriptionDensityRecommendation(
      density,
      ["pickleball", "scoreboard"],
      3,
    );
    expect(rec).toBeNull();
  });

  it("ignores density rows for keywords not in the user's submitted set", () => {
    const density: DescriptionDensityRow[] = [
      // dupr under-density but not in the user's keywords[] — likely a
      // suggested keyword from a different path; don't surface here.
      { keyword: "dupr", count: 0, charsPerMention: null, target: 4, polarity: "under" },
    ];
    const rec = buildDescriptionDensityRecommendation(
      density,
      ["pickleball"], // dupr not in user keywords
      3,
    );
    expect(rec).toBeNull();
  });

  it("prioritizes the keyword with the largest gap (worst-under first)", () => {
    const density: DescriptionDensityRow[] = [
      { keyword: "smallgap", count: 3, charsPerMention: 400, target: 4, polarity: "under" },
      { keyword: "biggap", count: 0, charsPerMention: null, target: 5, polarity: "under" },
    ];
    const rec = buildDescriptionDensityRecommendation(
      density,
      ["smallgap", "biggap"],
      1,
    );
    expect(rec).not.toBeNull();
    expect(rec!.action).toContain("biggap");
  });
});
