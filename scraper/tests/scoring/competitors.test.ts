import { describe, expect, it } from "vitest";
import { analyzeCompetitors } from "../../src/scoring/competitors.js";
import type { AppRecord } from "../../src/providers/apple/types.js";

function makeApp(overrides: Partial<AppRecord> = {}): AppRecord {
  return {
    id: "1",
    name: "Pawprint Habits",
    developer: "Sniffy Labs",
    primaryCategory: "Productivity",
    subtitle: "Daily Routine & Streaks",
    description: "Habit tracker for indie hackers.",
    ratingsSummary: { average: 4.6, count: 1200 },
    screenshots: [],
    currentVersion: "1.0",
    provenance: "live",
    ...overrides,
  };
}

describe("analyzeCompetitors", () => {
  it("returns at most three analyses", () => {
    const result = analyzeCompetitors({
      target: makeApp(),
      targetKeywords: ["habit tracker"],
      candidates: [
        { appId: "2", name: "A", provenance: "live" },
        { appId: "3", name: "B", provenance: "live" },
        { appId: "4", name: "C", provenance: "live" },
        { appId: "5", name: "D", provenance: "live" },
      ],
    });
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("computes overlap from user keywords appearing in competitor surface", () => {
    const candidateRecords = new Map<string, AppRecord>([
      [
        "2",
        makeApp({
          id: "2",
          name: "Streakly",
          subtitle: "Habit Tracker & Routines",
        }),
      ],
    ]);
    const result = analyzeCompetitors({
      target: makeApp(),
      targetKeywords: ["habit tracker", "daily routine"],
      candidates: [{ appId: "2", name: "Streakly", provenance: "live" }],
      candidateRecords,
    });
    expect(result[0]!.overlapKeywords).toContain("habit tracker");
  });

  it("surfaces unique tokens the competitor uses that the target lacks", () => {
    const candidateRecords = new Map<string, AppRecord>([
      [
        "2",
        makeApp({
          id: "2",
          name: "Streakly Calendar",
          subtitle: "Mindful Productivity Planner",
        }),
      ],
    ]);
    const result = analyzeCompetitors({
      target: makeApp({ name: "Pawprint", subtitle: "Streaks for life" }),
      targetKeywords: [],
      candidates: [{ appId: "2", name: "Streakly Calendar", provenance: "live" }],
      candidateRecords,
    });
    // Should pull "mindful", "productivity", "planner", or "calendar" — not
    // generic words like "for".
    expect(result[0]!.uniqueToCompetitor.length).toBeGreaterThan(0);
    for (const term of result[0]!.uniqueToCompetitor) {
      expect(term.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("propagates each candidate's provenance", () => {
    const result = analyzeCompetitors({
      target: makeApp(),
      targetKeywords: ["habit"],
      candidates: [
        { appId: "2", name: "X", provenance: "cached" },
        { appId: "3", name: "Y", provenance: "fixture" },
      ],
    });
    expect(result[0]!.provenance).toBe("cached");
    expect(result[1]!.provenance).toBe("fixture");
  });

  it("works when no candidateRecords are supplied", () => {
    const result = analyzeCompetitors({
      target: makeApp(),
      targetKeywords: ["habit tracker"],
      candidates: [{ appId: "2", name: "Streakly", provenance: "live" }],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.appId).toBe("2");
  });

  it("is deterministic for identical input", () => {
    const input = {
      target: makeApp(),
      targetKeywords: ["habit tracker"],
      candidates: [{ appId: "2", name: "Streakly", provenance: "live" as const }],
      candidateRecords: new Map([
        [
          "2",
          makeApp({ id: "2", name: "Streakly", subtitle: "Tracker Planner" }),
        ],
      ]),
    };
    expect(analyzeCompetitors(input)).toEqual(analyzeCompetitors(input));
  });
});
