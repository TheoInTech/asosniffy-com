import { beforeEach, describe, expect, it } from "vitest";
import {
  getCacheClient,
  resetCacheClientForTests,
} from "../../src/cache/redis.js";

beforeEach(() => {
  resetCacheClientForTests();
});

describe("MemoryCacheClient ZSet primitives", () => {
  it("zadd then zrange returns members ordered by score ascending", async () => {
    const cache = getCacheClient();
    const key = "test:zset:a";
    await cache.zadd(key, 3, "c", 60);
    await cache.zadd(key, 1, "a", 60);
    await cache.zadd(key, 2, "b", 60);
    const out = await cache.zrange(key);
    expect(out.map((m) => m.member)).toEqual(["a", "b", "c"]);
    expect(out.map((m) => m.score)).toEqual([1, 2, 3]);
  });

  it("zadd with same member updates score (Redis semantics)", async () => {
    const cache = getCacheClient();
    const key = "test:zset:b";
    await cache.zadd(key, 1, "x", 60);
    await cache.zadd(key, 5, "x", 60);
    const out = await cache.zrange(key);
    expect(out).toHaveLength(1);
    expect(out[0]!.score).toBe(5);
  });

  it("zrange byScore filters inclusively", async () => {
    const cache = getCacheClient();
    const key = "test:zset:c";
    for (let i = 1; i <= 10; i++) {
      await cache.zadd(key, i, `m${i}`, 60);
    }
    const out = await cache.zrange(key, { byScore: { min: 3, max: 7 } });
    expect(out.map((m) => m.score)).toEqual([3, 4, 5, 6, 7]);
  });

  it("zrange limit caps the result count", async () => {
    const cache = getCacheClient();
    const key = "test:zset:d";
    for (let i = 1; i <= 10; i++) {
      await cache.zadd(key, i, `m${i}`, 60);
    }
    const out = await cache.zrange(key, { limit: 3 });
    expect(out).toHaveLength(3);
    expect(out.map((m) => m.score)).toEqual([1, 2, 3]);
  });

  it("zremrangebyscore removes members in the inclusive range", async () => {
    const cache = getCacheClient();
    const key = "test:zset:e";
    for (let i = 1; i <= 10; i++) {
      await cache.zadd(key, i, `m${i}`, 60);
    }
    const removed = await cache.zremrangebyscore(key, 3, 7);
    expect(removed).toBe(5);
    const out = await cache.zrange(key);
    expect(out.map((m) => m.score)).toEqual([1, 2, 8, 9, 10]);
  });

  it("zrange returns an empty array for a missing key", async () => {
    const cache = getCacheClient();
    const out = await cache.zrange("test:zset:does-not-exist");
    expect(out).toEqual([]);
  });

  it("delete removes the ZSet too", async () => {
    const cache = getCacheClient();
    const key = "test:zset:del";
    await cache.zadd(key, 1, "a", 60);
    await cache.delete(key);
    expect(await cache.zrange(key)).toEqual([]);
  });

  it("zrange returns a defensive copy (caller mutation does not affect internal state)", async () => {
    const cache = getCacheClient();
    const key = "test:zset:defensive";
    await cache.zadd(key, 1, "a", 60);
    const out = await cache.zrange(key);
    out[0]!.score = 999;
    const out2 = await cache.zrange(key);
    expect(out2[0]!.score).toBe(1);
  });
});
