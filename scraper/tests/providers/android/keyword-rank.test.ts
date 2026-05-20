import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleAndroidKeywordRank } from "../../../src/providers/android/keyword-rank.js";
import {
  resetGplayForTests,
  setGplayForTests,
} from "../../../src/providers/android/_gplay.js";
import { resetCacheClientForTests } from "../../../src/cache/redis.js";

beforeEach(() => {
  resetCacheClientForTests();
});
afterEach(() => {
  resetGplayForTests();
  vi.restoreAllMocks();
});

const TARGET = "com.example.habits";

function makeResults(positions: { appId: string }[], padTo: number) {
  const padded = [...positions];
  while (padded.length < padTo) {
    padded.push({ appId: `filler.${padded.length}` });
  }
  return padded.map((r, i) => ({
    appId: r.appId,
    title: `App ${i}`,
    developer: "Studio",
    score: 4.0,
  }));
}

describe("sampleAndroidKeywordRank — bucket boundaries", () => {
  it("position 1 → 1-10", async () => {
    setGplayForTests({
      search: vi.fn(async () => makeResults([{ appId: TARGET }], 50)),
    });
    const result = await sampleAndroidKeywordRank({
      keyword: "habit tracker",
      country: "US",
      packageName: TARGET,
      depth: 50,
    });
    if ("error" in result) throw new Error("unexpected error");
    expect(result.rankBucket).toBe("1-10");
    expect(result.provenance).toBe("live");
    expect(result.searchedDepth).toBe(50);
  });

  it("position 51 → 51-100", async () => {
    const pre = Array.from({ length: 50 }, (_, i) => ({ appId: `pre.${i}` }));
    setGplayForTests({
      search: vi.fn(async () => makeResults([...pre, { appId: TARGET }], 100)),
    });
    const result = await sampleAndroidKeywordRank({
      keyword: "habit tracker",
      country: "US",
      packageName: TARGET,
      depth: 100,
    });
    if ("error" in result) throw new Error("unexpected error");
    expect(result.rankBucket).toBe("51-100");
  });
});

describe("sampleAndroidKeywordRank — error mapping", () => {
  it("returns rate_limited when search throws 429", async () => {
    setGplayForTests({
      search: vi.fn(async () => {
        const err = new Error("Throttled") as Error & { status?: number };
        err.status = 429;
        throw err;
      }),
    });
    const result = await sampleAndroidKeywordRank({
      keyword: "x",
      country: "US",
      packageName: TARGET,
      depth: 50,
    });
    expect(result).toEqual({ error: "rate_limited" });
  });

  it("returns not_found when search returns a 404", async () => {
    setGplayForTests({
      search: vi.fn(async () => {
        const err = new Error("App not found (404)") as Error & { status?: number };
        err.status = 404;
        throw err;
      }),
    });
    const result = await sampleAndroidKeywordRank({
      keyword: "x",
      country: "US",
      packageName: TARGET,
      depth: 50,
    });
    expect(result).toEqual({ error: "not_found" });
  });
});

describe("sampleAndroidKeywordRank — confidence", () => {
  it("returns medium when full page + medium identity", async () => {
    setGplayForTests({
      search: vi.fn(async () => makeResults([{ appId: TARGET }], 50)),
    });
    const result = await sampleAndroidKeywordRank({
      keyword: "x",
      country: "US",
      packageName: TARGET,
      depth: 50,
      identityConfidence: "medium",
    });
    if ("error" in result) throw new Error("unexpected error");
    expect(result.confidence).toBe("medium");
  });

  it("returns low when identity is low", async () => {
    setGplayForTests({
      search: vi.fn(async () => makeResults([{ appId: TARGET }], 50)),
    });
    const result = await sampleAndroidKeywordRank({
      keyword: "x",
      country: "US",
      packageName: TARGET,
      depth: 50,
      identityConfidence: "low",
    });
    if ("error" in result) throw new Error("unexpected error");
    expect(result.confidence).toBe("low");
  });
});
