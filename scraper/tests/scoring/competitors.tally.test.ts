import { describe, expect, it } from "vitest";
import { analyzeCompetitors } from "../../src/scoring/competitors.js";
import type { AppRecord } from "../../src/providers/apple/types.js";

// Regression test pinned to the Tally: Everything Pickleball case the
// user shipped from the demo PDF. Before the brand-token registry, the
// pre-A1 competitor analyzer surfaced `stars` (Pickleball Stars), `reclub`
// (Reclub - Social Sports Nearby), and `pickleball` (PickleBall 3d) as
// "leans on" terms for the user's listing, which the synthesis layer then
// turned into harmful recommendations: "Tally — Stars", "Reclub · Daily
// Practice", "study how Pickleball Stars uses 'stars'". This test makes
// that regression impossible by asserting brand tokens are never returned.

function makeApp(name: string, subtitle = ""): AppRecord {
  return {
    id: name.toLowerCase().replace(/\W+/g, "-"),
    name,
    developer: "test",
    primaryCategory: "Sports",
    subtitle,
    description: "Test description",
    ratingsSummary: { average: 4.5, count: 100 },
    screenshots: [],
    currentVersion: "1.0",
    provenance: "live",
  };
}

describe("analyzeCompetitors — Tally pickleball regression", () => {
  const target = makeApp(
    "Tally: Everything Pickleball",
    "Scoring, drills & overlays",
  );

  const candidateRecords = new Map<string, AppRecord>([
    ["1", makeApp("Pickleball Stars")],
    ["2", makeApp("Reclub - Social Sports Nearby")],
    ["3", makeApp("PickleBall 3d")],
  ]);

  it("never surfaces competitor brand tokens 'stars' or 'reclub'", () => {
    const result = analyzeCompetitors({
      target,
      targetKeywords: ["pickleball", "dupr", "scoreboard"],
      candidates: [
        { appId: "1", name: "Pickleball Stars", provenance: "live" },
        { appId: "2", name: "Reclub - Social Sports Nearby", provenance: "live" },
        { appId: "3", name: "PickleBall 3d", provenance: "live" },
      ],
      candidateRecords,
    });

    const allUnique = result.flatMap((c) => c.uniqueToCompetitor);
    expect(allUnique).not.toContain("stars");
    expect(allUnique).not.toContain("reclub");
    // PickleBall 3d is brand "pickleball" — already in target's surface,
    // would be filtered anyway, but assert explicitly.
    expect(allUnique).not.toContain("pickleball");
  });

  it("still surfaces non-brand tagline terms ('social', 'sports', 'nearby')", () => {
    // Reclub's name is `"Reclub - Social Sports Nearby"`; head before the
    // dash is `"Reclub"` so only `reclub` enters the brand registry. The
    // tail tokens are taglined category copy and remain eligible as
    // "leans on" terms for the user — exactly the behavior we want.
    const result = analyzeCompetitors({
      target,
      targetKeywords: ["pickleball", "dupr", "scoreboard"],
      candidates: [
        { appId: "2", name: "Reclub - Social Sports Nearby", provenance: "live" },
      ],
      candidateRecords,
    });

    const reclub = result.find((c) => c.appId === "2");
    expect(reclub).toBeDefined();
    // The tail tokens should remain available as legitimate competitor
    // coverage signals — they're generic category words, not brand names.
    expect(reclub!.uniqueToCompetitor).toEqual(
      expect.arrayContaining(["social", "sports", "nearby"]),
    );
  });
});
