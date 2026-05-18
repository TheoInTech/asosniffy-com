import { describe, expect, it } from "vitest";
import { intentBucket, intentScore } from "../../src/scoring/intent.js";

describe("intentScore", () => {
  it("returns a number in [0.1, 0.95]", () => {
    const cases = ["habit tracker", "x", "best free apps", "the and or"];
    for (const c of cases) {
      const s = intentScore(c);
      expect(s).toBeGreaterThanOrEqual(0.1);
      expect(s).toBeLessThanOrEqual(0.95);
    }
  });

  it("lifts two-word category terms above single-word browsers", () => {
    expect(intentScore("habit tracker")).toBeGreaterThan(intentScore("habit"));
  });

  it("drops generic discovery phrases", () => {
    expect(intentScore("best free app")).toBeLessThan(intentScore("habit tracker"));
  });

  it("is deterministic for identical inputs", () => {
    const a = intentScore("daily routine planner");
    const b = intentScore("daily routine planner");
    expect(a).toBe(b);
  });

  it("treats whitespace and case as equivalent", () => {
    expect(intentScore("  Habit Tracker  ")).toBe(intentScore("habit tracker"));
  });
});

describe("intentBucket", () => {
  it("buckets 0.85 as high, 0.5 as medium, 0.2 as low", () => {
    expect(intentBucket(0.85)).toBe("high");
    expect(intentBucket(0.5)).toBe("medium");
    expect(intentBucket(0.2)).toBe("low");
  });
});
