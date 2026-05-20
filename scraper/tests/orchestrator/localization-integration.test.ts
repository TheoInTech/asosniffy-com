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
import type { RequestId, SniffId } from "../../src/schemas/index.js";

const TARGET_APP_ID = "570060128";
const EN_DESC =
  "This is the official habit tracking app that helps you build daily routines with streaks reminders and beautiful charts daily.";
const JP_DESC =
  "これは習慣追跡アプリです。毎日のルーチンを構築し、ストリークを維持し、美しいチャートで進捗を確認できます。";

function lookupBody(country: string, description: string, title: string) {
  return {
    resultCount: 1,
    results: [
      {
        trackId: Number(TARGET_APP_ID),
        trackName: title,
        artistName: "Sample Studio",
        primaryGenreName: "Productivity",
        description,
        screenshotUrls: [],
        averageUserRating: 4.5,
        userRatingCount: 1000,
        version: "1.0",
        country, // for our visibility — iTunes doesn't echo it back, but msw can branch on the request
      },
    ],
  };
}

function searchBody(includeTarget: boolean, padTo: number) {
  const results: Array<Record<string, unknown>> = [];
  if (includeTarget) {
    results.push({
      trackId: Number(TARGET_APP_ID),
      trackName: "Pawprint Habits",
      artistName: "Sample Studio",
      primaryGenreName: "Productivity",
      description: EN_DESC,
      screenshotUrls: [],
      averageUserRating: 4.5,
      userRatingCount: 1000,
      version: "1.0",
    });
  }
  while (results.length < padTo) {
    results.push({
      trackId: 9000000 + results.length,
      trackName: `Filler ${results.length}`,
      artistName: "Other Dev",
      primaryGenreName: "Productivity",
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

describe("Phase 5 — localization analysis in /diagnose", () => {
  it("populates localizationAnalysis when iOS lookups succeed across storefronts", async () => {
    server.use(
      http.get("https://itunes.apple.com/lookup", ({ request }) => {
        const url = new URL(request.url);
        const country = url.searchParams.get("country") ?? "US";
        // US gets English; JP gets Japanese; everything else English (gap).
        const description =
          country === "JP" ? JP_DESC : EN_DESC;
        return HttpResponse.json(
          lookupBody(country, description, "Pawprint Habits"),
        );
      }),
      http.get("https://itunes.apple.com/search", () =>
        HttpResponse.json(searchBody(true, 200)),
      ),
    );

    const report = await generateReport({
      requestId: "req_loc_test" as RequestId,
      sniffId: "sniff_loc_test" as SniffId,
      store: "ios",
      app: TARGET_APP_ID,
      country: "US",
      keywords: ["habit"],
    });

    expect(report.localizationAnalysis).not.toBeNull();
    const analysis = report.localizationAnalysis!;
    // US (request country) + LOCALIZATION_STOREFRONTS default set (US,GB,JP,DE,BR,KR).
    // De-duped, the orchestrator queries 6 storefronts.
    expect(analysis.storefronts.length).toBeGreaterThanOrEqual(6);
    const jp = analysis.storefronts.find((s) => s.country === "JP");
    expect(jp).toBeDefined();
    expect(jp!.localized).toBe(true); // JP got localized description
    const de = analysis.storefronts.find((s) => s.country === "DE");
    expect(de!.localized).toBe(false); // DE got English — gap
    expect(analysis.unlocalizedCount).toBeGreaterThan(0);
    expect(analysis.overallGapScore).not.toBeNull();
  });

  it("returns null localizationAnalysis when allowFixtureFallback=true (sample path)", async () => {
    server.use(
      http.get("https://itunes.apple.com/lookup", () =>
        HttpResponse.json(lookupBody("US", EN_DESC, "Pawprint Habits")),
      ),
      http.get("https://itunes.apple.com/search", () =>
        HttpResponse.json(searchBody(true, 200)),
      ),
    );

    const report = await generateReport({
      requestId: "req_loc_sample" as RequestId,
      sniffId: "sniff_loc_sample" as SniffId,
      store: "ios",
      app: TARGET_APP_ID,
      country: "US",
      keywords: ["habit"],
      allowFixtureFallback: true,
    });

    expect(report.localizationAnalysis).toBeNull();
  });
});
