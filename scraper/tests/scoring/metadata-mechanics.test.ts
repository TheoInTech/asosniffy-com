import { describe, expect, it } from "vitest";
import {
  lintMetadataMechanics,
  lintReviewSafety,
  type MechanicsFinding,
} from "../../src/scoring/metadata-mechanics.js";

function findingsOfKind(
  findings: MechanicsFinding[],
  kind: MechanicsFinding["kind"],
): MechanicsFinding[] {
  return findings.filter((f) => f.kind === kind);
}

describe("lintMetadataMechanics", () => {
  it("returns zero findings and full permutation count on a clean listing", () => {
    const report = lintMetadataMechanics({
      title: "Sniffy Detective",
      subtitle: "Pixel scent trails",
      keywordsField: "mascot,puzzle,clue",
    });
    expect(report.findings).toEqual([]);
    expect(report.totalCharsWasted).toBe(0);
    // sniffy, detective, pixel, scent, trail (trails stems), mascot, puzzle, clue
    expect(report.distinctIndexedTokens).toBe(8);
    expect(report.phrasePermutations).toBe(56); // 8 * 7
    expect(report.phrasePermutationsIfFixed).toBe(56); // nothing to reclaim
  });

  it("flags a cross-field duplicate and attributes the waste to the keywords field", () => {
    const report = lintMetadataMechanics({
      title: "Photo Editor",
      subtitle: null,
      keywordsField: "photo,filters",
    });
    const dups = findingsOfKind(report.findings, "cross-field-duplicate");
    expect(dups).toHaveLength(1);
    const dup = dups[0]!;
    expect(dup.token).toBe("photo");
    expect(dup.field).toBe("keywordsField"); // cheapest field carries the waste
    expect(dup.charsWasted).toBe(6); // "photo" (5) + 1 comma separator
    expect(dup.ruleProvenance).toBe("apple-documented");
    expect(report.totalCharsWasted).toBe(6);
    // stems: photo, editor, filter → 3
    expect(report.distinctIndexedTokens).toBe(3);
    expect(report.phrasePermutations).toBe(6);
    expect(report.phrasePermutationsIfFixed).toBe(6); // 6 chars < 8-char reclaim unit
  });

  it("attributes a title+subtitle duplicate to the subtitle when there is no keywords field", () => {
    const report = lintMetadataMechanics({
      title: "Budget Planner",
      subtitle: "Budget tracking daily",
      keywordsField: null,
    });
    const dups = findingsOfKind(report.findings, "cross-field-duplicate");
    expect(dups).toHaveLength(1);
    expect(dups[0]!.field).toBe("subtitle");
    expect(dups[0]!.token).toBe("budget");
    expect(dups[0]!.charsWasted).toBe(7); // "budget" (6) + 1 space separator
    expect(
      report.notes.some((n) => n.includes("not publicly visible")),
    ).toBe(true);
  });

  it("charges no separator when the duplicate is the only token in its field", () => {
    const report = lintMetadataMechanics({
      title: "Photo Editor",
      subtitle: null,
      keywordsField: "photo",
    });
    const dups = findingsOfKind(report.findings, "cross-field-duplicate");
    expect(dups).toHaveLength(1);
    expect(dups[0]!.charsWasted).toBe(5); // sole token, no separator freed
  });

  it("flags trailing-s plurals as duplicates (apple-documented) and computes ifFixed permutations", () => {
    const report = lintMetadataMechanics({
      title: "Habit Tracker",
      subtitle: null,
      keywordsField: "trackers,habits",
    });
    const plurals = findingsOfKind(report.findings, "plural-duplicate");
    expect(plurals).toHaveLength(2);
    const trackers = plurals.find((f) => f.token === "trackers")!;
    expect(trackers.field).toBe("keywordsField");
    expect(trackers.charsWasted).toBe(9); // 8 + 1 separator
    expect(trackers.ruleProvenance).toBe("apple-documented");
    const habits = plurals.find((f) => f.token === "habits")!;
    expect(habits.charsWasted).toBe(7); // 6 + 1 separator
    expect(report.totalCharsWasted).toBe(16);
    // stems collapse: habit, tracker → 2
    expect(report.distinctIndexedTokens).toBe(2);
    expect(report.phrasePermutations).toBe(2);
    // 16 wasted chars / 8 per reclaimed keyword = 2 new tokens → 4 * 3 = 12
    expect(report.phrasePermutationsIfFixed).toBe(12);
  });

  it("stems ies→y plurals", () => {
    const report = lintMetadataMechanics({
      title: "Daily Diary",
      subtitle: null,
      keywordsField: "diaries",
    });
    const plurals = findingsOfKind(report.findings, "plural-duplicate");
    expect(plurals).toHaveLength(1);
    expect(plurals[0]!.token).toBe("diaries");
    expect(plurals[0]!.charsWasted).toBe(7); // sole keyword, no separator
  });

  it("stems -es plurals (boxes → box)", () => {
    const report = lintMetadataMechanics({
      title: "Box Mover",
      subtitle: null,
      keywordsField: "boxes,storage",
    });
    const plurals = findingsOfKind(report.findings, "plural-duplicate");
    expect(plurals).toHaveLength(1);
    expect(plurals[0]!.token).toBe("boxes");
    expect(plurals[0]!.charsWasted).toBe(6); // 5 + 1 separator
  });

  it("detects plural duplicates inside a single field", () => {
    const report = lintMetadataMechanics({
      title: "Walk Mate",
      subtitle: null,
      keywordsField: "tracker,trackers",
    });
    const plurals = findingsOfKind(report.findings, "plural-duplicate");
    expect(plurals).toHaveLength(1);
    expect(plurals[0]!.token).toBe("trackers");
    expect(plurals[0]!.field).toBe("keywordsField");
    expect(plurals[0]!.charsWasted).toBe(9);
  });

  it("reports camelCase splitting as an informational community-tested finding", () => {
    const report = lintMetadataMechanics({
      title: "PhotoSnap Editor",
      subtitle: null,
      keywordsField: null,
    });
    const camel = findingsOfKind(report.findings, "camelcase-hidden-split");
    expect(camel).toHaveLength(1);
    expect(camel[0]!.token).toBe("PhotoSnap");
    expect(camel[0]!.field).toBe("title");
    expect(camel[0]!.charsWasted).toBe(0);
    expect(camel[0]!.ruleProvenance).toBe("community-tested");
    expect(camel[0]!.detail).toContain("photo");
    expect(camel[0]!.detail).toContain("snap");
    expect(report.totalCharsWasted).toBe(0);
  });

  it("flags auto-indexed words in the keywords field", () => {
    const report = lintMetadataMechanics({
      title: "Pixel Detective",
      subtitle: null,
      keywordsField: "app,free,clue",
    });
    const auto = findingsOfKind(report.findings, "auto-indexed-word");
    expect(auto).toHaveLength(2);
    const app = auto.find((f) => f.token === "app")!;
    expect(app.charsWasted).toBe(4); // 3 + 1 separator
    expect(app.ruleProvenance).toBe("apple-documented");
    const free = auto.find((f) => f.token === "free")!;
    expect(free.charsWasted).toBe(5); // 4 + 1 separator
    expect(report.totalCharsWasted).toBe(9);
    // stems: pixel, detective, app, free, clue → 5; 9/8 → 1 reclaimed token
    expect(report.distinctIndexedTokens).toBe(5);
    expect(report.phrasePermutations).toBe(20);
    expect(report.phrasePermutationsIfFixed).toBe(30); // (5+1) * 5
  });

  it("auto-indexed classification takes precedence over cross-field duplication", () => {
    const report = lintMetadataMechanics({
      title: "Free Photo Editor",
      subtitle: null,
      keywordsField: "free,photo",
    });
    const auto = findingsOfKind(report.findings, "auto-indexed-word");
    expect(auto).toHaveLength(1);
    expect(auto[0]!.token).toBe("free");
    const dups = findingsOfKind(report.findings, "cross-field-duplicate");
    expect(dups).toHaveLength(1);
    expect(dups[0]!.token).toBe("photo");
  });

  it("counts spaces after commas in the keywords field as wasted bytes", () => {
    const report = lintMetadataMechanics({
      title: "Pixel Detective",
      subtitle: null,
      keywordsField: "dog, cat,  bird",
    });
    const fmt = findingsOfKind(report.findings, "keyword-field-format");
    expect(fmt).toHaveLength(1);
    expect(fmt[0]!.field).toBe("keywordsField");
    expect(fmt[0]!.charsWasted).toBe(3); // 1 space + 2 spaces
    expect(fmt[0]!.ruleProvenance).toBe("apple-documented");
  });

  it("keeps unicode/diacritic tokens intact and stems their plurals", () => {
    const report = lintMetadataMechanics({
      title: "Café Finder",
      subtitle: "Cafés near you",
      keywordsField: null,
    });
    const plurals = findingsOfKind(report.findings, "plural-duplicate");
    expect(plurals).toHaveLength(1);
    expect(plurals[0]!.token).toBe("cafés");
    expect(plurals[0]!.field).toBe("subtitle");
    expect(plurals[0]!.charsWasted).toBe(6); // 5 + 1 space separator
    // stems: café, finder, near, you → 4
    expect(report.distinctIndexedTokens).toBe(4);
    expect(report.phrasePermutations).toBe(12);
  });

  it("handles null subtitle and null keywords field without fabricating findings", () => {
    const report = lintMetadataMechanics({
      title: "Sniffy",
      subtitle: null,
      keywordsField: null,
    });
    expect(report.findings).toEqual([]);
    expect(report.totalCharsWasted).toBe(0);
    expect(report.distinctIndexedTokens).toBe(1);
    expect(report.phrasePermutations).toBe(0);
    expect(report.phrasePermutationsIfFixed).toBe(0);
    expect(
      report.notes.some((n) => n.includes("not publicly visible")),
    ).toBe(true);
  });

  it("picks the cheapest field when a token spans subtitle and keywords, and combines with plural findings", () => {
    const report = lintMetadataMechanics({
      title: "Walk Mate",
      subtitle: "Best dog walks",
      keywordsField: "dog,leash",
    });
    const dups = findingsOfKind(report.findings, "cross-field-duplicate");
    expect(dups).toHaveLength(1);
    expect(dups[0]!.token).toBe("dog");
    expect(dups[0]!.field).toBe("keywordsField");
    expect(dups[0]!.charsWasted).toBe(4); // 3 + 1
    const plurals = findingsOfKind(report.findings, "plural-duplicate");
    expect(plurals).toHaveLength(1);
    expect(plurals[0]!.token).toBe("walks");
    expect(plurals[0]!.field).toBe("subtitle");
    expect(plurals[0]!.charsWasted).toBe(6); // 5 + 1
    expect(report.totalCharsWasted).toBe(10);
  });

  it("keeps totalCharsWasted equal to the sum of finding charsWasted and labels every finding's provenance", () => {
    const report = lintMetadataMechanics({
      title: "PawTracker: Dog Walk Tracker",
      subtitle: "GPS walks for dogs",
      keywordsField: "dog, walking app,trackers,best",
    });
    const sum = report.findings.reduce((s, f) => s + f.charsWasted, 0);
    expect(report.totalCharsWasted).toBe(sum);
    for (const finding of report.findings) {
      expect(["apple-documented", "community-tested"]).toContain(
        finding.ruleProvenance,
      );
    }
    // The permutation model is community lore — the notes must say so.
    expect(report.notes.some((n) => n.includes("community-tested"))).toBe(true);
    // camelCase findings never count chars.
    for (const f of findingsOfKind(report.findings, "camelcase-hidden-split")) {
      expect(f.charsWasted).toBe(0);
    }
  });
});

