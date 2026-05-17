import { beforeEach, describe, expect, it, vi } from "vitest";
import { withCache } from "../../src/cache/wrapper.js";
import { resetCacheClientForTests } from "../../src/cache/redis.js";
import { getMetrics, resetMetricsForTests } from "../../src/cache/metrics.js";

beforeEach(() => {
  resetCacheClientForTests();
  resetMetricsForTests();
});

describe("withCache", () => {
  it("calls the provider exactly once across two identical requests", async () => {
    const provider = vi.fn(async () => ({
      id: "1",
      name: "Example",
      provenance: "live" as const,
    }));

    const first = await withCache(provider, {
      key: "test:1",
      ttlSeconds: 60,
      namespace: "test",
    });
    const second = await withCache(provider, {
      key: "test:1",
      ttlSeconds: 60,
      namespace: "test",
    });

    expect(provider).toHaveBeenCalledTimes(1);
    expect(first.provenance).toBe("live");
    expect(second.provenance).toBe("cached");
  });

  it("does NOT cache error envelopes", async () => {
    const provider = vi.fn(async () => ({ error: "rate_limited" }));

    await withCache(provider, {
      key: "test:err",
      ttlSeconds: 60,
      namespace: "test",
    });
    await withCache(provider, {
      key: "test:err",
      ttlSeconds: 60,
      namespace: "test",
    });

    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("rewrites provenance on each element of an array result", async () => {
    const provider = vi.fn(async () => [
      { id: "1", provenance: "live" as const },
      { id: "2", provenance: "live" as const },
    ]);

    await withCache(provider, {
      key: "test:arr",
      ttlSeconds: 60,
      namespace: "test",
    });
    const second = await withCache(provider, {
      key: "test:arr",
      ttlSeconds: 60,
      namespace: "test",
    });

    expect(second.every((r) => r.provenance === "cached")).toBe(true);
  });

  it("increments hit and miss counters on the supplied namespace", async () => {
    const provider = vi.fn(async () => ({ provenance: "live" as const }));

    await withCache(provider, { key: "test:m", ttlSeconds: 60, namespace: "apple:lookup" });
    await withCache(provider, { key: "test:m", ttlSeconds: 60, namespace: "apple:lookup" });

    const metrics = getMetrics();
    expect(metrics.byNamespace["apple:lookup"]).toEqual({ hits: 1, misses: 1 });
    expect(metrics.total.hits).toBe(1);
    expect(metrics.total.misses).toBe(1);
  });

  it("respects TTL via the in-memory backend (entry expires after ttlSeconds * 1000)", async () => {
    vi.useFakeTimers();
    try {
      const provider = vi.fn(async () => ({ provenance: "live" as const }));

      await withCache(provider, { key: "test:ttl", ttlSeconds: 1, namespace: "test" });
      vi.advanceTimersByTime(1500);
      await withCache(provider, { key: "test:ttl", ttlSeconds: 1, namespace: "test" });

      expect(provider).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
