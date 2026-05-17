import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../../src/index.js";
import { resetMetricsForTests, recordHit, recordMiss } from "../../src/cache/metrics.js";

beforeEach(() => {
  resetMetricsForTests();
});

describe("GET /health/metrics", () => {
  it("returns a JSON snapshot with zeroed counters on a fresh process", async () => {
    const res = await app.request("/health/metrics");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toEqual({ hits: 0, misses: 0 });
    expect(body.byNamespace).toEqual({});
    expect(typeof body.uptimeSeconds).toBe("number");
    expect(body.cacheBackend).toBe("memory");
  });

  it("reflects recorded hits and misses by namespace", async () => {
    recordMiss("apple:lookup");
    recordHit("apple:lookup");
    recordMiss("apple:keyword-rank");

    const res = await app.request("/health/metrics");
    const body = await res.json();
    expect(body.byNamespace["apple:lookup"]).toEqual({ hits: 1, misses: 1 });
    expect(body.byNamespace["apple:keyword-rank"]).toEqual({ hits: 0, misses: 1 });
    expect(body.total).toEqual({ hits: 1, misses: 2 });
  });
});
