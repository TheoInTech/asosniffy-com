import { beforeEach, describe, expect, it, vi } from "vitest";
import { acquire, acquireOrWait } from "../../../src/providers/_lib/token-bucket.js";
import { resetCacheClientForTests } from "../../../src/cache/redis.js";

beforeEach(() => {
  resetCacheClientForTests();
  vi.useRealTimers();
});

describe("acquire — token bucket basic semantics", () => {
  it("returns ok within budget", async () => {
    for (let i = 0; i < 5; i++) {
      const result = await acquire({ provider: "test-a", perMinuteBudget: 5 });
      expect(result.ok).toBe(true);
    }
  });

  it("returns wait once the per-minute budget is exhausted", async () => {
    for (let i = 0; i < 3; i++) {
      await acquire({ provider: "test-b", perMinuteBudget: 3 });
    }
    const blocked = await acquire({ provider: "test-b", perMinuteBudget: 3 });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterMs).toBeGreaterThan(0);
      expect(blocked.retryAfterMs).toBeLessThanOrEqual(60_000);
    }
  });

  it("never blocks when budget is zero (no rate limit)", async () => {
    for (let i = 0; i < 100; i++) {
      const result = await acquire({ provider: "test-c", perMinuteBudget: 0 });
      expect(result.ok).toBe(true);
    }
  });

  it("each provider keeps an independent budget", async () => {
    for (let i = 0; i < 3; i++) {
      await acquire({ provider: "test-d", perMinuteBudget: 3 });
    }
    const blockedD = await acquire({ provider: "test-d", perMinuteBudget: 3 });
    expect(blockedD.ok).toBe(false);

    const stillOpenE = await acquire({ provider: "test-e", perMinuteBudget: 3 });
    expect(stillOpenE.ok).toBe(true);
  });
});

describe("acquireOrWait — opt-in waiting", () => {
  it("returns ok without waiting when within budget", async () => {
    const result = await acquireOrWait({
      provider: "test-f",
      perMinuteBudget: 5,
      maxWaitMs: 0,
    });
    expect(result.ok).toBe(true);
  });

  it("returns wait when maxWaitMs is 0 and budget is spent", async () => {
    for (let i = 0; i < 3; i++) {
      await acquire({ provider: "test-g", perMinuteBudget: 3 });
    }
    const result = await acquireOrWait({
      provider: "test-g",
      perMinuteBudget: 3,
      maxWaitMs: 0,
    });
    expect(result.ok).toBe(false);
  });
});
