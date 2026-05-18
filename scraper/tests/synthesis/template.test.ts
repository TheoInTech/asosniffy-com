import { describe, expect, it } from "vitest";
import {
  synthesizeReportTemplate,
  type SynthesisInput,
} from "../../src/synthesis/template.js";
import { APPLE_CAPS } from "../../src/scoring/index.js";
import {
  RecommendationItem,
  ReadyToPaste,
} from "../../src/schemas/index.js";
import type { AppRecord } from "../../src/providers/apple/types.js";

function buildInput(overrides: Partial<SynthesisInput> = {}): SynthesisInput {
  const appRecord: AppRecord = {
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
  };
  return {
    scoring: {
      metadata: {
        overall: 62,
        title: { score: 70, reasons: ["Strong brand recall."] },
        subtitle: { score: 55, reasons: ["Subtitle misses the primary keyword."] },
        keywordsField: { score: 48, reasons: ["Two slots duplicate the title."] },
        description: { score: 72, reasons: ["Description includes a CTA."] },
      },
      keywords: [
        {
          keyword: "habit tracker",
          rankBucket: "31-50",
          intentScore: 0.85,
          confidence: "medium",
          provenance: "live",
          coverageInTitle: false,
          coverageInSubtitle: false,
          coverageInDescription: true,
          action: "add_to_title",
        },
        {
          keyword: "morning meditation",
          rankBucket: "51-100",
          intentScore: 0.65,
          confidence: "medium",
          provenance: "live",
          coverageInTitle: false,
          coverageInSubtitle: false,
          coverageInDescription: false,
          action: "add_to_subtitle",
        },
      ],
      competitors: [
        {
          appId: "1000000101",
          name: "Streakly",
          overlapKeywords: ["habit tracker"],
          uniqueToCompetitor: ["mindful", "planner"],
          overlapScore: 0.5,
          provenance: "live",
        },
      ],
    },
    context: {
      detectedApp: {
        id: "1",
        name: "Pawprint Habits",
        developer: "Sniffy Labs",
      },
      appRecord,
      keywords: ["habit tracker", "morning meditation"],
    },
    ...overrides,
  };
}

describe("synthesizeReportTemplate", () => {
  it("produces schema-valid recommendations", () => {
    const result = synthesizeReportTemplate(buildInput());
    for (const rec of result.recommendations) {
      expect(() => RecommendationItem.parse(rec)).not.toThrow();
    }
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations.length).toBeLessThanOrEqual(5);
  });

  it("produces schema-valid readyToPaste under Apple character caps", () => {
    const result = synthesizeReportTemplate(buildInput());
    expect(() => ReadyToPaste.parse(result.readyToPaste)).not.toThrow();
    expect(result.readyToPaste.title.length).toBeLessThanOrEqual(APPLE_CAPS.title);
    expect(result.readyToPaste.subtitle.length).toBeLessThanOrEqual(APPLE_CAPS.subtitle);
    expect(result.readyToPaste.keywordsField.length).toBeLessThanOrEqual(
      APPLE_CAPS.keywordsField,
    );
  });

  it("produces a non-empty summary that mentions the app", () => {
    const result = synthesizeReportTemplate(buildInput());
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.summary).toContain("Pawprint Habits");
  });

  it("ranks recommendations from 1 upward in order", () => {
    const result = synthesizeReportTemplate(buildInput());
    result.recommendations.forEach((rec, i) => {
      expect(rec.rank).toBe(i + 1);
    });
  });

  it("is deterministic for identical input", () => {
    const a = synthesizeReportTemplate(buildInput());
    const b = synthesizeReportTemplate(buildInput());
    expect(a).toEqual(b);
  });

  it("always produces at least one recommendation, even when no promotions exist", () => {
    const result = synthesizeReportTemplate(
      buildInput({
        scoring: {
          metadata: {
            overall: 85,
            title: { score: 90, reasons: ["Strong."] },
            subtitle: { score: 80, reasons: ["Strong."] },
            keywordsField: { score: 80, reasons: ["Diverse."] },
            description: { score: 85, reasons: ["Strong CTA."] },
          },
          keywords: [
            {
              keyword: "habit tracker",
              rankBucket: "1-10",
              intentScore: 0.85,
              confidence: "high",
              provenance: "live",
              coverageInTitle: true,
              coverageInSubtitle: true,
              coverageInDescription: true,
              action: "keep_in_keywords_field",
            },
          ],
          competitors: [],
        },
      }),
    );
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it("works with null appRecord (fixture path)", () => {
    const result = synthesizeReportTemplate(
      buildInput({
        context: {
          detectedApp: {
            id: "1",
            name: "Pawprint Habits",
            developer: "Sniffy Labs",
          },
          appRecord: null,
          keywords: ["habit tracker"],
        },
      }),
    );
    expect(() => ReadyToPaste.parse(result.readyToPaste)).not.toThrow();
  });
});
