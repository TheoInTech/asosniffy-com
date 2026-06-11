import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  InsightsListResponse,
  PublicShowcaseReport,
} from "../../src/schemas/index.js";

vi.mock("../../src/services/facilitator.js", () => ({
  getFacilitator: () => null,
  __resetFacilitatorForTests: () => {},
}));

const { app } = await import("../../src/index.js");
const { resetCacheClientForTests } = await import("../../src/cache/redis.js");
const { resetMetricsForTests } = await import("../../src/cache/metrics.js");
const { saveShowcase } = await import("../../src/insights/store.js");
const { redactForShowcase } = await import(
  "../../src/lib/redact-for-showcase.js"
);
const schemas = await import("../../src/schemas/index.js");

function buildPaidStub(appName: string): schemas.DiagnosePaidResponse {
  return {
    requestId: "req_test",
    sniffId: "sniff_test",
    reportVersion: "2026-06-mvp-6",
    receipt: {
      network: "eip155:2910",
      facilitator: "morph-official",
      facilitatorMode: "morph-official",
      amount: "0.20",
      atomicAmount: "200000",
      asset: "0x0000000000000000000000000000000000000001",
      transactionHash: "0xdeadbeef",
      settledAt: "2026-05-22T12:00:00.000Z",
    },
    dataProvenance: {
      appMetadata: "live",
      keywordRank: "live",
      competitors: "live",
      recommendations: "inferred",
    },
    summary: `Summary for ${appName}`,
    keywordDiagnosis: [],
    competitorTrail: [],
    metadataScore: {
      overall: 50,
      weights: {
        title: 20,
        subtitle: 15,
        keywords: 20,
        screenshots: 10,
        ratingsAndReviews: 15,
        keywordRankings: 20,
      },
      title: { score: 50, notes: "ok" },
      subtitle: { score: 50, notes: "ok" },
      keywords: { score: 50, notes: "ok" },
      screenshots: { score: 50, notes: "ok" },
      ratingsAndReviews: { score: 50, notes: "ok" },
      keywordRankings: { score: 50, notes: "ok" },
      descriptionDensity: [],
    },
    keywordDistribution: [],
    recommendations: [],
    readyToPaste: {
      title: { current: "T", recommended: null, changeReason: null, charCount: 1, charLimit: 30 },
      subtitle: { current: "S", recommended: null, changeReason: null, charCount: 1, charLimit: 30 },
      keywordsField: { current: "K", recommended: null, changeReason: null, charCount: 1, charLimit: 100 },
      promotionalText: null,
      androidShortDescription: null,
      shortDescription: { current: "SD", recommended: null, changeReason: null, charCount: 2, charLimit: 240 },
      source: "deterministic",
    },
    suggestedKeywords: [],
    regressions: [],
    historySignature: "",
    localizationAnalysis: null,
    targetAppSignals: null,
    packCredit: null,
  };
}

async function seed(
  appId: string,
  appName: string,
  settledAt: string,
): Promise<void> {
  const { entry, report } = redactForShowcase({
    report: buildPaidStub(appName),
    store: "ios",
    country: "US",
    appId,
    appName,
    appDeveloper: "Test Studio",
    iconUrl: null,
    now: new Date(settledAt),
  });
  await saveShowcase({ entry, report });
}

beforeEach(() => {
  resetCacheClientForTests();
  resetMetricsForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/v1/aso/insights", () => {
  it("returns an empty entries list when nothing has been showcased", async () => {
    const res = await app.request("/api/v1/aso/insights");
    expect(res.status).toBe(200);
    const parsed = InsightsListResponse.parse(await res.json());
    expect(parsed.entries).toEqual([]);
    expect(parsed.freshestAt).toBeNull();
    expect(parsed.filters.limit).toBe(50);
  });

  it("returns showcased entries newest-first", async () => {
    await seed("111", "Old", "2026-05-22T10:00:00.000Z");
    await seed("222", "Mid", "2026-05-22T11:00:00.000Z");
    await seed("333", "New", "2026-05-22T12:00:00.000Z");

    const res = await app.request("/api/v1/aso/insights");
    expect(res.status).toBe(200);
    const parsed = InsightsListResponse.parse(await res.json());
    expect(parsed.entries.map((e) => e.appId)).toEqual(["333", "222", "111"]);
    expect(parsed.freshestAt).toBe("2026-05-22T12:00:00.000Z");
  });

  it("honors ?limit and clamps to [1, 200]", async () => {
    for (let i = 0; i < 5; i++) {
      await seed(
        `app_${i}`,
        `App ${i}`,
        new Date(2026, 0, 1, 12, i).toISOString(),
      );
    }
    const res = await app.request("/api/v1/aso/insights?limit=2");
    expect(res.status).toBe(200);
    const parsed = InsightsListResponse.parse(await res.json());
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.filters.limit).toBe(2);
  });

  it("rejects invalid store query with 400", async () => {
    const res = await app.request("/api/v1/aso/insights?store=symbian");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("invalid_query");
  });

  it("rejects invalid country query with 400", async () => {
    const res = await app.request("/api/v1/aso/insights?country=USA");
    expect(res.status).toBe(400);
  });

  it("rejects out-of-range limit with 400", async () => {
    const res = await app.request("/api/v1/aso/insights?limit=999");
    expect(res.status).toBe(400);
  });

  it("sets a CDN-friendly Cache-Control header", async () => {
    const res = await app.request("/api/v1/aso/insights");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("public");
    expect(res.headers.get("Cache-Control")).toContain("max-age");
  });
});

describe("GET /api/v1/aso/insights/:store/:country/:appId", () => {
  it("returns 404 with showcase_not_found for a tuple that wasn't showcased", async () => {
    const res = await app.request("/api/v1/aso/insights/ios/US/999");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("showcase_not_found");
  });

  it("returns the report when the tuple exists", async () => {
    await seed("123", "Findable", "2026-05-22T12:00:00.000Z");
    const res = await app.request("/api/v1/aso/insights/ios/US/123");
    expect(res.status).toBe(200);
    const parsed = PublicShowcaseReport.parse(await res.json());
    expect(parsed.detectedApp.name).toBe("Findable");
    expect(parsed.appId).toBe("123");
    expect(parsed.summary).toBe("Summary for Findable");
  });

  it("rejects an invalid store path param with 400", async () => {
    const res = await app.request("/api/v1/aso/insights/blackberry/US/123");
    expect(res.status).toBe(400);
  });

  it("rejects an invalid country path param with 400", async () => {
    const res = await app.request("/api/v1/aso/insights/ios/USA/123");
    expect(res.status).toBe(400);
  });

  it("sets a CDN-friendly 5-minute Cache-Control header on hits", async () => {
    await seed("123", "Cacheable", "2026-05-22T12:00:00.000Z");
    const res = await app.request("/api/v1/aso/insights/ios/US/123");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("max-age=300");
  });
});