describe("lintReviewSafety (ios)", () => {
  it("returns no flags for a clean iOS listing", () => {
    const flags = lintReviewSafety(
      {
        title: "Sniffy Detective",
        subtitle: "Scent trails",
        keywordsField: "mascot,puzzle",
      },
      "ios",
    );
    expect(flags).toEqual([]);
  });

  it("flags a title over 30 characters as a likely violation", () => {
    const flags = lintReviewSafety(
      { title: "Super Ultra Mega Photo Editor Pro" }, // 33 chars
      "ios",
    );
    expect(flags).toHaveLength(1);
    expect(flags[0]!.severity).toBe("likely-violation");
    expect(flags[0]!.field).toBe("title");
    expect(flags[0]!.store).toBe("ios");
    expect(flags[0]!.rule).toContain("30");
  });

  it("warns on pricing words in title and subtitle per 2.3.7", () => {
    const flags = lintReviewSafety(
      {
        title: "Photo Editor Free",
        subtitle: "Summer sale - 50% discount",
      },
      "ios",
    );
    expect(flags).toHaveLength(3);
    expect(flags.every((f) => f.severity === "warning")).toBe(true);
    const terms = flags.map((f) => f.term).sort();
    expect(terms).toEqual(["discount", "free", "sale"]);
  });

  it("does not flag substrings of safe words (freedom is not free)", () => {
    const flags = lintReviewSafety({ title: "Freedom Journal" }, "ios");
    expect(flags).toEqual([]);
  });

  it("warns on category names and generic superlatives in the keywords field", () => {
    const flags = lintReviewSafety(
      { keywordsField: "games,best,photo" },
      "ios",
    );
    expect(flags).toHaveLength(2);
    const games = flags.find((f) => f.term === "games")!;
    expect(games.severity).toBe("warning");
    expect(games.field).toBe("keywordsField");
    const best = flags.find((f) => f.term === "best")!;
    expect(best.severity).toBe("warning");
  });

  it("returns no flags when no fields are provided", () => {
    expect(lintReviewSafety({}, "ios")).toEqual([]);
  });
});

