import { describe, expect, it } from "vitest";
import {
  APPLE_CAPS,
  METADATA_WEIGHTS,
  composeOverall,
  scoreMetadata,
  scoreMetadataFull,
} from "../../src/scoring/metadata.js";
import type { AppRecord } from "../../src/providers/apple/types.js";

function makeApp(overrides: Partial<AppRecord> = {}): AppRecord {
  return {
    id: "1",
    name: "Pawprint Habits",
    developer: "Sniffy Labs",
    primaryCategory: "Productivity",
    subtitle: "Daily Routine & Streaks",
    description:
      "Pawprint Habits turns your daily routines into streaks you actually keep. Build habits, track progress, and start your day on track. Download free and try the habit tracker built for indie hackers.",
    ratingsSummary: { average: 4.6, count: 1200 },
    screenshots: [],
    currentVersion: "1.0",
    provenance: "live",
    ...overrides,
  };
}

describe("scoreMetadata", () => {
  it("returns title/subtitle/keywordsField/description subscores with reasons", () => {
    const result = scoreMetadata({
      app: makeApp(),
      detectedApp: { id: "1", name: "Pawprint Habits", developer: "Sniffy" },
      keywords: ["habit tracker", "daily routine"],
    });

    expect(result.title.reasons.length).toBeGreaterThan(0);
    expect(result.subtitle.reasons.length).toBeGreaterThan(0);
    expect(result.keywordsField.reasons.length).toBeGreaterThan(0);
    expect(result.description.reasons.length).toBeGreaterThan(0);
  });

  it("penalizes title that exceeds the 30-char cap", () => {
    const longName = "A".repeat(APPLE_CAPS.title + 5);
    const result = scoreMetadata({
      app: makeApp({ name: longName }),
      detectedApp: { id: "1", name: longName, developer: "Sniffy" },
      keywords: ["habit"],
    });
    expect(result.title.score).toBeLessThan(50);
    expect(result.title.reasons.some((r) => r.includes("truncate"))).toBe(true);
  });

  it("rewards subtitles that lead with the primary keyword", () => {
    const leading = scoreMetadata({
      app: makeApp({ subtitle: "Habit Tracker & Streaks" }),
      detectedApp: { id: "1", name: "Brand", developer: "X" },
      keywords: ["habit tracker"],
    }).subtitle;
    const trailing = scoreMetadata({
      app: makeApp({ subtitle: "Streaks & Habit Tracker" }),
      detectedApp: { id: "1", name: "Brand", developer: "X" },
      keywords: ["habit tracker"],
    }).subtitle;
    expect(leading.score).toBeGreaterThan(trailing.score);
  });

  it("penalizes empty subtitle", () => {
    const result = scoreMetadata({
      app: makeApp({ subtitle: "" }),
      detectedApp: { id: "1", name: "Brand", developer: "X" },
      keywords: ["habit"],
    });
    expect(result.subtitle.score).toBeLessThanOrEqual(30);
  });

  it("emits 'source unavailable' (not 'empty') when storefront fetch was degraded", () => {
    const result = scoreMetadata({
      app: makeApp({ subtitle: "", subtitleProvenance: "degraded" }),
      detectedApp: { id: "1", name: "Brand", developer: "X" },
      keywords: ["habit"],
    });
    expect(result.subtitle.reasons[0]?.toLowerCase()).toContain(
      "source unavailable",
    );
  });

  it("claims subtitle empty honestly when storefront fetch succeeded", () => {
    const result = scoreMetadata({
      app: makeApp({ subtitle: "", subtitleProvenance: "live" }),
      detectedApp: { id: "1", name: "Brand", developer: "X" },
      keywords: ["habit"],
    });
    expect(result.subtitle.reasons[0]?.toLowerCase()).toContain("empty");
  });

  it("flags keyword-field duplicates with title/subtitle words", () => {
    const result = scoreMetadata({
      app: makeApp({ name: "Habit Brand", subtitle: "Tracker Streaks" }),
      detectedApp: { id: "1", name: "Habit Brand", developer: "X" },
      keywords: ["habit", "tracker", "streaks"],
    });
    expect(
      result.keywordsField.reasons.some((r) =>
        r.toLowerCase().includes("duplicate"),
      ),
    ).toBe(true);
  });

  it("is deterministic for identical input", () => {
    const a = scoreMetadataFull({
      app: makeApp(),
      detectedApp: { id: "1", name: "Pawprint Habits", developer: "Sniffy" },
      keywords: ["habit tracker"],
    });
    const b = scoreMetadataFull({
      app: makeApp(),
      detectedApp: { id: "1", name: "Pawprint Habits", developer: "Sniffy" },
      keywords: ["habit tracker"],
    });
    expect(a).toEqual(b);
  });
});

describe("composeOverall", () => {
  it("respects the documented 35/30/25/10 weights", () => {
    const overall = composeOverall({
      title: { score: 100, reasons: [], negativeReasons: [] },
      subtitle: { score: 0, reasons: [], negativeReasons: [] },
      keywordsField: { score: 0, reasons: [], negativeReasons: [] },
      description: { score: 0, reasons: [], negativeReasons: [] },
    });
    expect(overall).toBe(Math.round(METADATA_WEIGHTS.title * 100));
  });

  it("returns an integer 0–100", () => {
    const overall = composeOverall({
      title: { score: 73, reasons: [], negativeReasons: [] },
      subtitle: { score: 61, reasons: [], negativeReasons: [] },
      keywordsField: { score: 44, reasons: [], negativeReasons: [] },
      description: { score: 80, reasons: [], negativeReasons: [] },
    });
    expect(Number.isInteger(overall)).toBe(true);
    expect(overall).toBeGreaterThanOrEqual(0);
    expect(overall).toBeLessThanOrEqual(100);
  });
});

describe("scoreMetadataFull", () => {
  it("returns a complete result with populated overall", () => {
    const result = scoreMetadataFull({
      app: makeApp(),
      detectedApp: { id: "1", name: "Pawprint Habits", developer: "Sniffy" },
      keywords: ["habit tracker", "daily routine"],
    });
    expect(result.overall).toBeGreaterThan(0);
    expect(result.overall).toBeLessThanOrEqual(100);
  });

  it("handles null AppRecord (fixture-only path) without throwing", () => {
    const result = scoreMetadataFull({
      app: null,
      detectedApp: { id: "1", name: "Pawprint Habits", developer: "Sniffy" },
      keywords: ["habit tracker"],
    });
    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.subtitle.reasons.length).toBeGreaterThan(0);
  });
});
