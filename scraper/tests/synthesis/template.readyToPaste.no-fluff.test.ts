import { describe, expect, it } from "vitest";
import {
  synthesizeReportTemplate,
  type SynthesisInput,
} from "../../src/synthesis/template.js";

// Phase E4 regression — no generic category-cue filler when the category
// has no vetted cue. The pre-Phase-E template emitted "Daily Practice"
// suffix and "for players, leagues, and clubs" benefit unconditionally,
// producing fluff for verticals where neither phrase fits.

function makeInput(category: string): SynthesisInput {
  return {
    scoring: {
      metadata: {
        overall: 60,
        title: { score: 70, reasons: [], negativeReasons: [] },
        subtitle: { score: 55, reasons: [], negativeReasons: [] },
        keywordsField: { score: 60, reasons: [], negativeReasons: [] },
        description: { score: 70, reasons: [], negativeReasons: [] },
      },
      keywords: [
        {
          keyword: "scoreboard",
          rankBucket: "31-50",
          intentScore: 0.55,
          confidence: "low",
          provenance: "live",
          coverageInTitle: false,
          coverageInSubtitle: false,
          coverageInDescription: false,
          action: "add_to_subtitle",
          isAppSeeding: false,
        },
      ],
      competitors: [],
    },
    context: {
      detectedApp: { id: "1", name: "BrandOnly", developer: "Brand" },
      appRecord: {
        id: "1",
        name: "BrandOnly",
        developer: "Brand",
        primaryCategory: category,
        subtitle: "Tagline goes here",
        description: "Test description.",
        ratingsSummary: { average: 4.5, count: 200 },
        screenshots: [],
        currentVersion: "1.0",
        provenance: "live",
      },
      keywords: ["scoreboard"],
    },
    inputProvenance: "live",
  };
}

describe("readyToPaste no-fluff (nullable category cues)", () => {
  it("does NOT emit 'Daily Practice' suffix on Sports", () => {
    const result = synthesizeReportTemplate(makeInput("Sports"));
    const subtitle = result.readyToPaste.subtitle.recommended;
    if (subtitle !== null) {
      expect(subtitle).not.toContain("Daily Practice");
      expect(subtitle).not.toContain("Streaks");
    }
  });

  it("does NOT emit 'players, leagues, and clubs' benefit on Sports", () => {
    const result = synthesizeReportTemplate(makeInput("Sports"));
    const shortDesc = result.readyToPaste.shortDescription.recommended;
    if (shortDesc !== null) {
      expect(shortDesc).not.toContain("players, leagues, and clubs");
      expect(shortDesc).not.toContain("indie builders");
    }
  });

  it("DOES emit the vetted Productivity cue when category matches", () => {
    // Two keywords: one higher-intent for the title rewrite, one
    // shorter for the subtitle. "Habit Tracker" fills the title;
    // "Log" lands in subtitle as "Log · Streaks & Routines" (24 chars,
    // fits the 30-char cap).
    const input = makeInput("Productivity");
    input.scoring.keywords = [
      {
        keyword: "habit tracker",
        rankBucket: "31-50",
        intentScore: 0.85,
        confidence: "medium",
        provenance: "live",
        coverageInTitle: false,
        coverageInSubtitle: false,
        coverageInDescription: false,
        action: "add_to_title",
        isAppSeeding: false,
      },
      {
        keyword: "log",
        rankBucket: "51-100",
        intentScore: 0.55,
        confidence: "low",
        provenance: "live",
        coverageInTitle: false,
        coverageInSubtitle: false,
        coverageInDescription: false,
        action: "add_to_subtitle",
        isAppSeeding: false,
      },
    ];
    input.context.keywords = ["habit tracker", "log"];
    const result = synthesizeReportTemplate(input);
    const subtitle = result.readyToPaste.subtitle.recommended;
    expect(subtitle).not.toBeNull();
    expect(subtitle).toContain("Streaks & Routines");
  });
});
