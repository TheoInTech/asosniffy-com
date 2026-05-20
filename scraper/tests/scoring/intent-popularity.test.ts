import { describe, expect, it } from "vitest";
import {
  intentScore,
  popularityWeightedIntent,
} from "../../src/scoring/intent.js";

describe("popularityWeightedIntent", () => {
  it("falls back to heuristic when popularity source is heuristic", () => {
    const intent = popularityWeightedIntent({
      keyword: "habit tracker",
      popularityScore: null,
      popularitySource: "heuristic",
    });
    expect(intent).toBeLessThanOrEqual(0.85); // capped fallback
  });

  it("uses ASA score when source is apple-search-ads", () => {
    const intent = popularityWeightedIntent({
      keyword: "language",
      popularityScore: 80,
      popularitySource: "apple-search-ads",
    });
    expect(intent).toBeGreaterThan(0.5);
    expect(intent).toBeLessThanOrEqual(0.95);
  });

  it("low ASA score (5) lands near the floor regardless of heuristic", () => {
    const intent = popularityWeightedIntent({
      keyword: "habit tracker", // heuristic would lift this
      popularityScore: 5,
      popularitySource: "apple-search-ads",
    });
    // Blend = 0 * 0.75 + heuristic * 0.25 — heuristic alone is ~0.7, so
    // the blend is around 0.17–0.25.
    expect(intent).toBeLessThan(0.4);
  });

  it("high ASA score dominates even when heuristic disagrees", () => {
    const intent = popularityWeightedIntent({
      keyword: "app", // heuristic LOW (single stopword-ish)
      popularityScore: 100,
      popularitySource: "apple-search-ads",
    });
    // Blend = 1 * 0.75 + ~0.30 * 0.25 ≈ 0.83
    expect(intent).toBeGreaterThan(0.7);
  });
});

describe("intentScore (heuristic, unchanged)", () => {
  it("multi-word phrases score higher than single broad terms", () => {
    expect(intentScore("habit tracker")).toBeGreaterThan(intentScore("habit"));
  });
});
