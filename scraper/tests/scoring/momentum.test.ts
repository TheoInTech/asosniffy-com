import { describe, expect, it } from "vitest";
import { computeMomentum } from "../../src/scoring/momentum.js";

const NOW = Date.UTC(2026, 4, 21);

function daysAgo(days: number): string {
  return new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("computeMomentum", () => {
  it("returns all-null when releaseDate is missing", () => {
    const result = computeMomentum({ userRatingCount: 1000, now: NOW });
    expect(result).toEqual({
      ratingsPerDay: null,
      momentumLabel: null,
      daysSinceFirstRelease: null,
      daysSinceLastRelease: null,
    });
  });

  it("returns all-null when releaseDate is malformed", () => {
    const result = computeMomentum({
      userRatingCount: 100,
      releaseDate: "not-a-date",
      now: NOW,
    });
    expect(result.ratingsPerDay).toBeNull();
    expect(result.momentumLabel).toBeNull();
  });

  it("labels a high-velocity app 'growing'", () => {
    const result = computeMomentum({
      userRatingCount: 10_000,
      releaseDate: daysAgo(100),
      currentVersionReleaseDate: daysAgo(5),
      now: NOW,
    });
    expect(result.ratingsPerDay).toBe(100);
    expect(result.momentumLabel).toBe("growing");
    expect(result.daysSinceFirstRelease).toBe(100);
    expect(result.daysSinceLastRelease).toBe(5);
  });

  it("labels a long-tail app with few ratings 'declining'", () => {
    const result = computeMomentum({
      userRatingCount: 100,
      releaseDate: daysAgo(3000),
      now: NOW,
    });
    expect(result.momentumLabel).toBe("declining");
    expect(result.daysSinceFirstRelease).toBe(3000);
    expect(result.daysSinceLastRelease).toBeNull();
  });

  it("labels a steady mid-tier app 'steady'", () => {
    const result = computeMomentum({
      userRatingCount: 365,
      releaseDate: daysAgo(365),
      now: NOW,
    });
    expect(result.ratingsPerDay).toBeCloseTo(1, 1);
    expect(result.momentumLabel).toBe("steady");
  });

  it("clamps daysSinceFirstRelease to 1 for a brand-new app", () => {
    const result = computeMomentum({
      userRatingCount: 3,
      releaseDate: new Date(NOW).toISOString(),
      now: NOW,
    });
    expect(result.daysSinceFirstRelease).toBe(1);
    expect(result.ratingsPerDay).toBe(3);
    expect(Number.isFinite(result.ratingsPerDay!)).toBe(true);
  });

  it("treats negative ratingCount as 0", () => {
    const result = computeMomentum({
      userRatingCount: -5 as unknown as number,
      releaseDate: daysAgo(10),
      now: NOW,
    });
    expect(result.ratingsPerDay).toBe(0);
    expect(result.momentumLabel).toBe("declining");
  });
});