describe("lintReviewSafety (android)", () => {
  it("flags Play banned terms — likely-violation in title, warning in short description", () => {
    const flags = lintReviewSafety(
      {
        title: "Best Photo Editor",
        shortDescription: "Download now for free!",
      },
      "android",
    );
    expect(flags).toHaveLength(3);
    const best = flags.find((f) => f.term === "best")!;
    expect(best.severity).toBe("likely-violation");
    expect(best.field).toBe("title");
    expect(best.store).toBe("android");
    const downloadNow = flags.find((f) => f.term === "download now")!;
    expect(downloadNow.severity).toBe("warning");
    expect(downloadNow.field).toBe("shortDescription");
    const free = flags.find((f) => f.term === "free")!;
    expect(free.severity).toBe("warning");
  });

  it("warns on ALL-CAPS words longer than 5 chars but ignores acronym-like short caps", () => {
    const caps = lintReviewSafety({ title: "AMAZING Editor" }, "android");
    expect(caps).toHaveLength(1);
    expect(caps[0]!.term).toBe("AMAZING");
    expect(caps[0]!.severity).toBe("warning");

    const acronym = lintReviewSafety({ title: "HDR Photo Editor" }, "android");
    expect(acronym).toEqual([]);
  });

  it("flags emoji in an Android title as a likely violation", () => {
    const flags = lintReviewSafety({ title: "Photo Editor 🔥" }, "android");
    expect(flags).toHaveLength(1);
    expect(flags[0]!.severity).toBe("likely-violation");
    expect(flags[0]!.term).toBe("🔥");
  });

  it("checks androidShortDescription too", () => {
    const flags = lintReviewSafety(
      { androidShortDescription: "The #1 photo app" },
      "android",
    );
    expect(flags).toHaveLength(1);
    expect(flags[0]!.term).toBe("#1");
    expect(flags[0]!.field).toBe("androidShortDescription");
    expect(flags[0]!.severity).toBe("warning");
  });

  it("returns no flags for a clean Android listing", () => {
    const flags = lintReviewSafety(
      {
        title: "Pixel Walker",
        shortDescription: "Track walks with your dog",
      },
      "android",
    );
    expect(flags).toEqual([]);
  });
});
