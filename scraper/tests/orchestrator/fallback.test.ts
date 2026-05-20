import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { resetCacheClientForTests } from "../../src/cache/redis.js";
import { resetMetricsForTests } from "../../src/cache/metrics.js";
import { generateReport } from "../../src/orchestrator/index.js";
import { getFullReportData } from "../../src/data/report-data.js";
import type { RequestId, SniffId } from "../../src/schemas/index.js";

const TARGET_APP_ID = "570060128";

const lookupBody = {
  resultCount: 1,
  results: [
    {
      trackId: Number(TARGET_APP_ID),
      trackName: "Duolingo",
      artistName: "Duolingo, Inc.",
      primaryGenreName: "Education",
      description: "Learn a language for free.",
      screenshotUrls: ["https://example.com/s1.png"],
      averageUserRating: 4.7,
      userRatingCount: 1500000,
      version: "7.1.2",
    },
  ],
};

function searchBody(includeTarget: boolean, padTo: number) {
  const results: Array<Record<string, unknown>> = [];
  if (includeTarget) {
    results.push({
      trackId: Number(TARGET_APP_ID),
      trackName: "Duolingo",
      artistName: "Duolingo, Inc.",
      primaryGenreName: "Education",
      description: "",
      screenshotUrls: [],
      averageUserRating: 4.7,
      userRatingCount: 1500000,
      version: "7.1.2",
    });
  }
  while (results.length < padTo) {
    results.push({
      trackId: 9000000 + results.length,
      trackName: `Filler ${results.length}`,
      artistName: "Other Dev",
      primaryGenreName: "Education",
      description: "",
      screenshotUrls: [],
      averageUserRating: 4.0,
      userRatingCount: 100,
      version: "1.0",
    });
  }
  return { resultCount: results.length, results };
}

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  resetCacheClientForTests();
  resetMetricsForTests();
});

const REPORT_INPUT = {
  requestId: "req_test_001" as RequestId,
  sniffId: "sniff_test_001" as SniffId,
  store: "ios" as const,
  app: TARGET_APP_ID,
  country: "US",
  keywords: ["language"],
};

const REPORT_DATA_INPUT = {
  store: "ios" as const,
  app: TARGET_APP_ID,
  country: "US",
  keywords: ["language"],
};

describe("Orchestrator fallback chain — all live", () => {
  it("dataProvenance reflects live when Apple lookup + search succeed", async () => {
    server.use(
      http.get("https://itunes.apple.com/lookup", () => HttpResponse.json(lookupBody)),
      http.get("https://itunes.apple.com/search", () =>
        HttpResponse.json(searchBody(true, 200)),
      ),
    );

    const report = await generateReport(REPORT_INPUT);
    expect(report.dataProvenance.appMetadata).toBe("live");
    expect(report.dataProvenance.keywordRank).toBe("live");
    expect(report.dataProvenance.competitors).toBe("live");
    // Phase 04: synthesis runs unconditionally; recommendations are always
    // 'inferred' regardless of whether OpenAI or the template fallback fired.
    expect(report.dataProvenance.recommendations).toBe("inferred");
    expect(report.keywordDiagnosis[0]?.rankBucket).toBe("1-10");
  });
});

describe("Orchestrator fallback chain — Apple lookup rate-limited, cache warm", () => {
  it("dataProvenance.appMetadata is 'cached' after warming the cache", async () => {
    // Warm the cache by serving a successful response first.
    server.use(
      http.get("https://itunes.apple.com/lookup", () => HttpResponse.json(lookupBody)),
      http.get("https://itunes.apple.com/search", () =>
        HttpResponse.json(searchBody(true, 200)),
      ),
    );
    await getFullReportData(REPORT_DATA_INPUT);

    // Second call: Apple lookup is now rate-limited; cache should serve.
    server.resetHandlers();
    server.use(
      http.get(
        "https://itunes.apple.com/lookup",
        () => new HttpResponse(null, { status: 429 }),
      ),
      http.get("https://itunes.apple.com/search", () =>
        HttpResponse.json(searchBody(true, 200)),
      ),
    );

    const report = await generateReport(REPORT_INPUT);
    expect(report.dataProvenance.appMetadata).toBe("cached");
  });
});

describe("Orchestrator fallback chain — all providers down, no cache (Phase 1: degraded, never fixture)", () => {
  it("returns a structurally valid report with every section marked degraded (NOT fixture)", async () => {
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

    const report = await generateReport(REPORT_INPUT);
    // Phase 1 honest-floor: transient provider errors degrade rows rather
    // than silently substituting fixture data. The orchestrator default
    // (allowFixtureFallback: false) means /diagnose never returns fixture.
    expect(report.dataProvenance.appMetadata).toBe("degraded");
    expect(report.dataProvenance.keywordRank).toBe("degraded");
    expect(report.dataProvenance.competitors).toBe("degraded");
    // Recommendations now propagate worst-input provenance. With every input
    // degraded, the synthesis emits sample-disclaimer copy stamped 'degraded'
    // — NOT the old "inferred" lie.
    expect(report.dataProvenance.recommendations).toBe("degraded");

    // Report still has every required section populated even in the
    // degraded path — the disclaimer synthesizer fills them.
    expect(report.keywordDiagnosis.length).toBe(1);
    expect(report.metadataScore.overall).toBeGreaterThanOrEqual(0);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });
});

describe("Orchestrator — allowFixtureFallback: true still permits fixture (used by /sample)", () => {
  it("dataProvenance.appMetadata becomes 'fixture' when allowFixtureFallback is true and providers fail", async () => {
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
    const report = await generateReport({
      ...REPORT_INPUT,
      allowFixtureFallback: true,
    });
    expect(report.dataProvenance.appMetadata).toBe("fixture");
    expect(report.dataProvenance.recommendations).toBe("fixture");
  });
});
