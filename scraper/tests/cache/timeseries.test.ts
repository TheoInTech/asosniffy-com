import { beforeEach, describe, expect, it } from "vitest";
import {
  _getRawMembers_forTests,
  _recordRankAtDay_forTests,
  getRankSeries,
  keywordHash,
  rankHistoryKey,
  recordRank,
} from "../../src/cache/timeseries.js";
import { resetCacheClientForTests } from "../../src/cache/redis.js";

beforeEach(() => {
  resetCacheClientForTests();
});

const baseInput = {
  store: "ios" as const,
  country: "US",
  appId: "570060128",
  keyword: "language",
};

describe("rankHistoryKey + keywordHash", () => {
  it("hashes keywords case-insensitively + trimmed", () => {
    expect(keywordHash("Language")).toBe(keywordHash("language"));
    expect(keywordHash("  language  ")).toBe(keywordHash("language"));
  });

  it("includes uppercased country in the key", () => {
    const a = rankHistoryKey({ ...baseInput, country: "us" });
    const b = rankHistoryKey({ ...baseInput, country: "US" });
    expect(a).toBe(b);
    expect(a).toContain(":US:");
  });

  it("namespace-prefixes the key", () => {
    const k = rankHistoryKey(baseInput);
    expect(k.startsWith("rank-history:ios:US:570060128:")).toBe(true);
  });
});

describe("recordRank + getRankSeries round-trip", () => {
  it("stores and reads back a single sample", async () => {
    const sampledAt = new Date("2026-05-20T12:00:00Z");
    await recordRank({
      ...baseInput,
      position: 8,
      bucket: "1-10",
      confidence: "medium",
      provenance: "live",
      searchedDepth: 200,
      sampledAt,
    });
    const series = await getRankSeries(baseInput);
    expect(series).toHaveLength(1);
    expect(series[0]!.position).toBe(8);
    expect(series[0]!.bucket).toBe("1-10");
    expect(series[0]!.confidence).toBe("medium");
    expect(series[0]!.provenance).toBe("live");
    expect(series[0]!.searchedDepth).toBe(200);
    // sampledAt collapses to UTC day; we can't assert exact ISO but the
    // day must match the input day.
    expect(series[0]!.sampledAt.slice(0, 10)).toBe("2026-05-20");
  });

  it("same-day re-write overwrites the existing sample (Redis ZADD semantics)", async () => {
    const day = new Date("2026-05-20T00:00:00Z");
    await recordRank({
      ...baseInput,
      position: 50,
      bucket: "31-50",
      confidence: "low",
      provenance: "live",
      searchedDepth: 200,
      sampledAt: day,
    });
    await recordRank({
      ...baseInput,
      position: 25,
      bucket: "11-30",
      confidence: "medium",
      provenance: "live",
      searchedDepth: 200,
      sampledAt: day,
    });
    const series = await getRankSeries(baseInput);
    expect(series).toHaveLength(1);
    expect(series[0]!.position).toBe(25);
  });

  it("returns empty array for never-recorded tuples", async () => {
    const series = await getRankSeries(baseInput);
    expect(series).toEqual([]);
  });

  it("returns samples ordered ascending by day", async () => {
    const today = Math.floor(Date.now() / 1000 / 86400);
    for (let i = 0; i < 5; i++) {
      await _recordRankAtDay_forTests({
        ...baseInput,
        // Spread the 5 samples across the last 5 days so they all fall
        // inside the default 30-day window.
        dayIndex: today - (4 - i),
        position: 10 + i,
        bucket: "1-10",
        confidence: "medium",
        provenance: "live",
        searchedDepth: 200,
      });
    }
    const series = await getRankSeries({ ...baseInput, windowDays: 90 });
    const positions = series.map((s) => s.position);
    expect(positions).toEqual([10, 11, 12, 13, 14]);
  });
});

describe("auto-trim retention", () => {
  it("writing on day N+91 trims the entry from day N", async () => {
    const today = Math.floor(Date.now() / 1000 / 86400);
    // Seed an old sample 91 days back.
    await _recordRankAtDay_forTests({
      ...baseInput,
      dayIndex: today - 91,
      position: 5,
      bucket: "1-10",
      confidence: "medium",
      provenance: "live",
      searchedDepth: 200,
    });
    expect((await _getRawMembers_forTests(baseInput)).length).toBe(1);
    // Write today — should evict the 91-days-back sample.
    await recordRank({
      ...baseInput,
      position: 8,
      bucket: "1-10",
      confidence: "medium",
      provenance: "live",
      searchedDepth: 200,
    });
    const raw = await _getRawMembers_forTests(baseInput);
    expect(raw).toHaveLength(1);
    // The remaining member is today's sample.
    expect(raw[0]!.score).toBe(today);
  });

  it("writes a full 90-day window without trimming any in-range entry", async () => {
    const today = Math.floor(Date.now() / 1000 / 86400);
    for (let offset = 89; offset >= 0; offset--) {
      await _recordRankAtDay_forTests({
        ...baseInput,
        dayIndex: today - offset,
        position: offset + 1,
        bucket: "1-10",
        confidence: "medium",
        provenance: "live",
        searchedDepth: 200,
      });
    }
    // Now write today — already exists, just refreshes TTL + triggers trim.
    await recordRank({
      ...baseInput,
      position: 1,
      bucket: "1-10",
      confidence: "medium",
      provenance: "live",
      searchedDepth: 200,
    });
    const raw = await _getRawMembers_forTests(baseInput);
    // 90 distinct days remain.
    expect(raw.length).toBe(90);
  });
});

describe("windowDays filtering", () => {
  it("respects windowDays cap", async () => {
    const today = Math.floor(Date.now() / 1000 / 86400);
    for (let offset = 0; offset < 60; offset++) {
      await _recordRankAtDay_forTests({
        ...baseInput,
        dayIndex: today - offset,
        position: offset + 1,
        bucket: "1-10",
        confidence: "medium",
        provenance: "live",
        searchedDepth: 200,
      });
    }
    const series7 = await getRankSeries({ ...baseInput, windowDays: 7 });
    expect(series7).toHaveLength(8); // today + 7 days back inclusive
    const series30 = await getRankSeries({ ...baseInput, windowDays: 30 });
    expect(series30).toHaveLength(31);
  });
});

describe("isolation across tuples", () => {
  it("different keyword → different key → independent series", async () => {
    await recordRank({
      ...baseInput,
      keyword: "language",
      position: 5,
      bucket: "1-10",
      confidence: "medium",
      provenance: "live",
      searchedDepth: 200,
    });
    await recordRank({
      ...baseInput,
      keyword: "spanish",
      position: 50,
      bucket: "31-50",
      confidence: "low",
      provenance: "live",
      searchedDepth: 200,
    });
    const a = await getRankSeries({ ...baseInput, keyword: "language" });
    const b = await getRankSeries({ ...baseInput, keyword: "spanish" });
    expect(a).toHaveLength(1);
    expect(a[0]!.position).toBe(5);
    expect(b).toHaveLength(1);
    expect(b[0]!.position).toBe(50);
  });
});
