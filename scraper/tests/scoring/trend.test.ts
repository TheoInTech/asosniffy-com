import { describe, expect, it } from "vitest";
import { computeTrend } from "../../src/scoring/trend.js";
import type { RankSample } from "../../src/cache/timeseries.js";

function sample(overrides: Partial<RankSample>): RankSample {
  return {
    position: 10,
    bucket: "1-10",
    confidence: "medium",
    provenance: "live",
    searchedDepth: 200,
    sampledAt: "2026-05-20T00:00:00Z",
    ...overrides,
  };
}

describe("computeTrend", () => {
  it("returns null on cold start (samplesCount < 2)", () => {
    expect(computeTrend({ series: [] })).toBeNull();
    expect(computeTrend({ series: [sample({ position: 5 })] })).toBeNull();
  });

  it("returns 30d window when fewer than 7 samples", () => {
    const series = [
      sample({ position: 8 }),
      sample({ position: 12 }),
    ];
    const trend = computeTrend({ series });
    expect(trend).not.toBeNull();
    expect(trend!.window).toBe("30d");
  });

  it("returns 7d window with 7+ samples", () => {
    const series = Array.from({ length: 7 }, (_, i) =>
      sample({ position: 5 + i }),
    );
    const trend = computeTrend({ series });
    expect(trend!.window).toBe("7d");
  });

  it("deltaPositions positive when rank gets worse (position increases)", () => {
    const series = [
      sample({ position: 5, bucket: "1-10" }),
      sample({ position: 25, bucket: "11-30" }),
    ];
    const trend = computeTrend({ series });
    expect(trend!.deltaPositions).toBe(20);
  });

  it("deltaPositions negative when rank improves (position decreases)", () => {
    const series = [
      sample({ position: 50, bucket: "31-50" }),
      sample({ position: 8, bucket: "1-10" }),
    ];
    const trend = computeTrend({ series });
    expect(trend!.deltaPositions).toBe(-42);
  });

  it("deltaPositions null when current is not_found (position 0)", () => {
    const series = [
      sample({ position: 5 }),
      sample({ position: 0, bucket: "not_found" }),
    ];
    const trend = computeTrend({ series });
    expect(trend!.deltaPositions).toBeNull();
    expect(trend!.previousBucket).toBe("1-10");
    expect(trend!.samplesCount).toBe(2);
  });

  it("previousBucket is the OLDEST sample's bucket", () => {
    const series = [
      sample({ position: 5, bucket: "1-10" }),
      sample({ position: 15, bucket: "11-30" }),
      sample({ position: 35, bucket: "31-50" }),
    ];
    const trend = computeTrend({ series });
    expect(trend!.previousBucket).toBe("1-10");
  });

  it("samplesCount matches series length", () => {
    const series = Array.from({ length: 12 }, (_, i) =>
      sample({ position: i + 1 }),
    );
    const trend = computeTrend({ series });
    expect(trend!.samplesCount).toBe(12);
  });
});
