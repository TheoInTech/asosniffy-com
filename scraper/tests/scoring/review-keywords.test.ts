import { describe, expect, it } from "vitest";
import { reviewKeywordFrequency } from "../../src/scoring/review-keywords.js";

describe("reviewKeywordFrequency", () => {
  it("returns tokens sorted by reviewCount then totalCount", () => {
    const result = reviewKeywordFrequency({
      reviewBodies: [
        "tracker tracker tracker", // 3 mentions, 1 review
        "planner planner planner", // 3 mentions, 1 review
        "tracker is a planner", // tracker+planner each in 1 more review
        "journal", // journal in 1 review
      ],
    });
    // tracker and planner both appear in 2 distinct reviews (best); journal in 1.
    expect(result[0]!.token === "tracker" || result[0]!.token === "planner").toBe(
      true,
    );
    expect(result[0]!.reviewCount).toBe(2);
  });

  it("drops English stopwords", () => {
    const result = reviewKeywordFrequency({
      reviewBodies: [
        "the app is for the people who love the habits and the routine",
      ],
    });
    const tokens = result.map((r) => r.token);
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("is");
    expect(tokens).not.toContain("for");
    // App is on the EN stoplist; "habit" / "routine" survive (lemmatized).
    expect(tokens.some((t) => t === "habit" || t === "routine")).toBe(true);
  });

  it("respects brand-token filter", () => {
    const result = reviewKeywordFrequency({
      reviewBodies: [
        "Pawprint Habits Pawprint Habits Pawprint Habits tracker tracker tracker",
      ],
      brandTokens: ["Pawprint Habits"],
    });
    const tokens = result.map((r) => r.token);
    expect(tokens).not.toContain("pawprint");
    expect(tokens).not.toContain("habit");
    expect(tokens).toContain("tracker");
  });

  it("respects category-token filter", () => {
    const result = reviewKeywordFrequency({
      reviewBodies: ["productivity productivity productivity tracker"],
      categoryTokens: ["Productivity"],
    });
    const tokens = result.map((r) => r.token);
    expect(tokens).not.toContain("productivity");
    expect(tokens).toContain("tracker");
  });

  it("applies suffix lemmatization (plural / -ing / -ed → base)", () => {
    const result = reviewKeywordFrequency({
      reviewBodies: ["trackers trackers tracking tracked tracker"],
    });
    const tokens = result.map((r) => r.token);
    // All forms should collapse onto "tracker" (4) or "track" (1) — at minimum,
    // we don't see four distinct "tracker", "trackers", "tracking", "tracked"
    // rows.
    expect(tokens.length).toBeLessThan(4);
  });

  it("drops pure-numeric tokens", () => {
    const result = reviewKeywordFrequency({
      reviewBodies: ["2026 2026 2026 tracker tracker"],
    });
    const tokens = result.map((r) => r.token);
    expect(tokens).not.toContain("2026");
  });

  it("drops tokens shorter than 3 chars", () => {
    const result = reviewKeywordFrequency({
      reviewBodies: ["UX UI is bad tracker"],
    });
    const tokens = result.map((r) => r.token);
    expect(tokens).not.toContain("ui");
    expect(tokens).not.toContain("ux");
  });

  it("respects topN cap", () => {
    const result = reviewKeywordFrequency({
      reviewBodies: Array.from({ length: 50 }, (_, i) => `word${i} extra${i}`),
      topN: 5,
    });
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("drops lemmatized stopword leaks (this → thi, those → thos)", () => {
    // The Streaks smoke surfaced "thi" in suggestedKeywords because "this"
    // lemmatizes to "thi" via the s-suffix rule but "thi" wasn't in the
    // EN stoplist. Lock in the union-with-lemmas fix.
    const result = reviewKeywordFrequency({
      reviewBodies: [
        "this this this is what I love about it",
        "this app does this and this every day",
        "this is the best",
      ],
    });
    const tokens = result.map((r) => r.token);
    expect(tokens).not.toContain("thi");
    expect(tokens).not.toContain("this");
  });

  it("drops contraction fragments (don, doesn, isn) after apostrophe strip", () => {
    // "don't" → normalize() strips ' → "don t" → tokens "don", "t".
    // Without contraction entries, "don" leaks into output (observed in
    // Streaks smoke). Same pattern for "doesn't" / "isn't" / etc.
    const result = reviewKeywordFrequency({
      reviewBodies: [
        "I don't think it works don't believe it",
        "It doesn't matter doesn't help me at all",
        "It isn't useful isn't reliable isn't fast",
      ],
    });
    const tokens = result.map((r) => r.token);
    expect(tokens).not.toContain("don");
    expect(tokens).not.toContain("doesn");
    expect(tokens).not.toContain("isn");
  });
});
