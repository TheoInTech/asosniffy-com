import { describe, expect, it } from "vitest";
import {
  synthesizeReportTemplate,
  type SynthesisInput,
} from "../../src/synthesis/template.js";

// Phase C — Description-extract wiring. Verifies that bullet-list /
// section-header tokens from the App Store description, and "added X"
// patterns from releaseNotes, flow into the synthesis opportunity pool
// and make it to readyToPaste output.
//
// This is the same Tally regression case the Phase 0 + Phase A + Phase B
// tests use, but with the developer's product-context provider OFF and
// the App Store description doing the heavy lifting instead. Lets us
// validate the description-extract source independently.

function tallyInputWithRichDescription(): SynthesisInput {
  return {
    scoring: {
      metadata: {
        overall: 60,
        title: { score: 85, reasons: [], negativeReasons: [] },
        subtitle: { score: 55, reasons: [], negativeReasons: [] },
        keywordsField: { score: 60, reasons: [], negativeReasons: [] },
        description: { score: 70, reasons: [], negativeReasons: [] },
      },
      keywords: [
        {
          keyword: "pickleball",
          rankBucket: "31-50",
          intentScore: 0.55,
          confidence: "low",
          provenance: "live",
          coverageInTitle: true,
          coverageInSubtitle: false,
          coverageInDescription: true,
          action: "keep_in_keywords_field",
          isAppSeeding: false,
        },
      ],
      competitors: [
        {
          appId: "C1",
          name: "Pickleball Stars",
          overlapKeywords: ["pickleball"],
          uniqueToCompetitor: ["play"],
          overlapScore: 0.4,
          provenance: "live",
          tier: "shoulder",
          searchPosition: 12,
        },
      ],
    },
    context: {
      detectedApp: { id: "T", name: "Tally", developer: "Tally" },
      appRecord: {
        id: "T",
        name: "Tally: Everything Pickleball",
        developer: "Tally",
        primaryCategory: "Sports",
        subtitle: "",
        // Realistic-length description with bullet lines that mirror
        // what tally.example would actually have on the App Store.
        description:
          "Tally is the everything-pickleball companion app for indie players, " +
          "tournament directors, and clubs. Track matches, drill your serves, " +
          "and overlay scoring data on iPad streams. Pickleball communities " +
          "across the country use Tally for league management, bracket building, " +
          "and real-time scoring. The complete pickleball toolkit.\n\n" +
          "Features:\n" +
          "• Live scoring widget for match days\n" +
          "• Drills library with structured practice sessions\n" +
          "• Tournament bracket builder\n" +
          "• iPad overlays for AirPlay streaming",
        releaseNotes:
          "What's new in 2.1:\n" +
          "Added court reservation system.\n" +
          "Now supports double-elimination tournament format.",
        ratingsSummary: { average: 5, count: 100 },
        screenshots: [],
        currentVersion: "2.1",
        provenance: "live",
      },
      keywords: ["pickleball"],
    },
    inputProvenance: "live",
  };
}

describe("template — description-extract opportunity wiring (Phase C)", () => {
  it("subtitle picks a description-extract feature token over the shoulder competitor's 'play'", () => {
    const result = synthesizeReportTemplate(tallyInputWithRichDescription());
    expect(result.readyToPaste.subtitle.recommended).not.toBeNull();
    const recommended = result.readyToPaste.subtitle.recommended!.toLowerCase();
    // One of the description-extract feature tokens should win — they
    // weight 0.65 (Features: section, 2× heading-weight) vs shoulder
    // competitor's 0.35 (= adjacent shoulder).
    const descTokens = [
      "scoring",
      "drills",
      "tournament",
      "bracket",
      "overlays",
    ];
    expect(descTokens.some((t) => recommended.includes(t))).toBe(true);
    expect(recommended).not.toContain("play");
  });

  it("keywords field surfaces description-extract tokens BEFORE shoulder competitor terms", () => {
    const result = synthesizeReportTemplate(tallyInputWithRichDescription());
    const kw = result.readyToPaste.keywordsField.recommended ?? "";
    // joinKeywords joins with commas — split back to compare entries
    // exactly (substring check matches "play" inside "airplay").
    const entries = kw.split(",").map((s) => s.trim());
    const descTokens = [
      "scoring",
      "drills",
      "tournament",
      "bracket",
      "overlays",
    ];
    expect(descTokens.some((t) => entries.includes(t))).toBe(true);
    // If "play" is present as its own keyword entry, the first description-
    // extract entry appears at a lower index. (Substring matching against
    // "airplay" would give a false positive.)
    const firstDescIdx = Math.min(
      ...descTokens.map((t) => entries.indexOf(t)).filter((i) => i >= 0),
    );
    const playIdx = entries.indexOf("play");
    if (playIdx >= 0) {
      expect(firstDescIdx).toBeLessThan(playIdx);
    }
  });

  it("recentlyAddedTokens from releaseNotes surface when description has no bullets / sections", () => {
    // Fixture where description is rich enough to pass the 300-char gate
    // BUT has no bullet lines or section headers — so featureTokens is
    // empty and recentlyAddedTokens get a clear shot at the slots.
    const input = tallyInputWithRichDescription();
    const bulletFreeDesc =
      "Tally is the everything-pickleball companion for indie players, " +
      "tournament directors, and clubs. We help track matches, organize " +
      "leagues, and run brackets across pickleball communities. Trusted " +
      "by hundreds of clubs nationwide for serious pickleball management. " +
      "The complete toolkit for pickleball players and coaches.";
    const noBullets: SynthesisInput = {
      ...input,
      context: {
        ...input.context,
        appRecord: {
          ...input.context.appRecord!,
          description: bulletFreeDesc,
          releaseNotes:
            "What's new in 2.1:\n" +
            "Added court reservation system.\n" +
            "Now supports double-elimination tournament format.",
        },
      },
    };
    const result = synthesizeReportTemplate(noBullets);
    const subtitle =
      result.readyToPaste.subtitle.recommended?.toLowerCase() ?? "";
    const kwEntries = (result.readyToPaste.keywordsField.recommended ?? "")
      .split(",")
      .map((s) => s.trim());
    const recentTokens = ["court", "reservation", "double", "elimination"];
    const inSubtitle = recentTokens.some((t) => subtitle.includes(t));
    const inKwField = recentTokens.some((t) => kwEntries.includes(t));
    expect(inSubtitle || inKwField).toBe(true);
  });

  it("changeReason copy distinguishes 'description terms' when description-extract is the strongest add", () => {
    // Strip the productProfile path (it's already not on this fixture) and
    // confirm the description-extract reason copy surfaces when those
    // tokens are the strongest first-party adds.
    const result = synthesizeReportTemplate(tallyInputWithRichDescription());
    const kw = result.readyToPaste.keywordsField;
    expect(kw.recommended).not.toBeNull();
    expect(kw.changeReason).not.toBeNull();
    // Copy should call out the description source by name. Falls back to
    // "competitor-coverage" only when no first-party tokens were added.
    expect(kw.changeReason!.toLowerCase()).toMatch(/description terms|product-page terms/);
  });

  it("fixture or degraded provenance disables description-extract (back-compat)", () => {
    const input = tallyInputWithRichDescription();
    const fixture: SynthesisInput = { ...input, inputProvenance: "fixture" };
    const result = synthesizeReportTemplate(fixture);
    // Fixture-mode synthesis returns sample-disclaimer copy, not the
    // template path that hits description-extract. We just assert the
    // result parses; the disclaimer path has its own coverage.
    expect(result.readyToPaste.source).toBe("template-fallback");
  });
});
