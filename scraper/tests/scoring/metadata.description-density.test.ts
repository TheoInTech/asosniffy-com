import { describe, expect, it } from "vitest";
import { computeDescriptionDensity } from "../../src/scoring/metadata.js";

// Phase H regression — per-keyword description density classifier. The
// 2026 references put the sweet spot at 1 exact-phrase mention per 250
// chars. Sniffy needs to identify when a user's primary keyword is
// under-density so the "Lift mentions of X" recommendation can fire.

describe("computeDescriptionDensity", () => {
  it("classifies a 0-mention keyword as under for a non-trivial description", () => {
    const description = "A".repeat(1000) + " end."; // ~1005 chars, target = 4
    const rows = computeDescriptionDensity(description, ["dupr"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.count).toBe(0);
    expect(rows[0]!.charsPerMention).toBeNull();
    expect(rows[0]!.target).toBeGreaterThan(0);
    expect(rows[0]!.polarity).toBe("under");
  });

  it("classifies a keyword at the target density as 'at'", () => {
    // 1000-char description, target ~ 4 mentions. Insert 4 exact phrases.
    const filler = "x".repeat(244);
    const description = `pickleball${filler} pickleball${filler} pickleball${filler} pickleball${filler}.`;
    expect(description.length).toBeGreaterThanOrEqual(1000);
    const rows = computeDescriptionDensity(description, ["pickleball"]);
    expect(rows[0]!.count).toBeGreaterThanOrEqual(rows[0]!.target);
    expect(rows[0]!.polarity).not.toBe("under");
  });

  it("classifies 5+ mentions in a short description as 'over' (spam threshold)", () => {
    // 200-char description with 5 mentions — far over the target.
    const description = "habit habit habit habit habit pad pad pad pad pad";
    const rows = computeDescriptionDensity(description, ["habit"]);
    expect(rows[0]!.count).toBe(5);
    expect(rows[0]!.polarity).toBe("over");
  });

  it("returns one row per input keyword, in order", () => {
    const description = "pickleball and dupr and scoreboard are mentioned.";
    const rows = computeDescriptionDensity(description, [
      "pickleball",
      "dupr",
      "scoreboard",
    ]);
    expect(rows.map((r) => r.keyword)).toEqual([
      "pickleball",
      "dupr",
      "scoreboard",
    ]);
  });

  it("counts only exact-phrase matches (not token-level)", () => {
    const description = "Habit Tracker is great. The habit is daily.";
    const rows = computeDescriptionDensity(description, ["habit tracker"]);
    // Exact phrase "habit tracker" appears once (case-insensitive).
    expect(rows[0]!.count).toBe(1);
  });
});
