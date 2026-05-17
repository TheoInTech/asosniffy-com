import { beforeEach, describe, expect, it, vi } from "vitest";

// Force every Apple call to fail so the data layer falls back to fixture.
// Route tests are about routing/validation/shape — provider mocks belong in
// providers/apple/* tests and the orchestrator fallback test.
vi.mock("../../src/providers/apple/itunes.js", () => ({
  lookupApp: vi.fn(async () => ({ error: "network_error" })),
  searchApps: vi.fn(async () => ({ error: "network_error" })),
}));
vi.mock("../../src/providers/apple/keyword-rank.js", () => ({
  sampleKeywordRank: vi.fn(async () => ({ error: "network_error" })),
}));

const { app } = await import("../../src/index.js");
const { QuoteResponse } = await import("../../src/schemas/index.js");
const { resetCacheClientForTests } = await import("../../src/cache/redis.js");
const { resetMetricsForTests } = await import("../../src/cache/metrics.js");

beforeEach(() => {
  resetCacheClientForTests();
  resetMetricsForTests();
});

async function postQuote(body: unknown) {
  return app.request("/api/v1/aso/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/aso/quote", () => {
  it("accepts a flat App Store URL and returns a valid QuoteResponse", async () => {
    const res = await postQuote({
      store: "ios",
      app: "https://apps.apple.com/us/app/example/id123456789",
      country: "US",
      keywords: ["habit tracker"],
    });
    expect(res.status).toBe(200);
    const parsed = QuoteResponse.parse(await res.json());
    expect(parsed.shallowScan.previewKeyword.keyword).toBe("habit tracker");
    expect(parsed.detectedApp.id).toBe("123456789");
  });

  it("returns pricing whose breakdown sums to estimatedTotal", async () => {
    const res = await postQuote({
      store: "ios",
      app: "https://apps.apple.com/us/app/example/id1/",
      country: "US",
      keywords: ["a", "b", "c", "d", "e"],
    });
    expect(res.status).toBe(200);
    const parsed = QuoteResponse.parse(await res.json());
    const summed = parsed.pricing.breakdown.reduce(
      (acc, item) => acc + Math.round(parseFloat(item.amount) * 100),
      0,
    );
    expect(summed).toBe(Math.round(parseFloat(parsed.pricing.estimatedTotal) * 100));
  });

  it("accepts a flat numeric app ID", async () => {
    const res = await postQuote({
      store: "ios",
      app: "987654321",
      country: "US",
      keywords: ["habit tracker"],
    });
    expect(res.status).toBe(200);
    const parsed = QuoteResponse.parse(await res.json());
    expect(parsed.detectedApp.id).toBe("987654321");
  });

  it("accepts a flat app name string", async () => {
    const res = await postQuote({
      store: "ios",
      app: "Pawprint Habits",
      country: "US",
      keywords: ["habit tracker"],
    });
    expect(res.status).toBe(200);
    const parsed = QuoteResponse.parse(await res.json());
    expect(parsed.detectedApp.name).toBe("Pawprint Habits");
  });

  it("accepts the tagged-union app form", async () => {
    const res = await postQuote({
      store: "ios",
      app: { kind: "url", value: "https://apps.apple.com/us/app/x/id123" },
      country: "US",
      keywords: ["habit tracker"],
    });
    expect(res.status).toBe(200);
    const parsed = QuoteResponse.parse(await res.json());
    expect(parsed.detectedApp.id).toBe("123");
  });

  it("rejects invalid country codes with 400 + invalid_body", async () => {
    const res = await postQuote({
      store: "ios",
      app: "Habits",
      country: "USA",
      keywords: ["habit tracker"],
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_body");
  });

  it("rejects empty keyword arrays with 400", async () => {
    const res = await postQuote({
      store: "ios",
      app: "Habits",
      country: "US",
      keywords: [],
    });
    expect(res.status).toBe(400);
  });

  it("rejects keyword arrays beyond 10 entries with 400", async () => {
    const res = await postQuote({
      store: "ios",
      app: "Habits",
      country: "US",
      keywords: Array.from({ length: 11 }, (_, i) => `k${i}`),
    });
    expect(res.status).toBe(400);
  });
});
