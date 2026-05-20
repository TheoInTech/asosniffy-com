import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { parseUnits } from "viem";

// Mock the facilitator so this test doesn't try to settle a real payment —
// the focus is on the data-side provenance, not the payment rail. Skip
// facilitator entirely by returning null (fixture-receipt mode).
vi.mock("../../src/services/facilitator.js", () => ({
  getFacilitator: () => null,
  __resetFacilitatorForTests: () => {},
}));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const { app } = await import("../../src/index.js");
const { resetCacheClientForTests } = await import("../../src/cache/redis.js");
const { resetMetricsForTests } = await import("../../src/cache/metrics.js");

beforeEach(() => {
  resetCacheClientForTests();
  resetMetricsForTests();
});

const MERCHANT = "0x000000000000000000000000000000000000c0de";

function buildAuthHeader(): string {
  const validBefore = Math.floor(Date.now() / 1000) + 600;
  const payload = {
    x402Version: 2,
    scheme: "exact",
    network: "eip155:2910",
    payload: {
      signature: "0xdeadbeef",
      authorization: {
        from: `0x${"11".repeat(20)}`,
        to: MERCHANT,
        value: parseUnits("0.04", 18).toString(),
        validAfter: "0",
        validBefore: validBefore.toString(),
        nonce: `0x${"ab".repeat(32)}`,
      },
    },
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

describe("POST /api/v1/aso/diagnose — Phase 1 honest-floor: never fixture under live failure", () => {
  it("iTunes 429 → recommendations.provenance is 'degraded', never 'fixture'", async () => {
    server.use(
      http.get(
        "https://itunes.apple.com/lookup",
        () => new HttpResponse(null, { status: 429 }),
      ),
      http.get(
        "https://itunes.apple.com/search",
        () => new HttpResponse(null, { status: 429 }),
      ),
    );

    const res = await app.request("/api/v1/aso/diagnose", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "PAYMENT-SIGNATURE": buildAuthHeader(),
      },
      body: JSON.stringify({
        sniffId: "sniff_test_degraded",
        store: "ios",
        app: "Pawprint Habits",
        country: "US",
        keywords: ["habit tracker"],
      }),
    });

    expect(res.status).toBe(200);
    const parsed = await res.json();
    // Honest-floor invariant: provenance for fields with no live data is
    // 'degraded', NOT 'fixture'.
    expect(parsed.dataProvenance.appMetadata).toBe("degraded");
    expect(parsed.dataProvenance.keywordRank).toBe("degraded");
    expect(parsed.dataProvenance.recommendations).toBe("degraded");
    expect(parsed.dataProvenance.recommendations).not.toBe("inferred");

    // Provider-error header is surfaced for SDK consumers.
    const errHeader = res.headers.get("X-Sniffy-Provider-Errors");
    expect(errHeader).toBeTruthy();
  });
});

describe("POST /api/v1/aso/diagnose — Phase 1 honest-floor: inferred requires real inputs", () => {
  it("all live → recommendations.provenance is 'inferred'", async () => {
    const lookupBody = {
      resultCount: 1,
      results: [
        {
          trackId: 570060128,
          trackName: "Duolingo",
          artistName: "Duolingo, Inc.",
          primaryGenreName: "Education",
          description: "Learn a language.",
          screenshotUrls: ["https://example.com/s.png"],
          averageUserRating: 4.7,
          userRatingCount: 1500000,
          version: "7.1",
          artworkUrl100: "https://example.com/icon.png",
        },
      ],
    };
    function searchBody() {
      return {
        resultCount: 50,
        results: Array.from({ length: 50 }, (_, i) => ({
          trackId: i === 0 ? 570060128 : 9000000 + i,
          trackName: i === 0 ? "Duolingo" : `Filler ${i}`,
          artistName: "Some Developer",
          primaryGenreName: "Education",
          description: "",
          screenshotUrls: [],
          averageUserRating: 4.0,
          userRatingCount: 100,
          version: "1.0",
        })),
      };
    }
    server.use(
      http.get("https://itunes.apple.com/lookup", () => HttpResponse.json(lookupBody)),
      http.get("https://itunes.apple.com/search", () => HttpResponse.json(searchBody())),
    );

    const res = await app.request("/api/v1/aso/diagnose", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "PAYMENT-SIGNATURE": buildAuthHeader(),
      },
      body: JSON.stringify({
        sniffId: "sniff_test_live",
        store: "ios",
        app: "570060128",
        country: "US",
        keywords: ["language"],
      }),
    });
    expect(res.status).toBe(200);
    const parsed = await res.json();
    expect(parsed.dataProvenance.appMetadata).toBe("live");
    expect(parsed.dataProvenance.keywordRank).toBe("live");
    expect(parsed.dataProvenance.recommendations).toBe("inferred");
  });
});
