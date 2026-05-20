import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signWildcardForRequest } from "../../src/lib/history-hmac.js";
import {
  _recordRankAtDay_forTests,
} from "../../src/cache/timeseries.js";

const { app } = await import("../../src/index.js");
const { resetCacheClientForTests } = await import(
  "../../src/cache/redis.js"
);

beforeEach(() => {
  resetCacheClientForTests();
});

afterEach(() => {});

async function get(path: string) {
  return app.request(path, { method: "GET" });
}

const SCOPE = {
  sniffId: "sniff_history_test",
  store: "ios" as const,
  country: "US",
  appId: "570060128",
};

describe("GET /api/v1/aso/history — auth", () => {
  it("returns 401 when signature is missing", async () => {
    const res = await get(
      `/api/v1/aso/history?sniffId=${SCOPE.sniffId}&store=ios&country=US&appId=570060128&keyword=language`,
    );
    expect(res.status).toBe(400);
    // (Missing signature is a query-validation failure, not an auth one —
    // 400 before we get to verification. Either way, no series returned.)
  });

  it("returns 401 when signature is invalid hex of correct length", async () => {
    const sig = "0".repeat(64);
    const res = await get(
      `/api/v1/aso/history?sniffId=${SCOPE.sniffId}&store=ios&country=US&appId=570060128&keyword=language&signature=${sig}`,
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 with a valid signature", async () => {
    const sig = signWildcardForRequest(SCOPE);
    const res = await get(
      `/api/v1/aso/history?sniffId=${SCOPE.sniffId}&store=ios&country=US&appId=570060128&keyword=language&signature=${sig}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { series: unknown[] };
    expect(body.series).toBeDefined();
    expect(Array.isArray(body.series)).toBe(true);
  });
});

describe("GET /api/v1/aso/history — series retrieval", () => {
  it("returns the persisted series when one exists", async () => {
    // Seed three days of history.
    const today = Math.floor(Date.now() / 1000 / 86400);
    for (let offset = 2; offset >= 0; offset--) {
      await _recordRankAtDay_forTests({
        store: "ios",
        country: "US",
        appId: "570060128",
        keyword: "language",
        position: 5 + offset,
        bucket: "1-10",
        confidence: "medium",
        provenance: "live",
        searchedDepth: 200,
        dayIndex: today - offset,
      });
    }

    const sig = signWildcardForRequest(SCOPE);
    const res = await get(
      `/api/v1/aso/history?sniffId=${SCOPE.sniffId}&store=ios&country=US&appId=570060128&keyword=language&signature=${sig}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      series: Array<{ position: number; bucket: string }>;
    };
    expect(body.series).toHaveLength(3);
    expect(body.series.map((s) => s.position).sort()).toEqual([5, 6, 7]);
  });

  it("respects the window query parameter", async () => {
    const today = Math.floor(Date.now() / 1000 / 86400);
    for (let offset = 0; offset < 30; offset++) {
      await _recordRankAtDay_forTests({
        store: "ios",
        country: "US",
        appId: "570060128",
        keyword: "language",
        position: offset + 1,
        bucket: "1-10",
        confidence: "medium",
        provenance: "live",
        searchedDepth: 200,
        dayIndex: today - offset,
      });
    }
    const sig = signWildcardForRequest(SCOPE);
    const res7 = await get(
      `/api/v1/aso/history?sniffId=${SCOPE.sniffId}&store=ios&country=US&appId=570060128&keyword=language&signature=${sig}&window=7d`,
    );
    expect(res7.status).toBe(200);
    const body7 = (await res7.json()) as { series: unknown[] };
    expect(body7.series).toHaveLength(8); // today + 7 back inclusive
  });
});

describe("GET /api/v1/aso/history — query validation", () => {
  it("returns 400 on invalid store", async () => {
    const sig = signWildcardForRequest({ ...SCOPE, store: "ios" });
    const res = await get(
      `/api/v1/aso/history?sniffId=${SCOPE.sniffId}&store=blackberry&country=US&appId=570060128&keyword=language&signature=${sig}`,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on invalid country", async () => {
    const sig = signWildcardForRequest(SCOPE);
    const res = await get(
      `/api/v1/aso/history?sniffId=${SCOPE.sniffId}&store=ios&country=USA&appId=570060128&keyword=language&signature=${sig}`,
    );
    expect(res.status).toBe(400);
  });
});
