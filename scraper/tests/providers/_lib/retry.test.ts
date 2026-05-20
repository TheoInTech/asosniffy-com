import { describe, expect, it } from "vitest";
import {
  backoffMs,
  isRetryableHttpStatus,
  withRetry,
} from "../../../src/providers/_lib/retry.js";

describe("backoffMs", () => {
  it("never exceeds the cap", () => {
    const ms = backoffMs(10, 100, 1000, () => 0.999);
    expect(ms).toBeLessThanOrEqual(1000);
  });

  it("respects full-jitter range [0, ceiling]", () => {
    const ms = backoffMs(2, 100, 1000, () => 0.5);
    // attempt 2: ceiling = min(1000, 100*4) = 400; 0.5*400 = 200
    expect(ms).toBe(200);
  });

  it("never returns negative", () => {
    const ms = backoffMs(0, 100, 1000, () => 0);
    expect(ms).toBeGreaterThanOrEqual(0);
  });
});

describe("isRetryableHttpStatus", () => {
  it("treats 429 and 408 as retryable", () => {
    expect(isRetryableHttpStatus(429)).toBe(true);
    expect(isRetryableHttpStatus(408)).toBe(true);
  });
  it("treats 5xx as retryable", () => {
    expect(isRetryableHttpStatus(500)).toBe(true);
    expect(isRetryableHttpStatus(503)).toBe(true);
  });
  it("does not retry other 4xx", () => {
    expect(isRetryableHttpStatus(400)).toBe(false);
    expect(isRetryableHttpStatus(404)).toBe(false);
    expect(isRetryableHttpStatus(403)).toBe(false);
  });
});

describe("withRetry", () => {
  it("returns ok on the first successful attempt", async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts += 1;
        return { kind: "ok" } as const;
      },
      { attempts: 3, baseMs: 1, capMs: 1 },
    );
    expect(result.kind).toBe("ok");
    expect(attempts).toBe(1);
  });

  it("retries on transient failure and eventually returns ok", async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) return { kind: "retry" } as const;
        return { kind: "ok" } as const;
      },
      { attempts: 3, baseMs: 1, capMs: 1 },
    );
    expect(result.kind).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("gives up after exhausting attempts", async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts += 1;
        return { kind: "retry" } as const;
      },
      { attempts: 2, baseMs: 1, capMs: 1 },
    );
    expect(result.kind).toBe("give_up");
    expect(attempts).toBe(3); // initial + 2 retries
  });

  it("returns give_up immediately when the fn says so", async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts += 1;
        return { kind: "give_up", reason: "fatal" } as const;
      },
      { attempts: 5, baseMs: 1, capMs: 1 },
    );
    expect(result.kind).toBe("give_up");
    expect(attempts).toBe(1);
  });
});
