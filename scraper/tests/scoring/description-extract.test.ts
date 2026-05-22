import { describe, expect, it } from "vitest";
import { extractDescriptionTokens } from "../../src/scoring/description-extract.js";
import type { AppRecord } from "../../src/providers/apple/types.js";

// Phase C — Description / "What's New" extractor unit tests. Exercises
// the regex + stoplist tokenization across the bullet-character zoo and
// release-notes patterns we see in real App Store listings.

function makeAppRecord(
  overrides: Partial<AppRecord> = {},
): AppRecord {
  return {
    id: "T",
    name: "Test App",
    developer: "Test Dev",
    primaryCategory: "Sports",
    description: "",
    ratingsSummary: { average: 5, count: 100 },
    screenshots: [],
    currentVersion: "1.0",
    provenance: "live",
    ...overrides,
  };
}

describe("extractDescriptionTokens", () => {
  it("returns empty when appRecord is null", () => {
    const result = extractDescriptionTokens(null);
    expect(result).toEqual({
      featureTokens: [],
      recentlyAddedTokens: [],
      topicalKeywords: [],
    });
  });

  it("returns empty when description is below the 300-char threshold", () => {
    const result = extractDescriptionTokens(
      makeAppRecord({ description: "Pickleball scoring app." }),
    );
    expect(result.featureTokens).toEqual([]);
    expect(result.topicalKeywords).toEqual([]);
  });

  it("extracts feature tokens from • bullet lines (most common)", () => {
    const desc =
      "Tally is the everything-pickleball app for indie players. " +
      "It covers scoring, drills, and overlays in one place. " +
      "Built with love by the Tally team.\n\n" +
      "• Live scoring widget for match days\n" +
      "• Drill library with 200+ video tutorials\n" +
      "• Tournament bracket builder\n" +
      "• iPad overlays for AirPlay streaming\n" +
      "• Practice timer with custom drills";
    const result = extractDescriptionTokens(makeAppRecord({ description: desc }));
    expect(result.featureTokens).toContain("scoring");
    expect(result.featureTokens).toContain("drill");
    expect(result.featureTokens).toContain("tournament");
    expect(result.featureTokens).toContain("overlays");
    expect(result.featureTokens).toContain("bracket");
  });

  it("handles weird bullet characters (✓, ⭐, *, -, –)", () => {
    const desc =
      "Pickleball companion app for tournament directors and indie players. " +
      "Track scores, drill your serves, and manage brackets in one place. " +
      "Features include live scoring widget, iPad overlays for AirPlay " +
      "streaming, and a tournament-grade bracket builder. Built for clubs " +
      "and serious players who need real-time match data on the court. " +
      "Trusted by pickleball communities nationwide for league management.\n\n" +
      "✓ Scoring widget\n" +
      "⭐ Drills library\n" +
      "* Bracket builder\n" +
      "- iPad overlays\n" +
      "– Tournament view";
    const result = extractDescriptionTokens(makeAppRecord({ description: desc }));
    expect(result.featureTokens).toContain("scoring");
    expect(result.featureTokens).toContain("drills");
    expect(result.featureTokens).toContain("bracket");
    expect(result.featureTokens).toContain("overlays");
    expect(result.featureTokens).toContain("tournament");
  });

  it("extracts feature tokens from lines after a section header", () => {
    const desc =
      "The everything-pickleball app, used by indie players nationwide. " +
      "We've thought about every feature your matches need. " +
      "Tally is the easiest way to track scores and run tournaments.\n\n" +
      "Features:\n" +
      "Live scoring widget that updates in real time\n" +
      "Drill library with hundreds of video tutorials\n" +
      "Tournament bracket builder with double elimination\n" +
      "iPad overlay rendering for AirPlay streaming";
    const result = extractDescriptionTokens(makeAppRecord({ description: desc }));
    expect(result.featureTokens).toContain("scoring");
    expect(result.featureTokens).toContain("drill");
    expect(result.featureTokens).toContain("tournament");
  });

  it("recognizes 'Highlights:' and 'KEY FEATURES' as section headers (case-insensitive)", () => {
    const descA =
      "Tally is a pickleball app for the whole pickleball community. " +
      "Drill, score, and overlay matches with confidence. " +
      "Pickleball nationwide loves Tally for league management, " +
      "tournament bracket building, and live match scoring. " +
      "Designed for clubs, players, and tournament directors " +
      "who need real-time pickleball data on the court.\n\n" +
      "KEY FEATURES:\n" +
      "Live scoring widget\n" +
      "Drills library expanded";
    const resultA = extractDescriptionTokens(
      makeAppRecord({ description: descA }),
    );
    expect(resultA.featureTokens).toContain("scoring");
    expect(resultA.featureTokens).toContain("drills");

    const descB =
      "Tally is the everything-pickleball app for indie players. " +
      "Track scores, drill serves, and overlay matches in real time. " +
      "Pickleball communities trust Tally for tournament management, " +
      "league standings, and practice session planning. Used by clubs " +
      "and individual players across pickleball communities everywhere " +
      "to organize matches and track performance.\n\n" +
      "Highlights\n" +
      "Tournament bracket builder\n" +
      "Practice timer with sets";
    const resultB = extractDescriptionTokens(
      makeAppRecord({ description: descB }),
    );
    expect(resultB.featureTokens).toContain("tournament");
    expect(resultB.featureTokens).toContain("bracket");
    expect(resultB.featureTokens).toContain("practice");
  });

  it("extracts recentlyAddedTokens from releaseNotes 'Now supports X' pattern", () => {
    const result = extractDescriptionTokens(
      makeAppRecord({
        description:
          "Pickleball companion. Score matches, drill skills, manage tournaments. " +
          "The complete tool for pickleball players nationwide.",
        releaseNotes:
          "What's new in 2.0:\n" +
          "Now supports Apple Watch scoring.\n" +
          "Added round robin tournament format.",
      }),
    );
    // "apple" is stoplisted as App-Store boilerplate (would surface in
    // "Available on Apple App Store" style copy), so the token list captures
    // "watch", "scoring" from "Apple Watch scoring" instead.
    expect(result.recentlyAddedTokens).toContain("watch");
    expect(result.recentlyAddedTokens).toContain("scoring");
    expect(result.recentlyAddedTokens).toContain("round");
    expect(result.recentlyAddedTokens).toContain("robin");
    expect(result.recentlyAddedTokens).toContain("tournament");
    expect(result.recentlyAddedTokens).not.toContain("apple");
  });

  it("extracts recentlyAddedTokens from 'Added X' and 'Introducing Y' patterns", () => {
    const result = extractDescriptionTokens(
      makeAppRecord({
        description:
          "Track every aspect of your pickleball game with one app. " +
          "Scores, drills, tournaments, and AirPlay overlays. Built for indie players.",
        releaseNotes:
          "Added court reservation system.\n" +
          "Introducing the new practice mode with drill sequences.",
      }),
    );
    expect(result.recentlyAddedTokens).toContain("court");
    expect(result.recentlyAddedTokens).toContain("reservation");
    expect(result.recentlyAddedTokens).toContain("practice");
    expect(result.recentlyAddedTokens).toContain("mode");
    expect(result.recentlyAddedTokens).toContain("drill");
  });

  it("returns empty recentlyAddedTokens when releaseNotes is missing", () => {
    const result = extractDescriptionTokens(
      makeAppRecord({
        description:
          "Pickleball scoring, drill management, and tournament bracket. " +
          "The all-in-one app for pickleball players, coaches, and clubs.",
      }),
    );
    expect(result.recentlyAddedTokens).toEqual([]);
  });

  it("frequency-ranks topical keywords with the ≥2 occurrence floor", () => {
    const desc =
      "Tally helps pickleball clubs track their leagues, drills, and matches. " +
      "Run pickleball drills with structured drill sets and league standings " +
      "across every season. Built for clubs that organize pickleball drills " +
      "weekly. League management for serious pickleball players is now easier " +
      "than ever. Pickleball clubs nationwide trust Tally for drills, scoring, " +
      "and league administration. The complete pickleball drills companion.";
    const result = extractDescriptionTokens(makeAppRecord({ description: desc }));
    expect(result.topicalKeywords).toContain("pickleball"); // many occurrences
    expect(result.topicalKeywords).toContain("drills");
    expect(result.topicalKeywords).toContain("clubs");
    expect(result.topicalKeywords).toContain("league");
  });

  it("filters App-Store-specific boilerplate stopwords (Download, Available, iPhone, iPad)", () => {
    const desc =
      "Download Tally today! Available for iPhone and iPad. " +
      "The complete pickleball scoring app for serious players. " +
      "Drill your serves, track your league, manage tournaments. " +
      "Used by clubs nationwide for league scoring and drills.";
    const result = extractDescriptionTokens(makeAppRecord({ description: desc }));
    expect(result.topicalKeywords).not.toContain("download");
    expect(result.topicalKeywords).not.toContain("available");
    expect(result.topicalKeywords).not.toContain("iphone");
    expect(result.topicalKeywords).not.toContain("ipad");
  });
});
