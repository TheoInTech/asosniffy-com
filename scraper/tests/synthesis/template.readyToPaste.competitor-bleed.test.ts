import { describe, expect, it } from "vitest";
import {
  synthesizeReportTemplate,
  type SynthesisInput,
} from "../../src/synthesis/template.js";
import type { ScoredCandidate } from "../../src/scoring/relevance.js";
import type { AppRecord } from "../../src/providers/apple/types.js";

// Phase 9 regression: an off-topic competitor's terms MUST NOT bleed into
// the user's readyToPaste.keywordsField.recommended. Pre-phase-9 the
// template path looped every `uniqueToCompetitor` term straight into the
// recommended keywords with flat weight 0.5 (template.ts:639-644), filtered
// only by "already in title/subtitle." A pickleball-app submitting
// ["pickleball app"] with a Productivity-genre competitor in the trail
// would see "tournament_bracket" and "daily_planner" appear in their
// recommended copy — actively harmful advice. The relevance gate now
// short-circuits this; this test locks in the new behavior.

function buildPickleballInput(
  overrides: Partial<SynthesisInput> = {},
): SynthesisInput {
  const appRecord: AppRecord = {
    id: "999000111",
    name: "PicklePro",
    developer: "Court Labs",
    primaryCategory: "Sports",
    subtitle: "Pickleball scoreboard",
    description: "A scoreboard app for pickleball players.",
    ratingsSummary: { average: 4.5, count: 480 },
    screenshots: [],
    currentVersion: "1.4",
    provenance: "live",
  };
  return {
    scoring: {
      metadata: {
        overall: 60,
        title: {
          score: 70,
          reasons: ["Brand-forward title."],
          negativeReasons: [],
        },
        subtitle: {
          score: 65,
          reasons: ["Subtitle includes primary keyword."],
          negativeReasons: [],
        },
        keywordsField: {
          score: 55,
          reasons: ["Has duplicates against title."],
          negativeReasons: ["Has duplicates against title."],
        },
        description: {
          score: 70,
          reasons: ["Description covers the category."],
          negativeReasons: [],
        },
      },
      keywords: [
        {
          keyword: "pickleball",
          rankBucket: "11-30",
          intentScore: 0.85,
          confidence: "high",
          provenance: "live",
          coverageInTitle: false,
          coverageInSubtitle: true,
          coverageInDescription: true,
          action: "add_to_title",
        },
      ],
      competitors: [
        {
          appId: "9999",
          name: "Daily Planner Pro",
          overlapKeywords: [],
          uniqueToCompetitor: [
            "tournament_bracket",
            "daily_planner",
            "meditation_timer",
          ],
          overlapScore: 0,
          provenance: "live",
        },
      ],
    },
    context: {
      detectedApp: {
        id: "999000111",
        name: "PicklePro",
        developer: "Court Labs",
      },
      appRecord,
      keywords: ["pickleball"],
    },
    inputProvenance: "live",
    ...overrides,
  };
}

function offTopicScoredCandidates(): ScoredCandidate[] {
  // Every competitor term arrives off-topic — that's the bleed case the
  // gate is supposed to neutralize. The gate produces these for an off-
  // category competitor (Productivity ≠ Sports).
  return [
    {
      keyword: "tournament_bracket",
      origin: "competitor",
      relevanceScore: 0.3,
      relevanceLabel: "off-topic",
      categoryMatch: false,
      intentScore: 0.5,
      popularity: null,
      sourceCompetitor: "9999",
    },
    {
      keyword: "daily_planner",
      origin: "competitor",
      relevanceScore: 0.3,
      relevanceLabel: "off-topic",
      categoryMatch: false,
      intentScore: 0.5,
      popularity: null,
      sourceCompetitor: "9999",
    },
    {
      keyword: "meditation_timer",
      origin: "competitor",
      relevanceScore: 0.3,
      relevanceLabel: "off-topic",
      categoryMatch: false,
      intentScore: 0.5,
      popularity: null,
      sourceCompetitor: "9999",
    },
  ];
}

describe("template.readyToPaste — competitor bleed regression", () => {
  it("does NOT include off-topic competitor terms in keywordsField.recommended when gate is populated", () => {
    const input = buildPickleballInput({
      scoredCandidates: offTopicScoredCandidates(),
    });
    const output = synthesizeReportTemplate(input);
    const recommended = output.readyToPaste.keywordsField.recommended ?? "";
    expect(recommended).not.toContain("tournament_bracket");
    expect(recommended).not.toContain("daily_planner");
    expect(recommended).not.toContain("meditation_timer");
  });

  it("does NOT include off-topic competitor terms in subtitle.recommended", () => {
    const input = buildPickleballInput({
      scoredCandidates: offTopicScoredCandidates(),
    });
    const output = synthesizeReportTemplate(input);
    const recommended = output.readyToPaste.subtitle.recommended ?? "";
    expect(recommended.toLowerCase()).not.toContain("tournament_bracket");
    expect(recommended.toLowerCase()).not.toContain("daily_planner");
    expect(recommended.toLowerCase()).not.toContain("meditation_timer");
  });

  it("preserves legacy behavior (lets competitor terms through) when scoredCandidates is omitted", () => {
    // Back-compat guard: older callers / fixture tests that don't compute
    // scoredCandidates keep the previous behavior. This matters for legacy
    // fixtures (scraper/fixtures/sample-report.json) and tests authored
    // before the gate existed.
    const input = buildPickleballInput();
    const output = synthesizeReportTemplate(input);
    const recommended = output.readyToPaste.keywordsField.recommended ?? "";
    // At least one competitor term should appear when the gate is absent
    // (proving the legacy path still works — we have not silently dropped
    // the source of the bleed; we've added a chokepoint above it).
    const anyBleed =
      recommended.includes("tournament_bracket") ||
      recommended.includes("daily_planner") ||
      recommended.includes("meditation_timer");
    expect(anyBleed).toBe(true);
  });

  it("allows on-topic competitor terms (same-category) through to the keywords field", () => {
    const onTopicScored: ScoredCandidate[] = [
      {
        keyword: "scoreboard",
        origin: "competitor",
        relevanceScore: 0.78,
        relevanceLabel: "on-topic",
        categoryMatch: true,
        intentScore: 0.55,
        popularity: null,
        sourceCompetitor: "1234",
      },
      {
        keyword: "leaderboard",
        origin: "competitor",
        relevanceScore: 0.75,
        relevanceLabel: "on-topic",
        categoryMatch: true,
        intentScore: 0.55,
        popularity: null,
        sourceCompetitor: "1234",
      },
    ];
    const input = buildPickleballInput({
      scoring: {
        ...buildPickleballInput().scoring,
        competitors: [
          {
            appId: "1234",
            name: "PickleScore",
            overlapKeywords: [],
            uniqueToCompetitor: ["scoreboard", "leaderboard"],
            overlapScore: 0,
            provenance: "live",
          },
        ],
      },
      scoredCandidates: onTopicScored,
    });
    const output = synthesizeReportTemplate(input);
    const recommended = output.readyToPaste.keywordsField.recommended ?? "";
    expect(
      recommended.includes("scoreboard") ||
        recommended.includes("leaderboard"),
    ).toBe(true);
  });
});
