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
    const titleText =
      result.readyToPaste.title.recommended ?? result.readyToPaste.title.current;
    const subtitleText =
      result.readyToPaste.subtitle.recommended ??
      result.readyToPaste.subtitle.current;
    const keywordsText =
      result.readyToPaste.keywordsField.recommended ??
      result.readyToPaste.keywordsField.current;
    expect(titleText.length).toBeLessThanOrEqual(APPLE_CAPS.title);
    expect(subtitleText.length).toBeLessThanOrEqual(APPLE_CAPS.subtitle);
    expect(keywordsText.length).toBeLessThanOrEqual(APPLE_CAPS.keywordsField);
    expect(result.readyToPaste.source).toBe("deterministic");
  });

  it("never echoes the current title/subtitle in the recommended slot", () => {
    const result = synthesizeReportTemplate(buildInput());
    const { title, subtitle } = result.readyToPaste;
    if (title.recommended !== null) {
      expect(title.recommended.toLowerCase()).not.toBe(title.current.toLowerCase());
    }
    if (subtitle.recommended !== null) {
      expect(subtitle.recommended.toLowerCase()).not.toBe(
        subtitle.current.toLowerCase(),
      );
    }
  });

  it("emits a non-template Android short description grounded in scoring keywords", () => {
    const result = synthesizeReportTemplate(buildInput());
    const shortDesc = result.readyToPaste.shortDescription;
    expect(shortDesc.recommended).not.toBeNull();
    // Regression guard: pre-fix template emitted "focused, fast, and built for
    // the workflow you already have" — never let that come back.
    expect(shortDesc.recommended).not.toContain(
      "focused, fast, and built for the workflow you already have",
    );
  });

  it("returns recommended:null when the user already covers their top-intent keyword", () => {
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
        context: {
          detectedApp: {
            id: "1",
            name: "Pawprint Habits",
            developer: "Sniffy Labs",
          },
          appRecord: {
            id: "1",
            name: "Pawprint Habits",
            developer: "Sniffy Labs",
            primaryCategory: "Productivity",
            subtitle: "Habit Tracker for Indies",
            description: "Habit tracker for indie hackers.",
            ratingsSummary: { average: 4.6, count: 1200 },
            screenshots: [],
            currentVersion: "1.0",
            provenance: "live",
          },
          keywords: ["habit tracker"],
        },
      }),
    );
    expect(result.readyToPaste.title.recommended).toBeNull();
    expect(result.readyToPaste.title.changeReason).toBeNull();
    expect(result.readyToPaste.subtitle.recommended).toBeNull();
  });

  it("unions competitor-unique terms into the keywordsField recommendation but strips title/subtitle tokens", () => {
    const result = synthesizeReportTemplate(buildInput());
    const recommended = result.readyToPaste.keywordsField.recommended;
    expect(recommended).not.toBeNull();
    // Of the two competitor-unique terms ("mindful", "planner"), one ends
    // up in the recommended subtitle (Apple's keyword indexer counts visible
    // tokens, so we strip it from the keywords field). The other survives.
    const consumedBySubtitle = result.readyToPaste.subtitle.recommended ?? "";
    if (consumedBySubtitle.toLowerCase().includes("mindful")) {
      expect(recommended).toContain("planner");
      expect(recommended).not.toContain("mindful");
    } else {
      expect(recommended).toContain("mindful");
    }
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
