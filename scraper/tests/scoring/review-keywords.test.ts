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
});
