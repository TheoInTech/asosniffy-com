import { beforeEach, describe, expect, it } from "vitest";
import { withCache } from "../../src/cache/wrapper.js";
import {
  getCacheClient,
  resetCacheClientForTests,
} from "../../src/cache/redis.js";
import { resetMetricsForTests } from "../../src/cache/metrics.js";

beforeEach(() => {
  resetCacheClientForTests();
  resetMetricsForTests();
});

describe("withCache — quarantine on validate failure", () => {
  it("re-executes fn and overwrites the cached value when validate returns false", async () => {
    const cache = getCacheClient();
    // Seed a bad value into the cache directly.
    await cache.set(
      "test:quarantine:a",
      JSON.stringify({ schemaVersion: 0, value: "stale" }),
      60,
    );

    let invocations = 0;
    const result = await withCache<{ schemaVersion: number; value: string }>(
      async () => {
        invocations += 1;
        return { schemaVersion: 1, value: "fresh" };
      },
      {
        key: "test:quarantine:a",
        ttlSeconds: 60,
        namespace: "test",
        validate: (v) => v.schemaVersion === 1,
      },
    );
    expect(invocations).toBe(1);
    expect(result.value).toBe("fresh");

    // Subsequent call with the same valid schema → cache hit.
    const second = await withCache<{ schemaVersion: number; value: string }>(
      async () => {
        invocations += 1;
        return { schemaVersion: 1, value: "should-not-fetch" };
      },
      {
        key: "test:quarantine:a",
        ttlSeconds: 60,
        namespace: "test",
        validate: (v) => v.schemaVersion === 1,
      },
    );
    expect(invocations).toBe(1); // fn not called again
    expect(second.value).toBe("fresh");
  });

  it("does not quarantine when validate returns true (normal cache hit)", async () => {
    const cache = getCacheClient();
    await cache.set(
      "test:quarantine:b",
      JSON.stringify({ ok: true }),
      60,
    );
    let invocations = 0;
    const result = await withCache<{ ok: boolean }>(
      async () => {
        invocations += 1;
        return { ok: true };
      },
      {
        key: "test:quarantine:b",
        ttlSeconds: 60,
        namespace: "test",
        validate: (v) => v.ok === true,
      },
    );
    expect(invocations).toBe(0); // cache hit
    expect(result.ok).toBe(true);
  });

  it("backwards-compatible: no validate option behaves like Phase 0/1", async () => {
    const cache = getCacheClient();
    await cache.set(
      "test:quarantine:c",
      JSON.stringify({ anything: "goes" }),
      60,
    );
    let invocations = 0;
    const result = await withCache<{ anything: string }>(
      async () => {
        invocations += 1;
        return { anything: "fresh" };
      },
      {
        key: "test:quarantine:c",
        ttlSeconds: 60,
        namespace: "test",
      },
    );
    expect(invocations).toBe(0);
    expect(result.anything).toBe("goes");
  });
});
