import { describe, expect, it } from "vitest";
import { detectRegressions } from "../../src/scoring/regressions.js";
import type { RankSample } from "../../src/cache/timeseries.js";

function sample(position: number, bucket: RankSample["bucket"] = "1-10"): RankSample {
  return {
    position,
    bucket,
    confidence: "medium",
    provenance: "live",
    searchedDepth: 200,
    sampledAt: "2026-05-20T00:00:00Z",
  };
}

describe("detectRegressions", () => {
  it("ignores keywords with fewer than 3 samples", () => {
    const result = detectRegressions({
      seriesByKeyword: new Map([
        ["habit", [sample(5), sample(50)]],
      ]),
    });
    expect(result).toEqual([]);
  });

  it("detects ≥10 position drop vs 7-day median", () => {
    const result = detectRegressions({
      seriesByKeyword: new Map([
        [
          "habit",
          [
            sample(5, "1-10"),
            sample(6, "1-10"),
            sample(7, "1-10"),
            sample(8, "1-10"),
            sample(30, "11-30"), // current — dropped 22+ positions
          ],
        ],
      ]),
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.keyword).toBe("habit");
    expect(result[0]!.deltaPositions).toBeGreaterThanOrEqual(10);
    expect(result[0]!.previousBucket).toBe("1-10");
    expect(result[0]!.currentBucket).toBe("11-30");
  });

  it("ignores drops smaller than 10 positions", () => {
    const result = detectRegressions({
      seriesByKeyword: new Map([
        [
          "habit",
          [
            sample(5),
            sample(6),
            sample(7),
            sample(8),
            sample(14), // drop of ~7 — below threshold
          ],
        ],
      ]),
    });
    expect(result).toEqual([]);
  });

  it("ignores keywords where current is not_found", () => {
    const result = detectRegressions({
      seriesByKeyword: new Map([
        [
          "habit",
          [
            sample(5),
            sample(6),
            sample(7),
            sample(0, "not_found"),
          ],
        ],
      ]),
    });
    expect(result).toEqual([]);
  });

  it("sorts by severity (largest drop first)", () => {
    const buildSeries = (recent: number) => [
      sample(5),
      sample(6),
      sample(7),
      sample(8),
      sample(recent, "11-30"),
    ];
    const result = detectRegressions({
      seriesByKeyword: new Map([
        ["minor", buildSeries(20)],
        ["major", buildSeries(80)],
        ["middle", buildSeries(50)],
      ]),
    });
    expect(result.map((r) => r.keyword)).toEqual(["major", "middle", "minor"]);
  });

  it("returns empty for an empty input", () => {
    expect(
      detectRegressions({ seriesByKeyword: new Map() }),
    ).toEqual([]);
  });
});
