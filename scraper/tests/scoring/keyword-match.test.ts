import { describe, expect, it } from "vitest";
import {
  classifyKeywordMatch,
  keywordMatchScore,
  type KeywordMatchKind,
} from "../../src/scoring/keyword-match.js";

describe("classifyKeywordMatch", () => {
  it("returns 'titleExactPhrase' for a contiguous multi-word match in the title", () => {
    expect(
      classifyKeywordMatch({
        keyword: "habit tracker",
        title: "AI Habit Tracker — Routines",
        subtitle: "Daily streaks",
      }),
    ).toBe("titleExactPhrase");
  });

  it("returns 'titleAllWords' when title carries every token but not as a phrase", () => {
    expect(
      classifyKeywordMatch({
        keyword: "habit tracker",
        title: "AI Tracker — Build Habits Daily",
        subtitle: "",
      }),
    ).toBe("titleAllWords");
  });

  it("returns 'subtitleExactPhrase' when the contiguous phrase lives in the subtitle", () => {
    expect(
      classifyKeywordMatch({
        keyword: "habit tracker",
        title: "Pawprint",
        subtitle: "Habit Tracker for Daily Routines",
      }),
    ).toBe("subtitleExactPhrase");
  });

  it("returns 'subtitleAllWords' for separated subtitle tokens", () => {
    expect(
      classifyKeywordMatch({
        keyword: "habit tracker",
        title: "Pawprint",
        // Both tokens present but not contiguous — tracker word, habits plural.
        subtitle: "A daily tracker for your habits",
      }),
    ).toBe("subtitleAllWords");
  });

  it("returns 'combinedPhrase' when tokens span title + subtitle", () => {
    expect(
      classifyKeywordMatch({
        keyword: "habit tracker",
        title: "Pawprint Habit",
        subtitle: "A daily routine tracker",
      }),
    ).toBe("combinedPhrase");
  });

  it("returns 'none' when no token is present", () => {
    expect(
      classifyKeywordMatch({
        keyword: "habit tracker",
        title: "Pawprint Daily",
        subtitle: "Streaks & routines",
      }),
    ).toBe("none");
  });

  it("collapses single-token keywords to title-exact when present", () => {
    expect(
      classifyKeywordMatch({
        keyword: "pickleball",
        title: "Pickleball Pro",
      }),
    ).toBe("titleExactPhrase");
  });

  it("is case-insensitive", () => {
    expect(
      classifyKeywordMatch({
        keyword: "HABIT TRACKER",
        title: "habit tracker pro",
      }),
    ).toBe("titleExactPhrase");
  });

  it("does not match substring inside another word", () => {
    expect(
      classifyKeywordMatch({
        keyword: "ai",
        title: "Captain — Maritime",
        subtitle: "Sail planner",
      }),
    ).toBe("none");
  });

  it("tolerates punctuation between metadata tokens", () => {
    expect(
      classifyKeywordMatch({
        keyword: "habit tracker",
        title: "Habit-Tracker: Routines",
      }),
    ).toBe("titleExactPhrase");
  });

  it("returns 'none' for empty keyword", () => {
    expect(
      classifyKeywordMatch({ keyword: "", title: "Anything", subtitle: "X" }),
    ).toBe("none");
  });
});

describe("keywordMatchScore", () => {
  it("orders the six kinds from highest to lowest weight", () => {
    const order: KeywordMatchKind[] = [
      "titleExactPhrase",
      "titleAllWords",
      "subtitleExactPhrase",
      "combinedPhrase",
      "subtitleAllWords",
      "none",
    ];
    const scores = order.map(keywordMatchScore);
    // titleExactPhrase = 1, none = 0, monotonically non-increasing in between.
    expect(scores[0]).toBe(1);
    expect(scores.at(-1)).toBe(0);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeLessThanOrEqual(scores[i - 1]!);
    }
  });
});
