import { describe, expect, it } from "vitest";
import { intentScore } from "../../src/scoring/intent.js";

// Regression test pinned to the bug in the demo PDF: every single-word
// non-productivity keyword (`pickleball`, `dupr`, `scoreboard`) scored
// exactly 0.35 because `HIGH_INTENT_TOKENS` was hardcoded to habit-tracker
// vocabulary and any miss collapsed to `0.5 − 0.15`. After A2 the
// heuristic is structural — same methodology for every vertical — and
// produces a meaningful distribution across categories.

describe("intentScore — category-agnostic distribution", () => {
  it("produces non-flat scores across diverse single-word keywords", () => {
    // A deliberately cross-vertical sample: pickleball (sports), dupr
    // (sports brand), photo (creative), fitness (health), finance,
    // chess (games), yoga (lifestyle). Before A2 every value was 0.35
    // exactly — flatlined to one digit of variation. Structural-only
    // intent should produce real variance (std dev > 0.05).
    const keywords = [
      "pickleball",
      "dupr",
      "scoreboard",
      "photo",
      "fitness",
      "finance",
      "yoga",
      "chess",
    ];
    const scores = keywords.map((k) => intentScore(k));
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance =
      scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    expect(stdDev).toBeGreaterThan(0.05);
    // None of these terms should collapse to the old 0.35 flatline.
    for (const s of scores) {
      expect(Math.abs(s - 0.35)).toBeGreaterThan(0.05);
    }
  });

  it("lifts niche/brand-like single-word terms above broad category terms", () => {
    // "dupr" reads as a brand-like token (4 chars, low vowel ratio, no
    // common English suffix). It should score higher than "app" — the
    // canonical broad category-browse keyword.
    expect(intentScore("dupr")).toBeGreaterThan(intentScore("app"));
  });

  it("penalizes stopword-dominated phrases", () => {
    // "best free app" is 3 words but every word is a stopword. Word-count
    // alone would lift it above neutral; the stopword-density adjustment
    // pushes it back into the drop band.
    expect(intentScore("best free app")).toBeLessThan(0.45);
  });

  it("rewards multi-word specificity", () => {
    // Specific 2-word queries are the long-tail sweet spot.
    expect(intentScore("habit tracker")).toBeGreaterThan(intentScore("habit"));
    expect(intentScore("expense planner")).toBeGreaterThan(intentScore("expense"));
  });

  it("treats short tokens as broad category browsers", () => {
    expect(intentScore("app")).toBeLessThan(0.45);
    expect(intentScore("ai")).toBeLessThan(0.45);
  });
});
