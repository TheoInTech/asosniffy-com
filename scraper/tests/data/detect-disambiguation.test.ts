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
import { getDetectedApp } from "../../src/data/detect.js";
import { resetCacheClientForTests } from "../../src/cache/redis.js";
import { resetMetricsForTests } from "../../src/cache/metrics.js";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  resetCacheClientForTests();
  resetMetricsForTests();
});

function makeApp(overrides: {
  id: number;
  name: string;
  ratings?: number;
  bundleId?: string;
}) {
  return {
    trackId: overrides.id,
    trackName: overrides.name,
    artistName: "Some Developer",
    primaryGenreName: "Productivity",
    description: "",
    screenshotUrls: [],
    averageUserRating: 4.5,
    userRatingCount: overrides.ratings ?? 100,
    version: "1.0",
    artworkUrl100: `https://example.com/icon-${overrides.id}.png`,
    bundleId: overrides.bundleId,
  };
}

describe("getDetectedApp — disambiguation by name", () => {
  it("high-confidence exact match returns no candidates", async () => {
    server.use(
      http.get("https://itunes.apple.com/search", () =>
        HttpResponse.json({
          resultCount: 3,
          results: [
            makeApp({ id: 1, name: "Pawprint Habits", ratings: 1500 }),
            makeApp({ id: 2, name: "Habit Builder", ratings: 200 }),
            makeApp({ id: 3, name: "Habit Tracker", ratings: 50 }),
          ],
        }),
      ),
    );

    const result = await getDetectedApp({
      store: "ios",
      app: "Pawprint Habits",
      country: "US",
    });

    expect(result.identityConfidence).toBe("high");
    expect(result.candidates).toEqual([]);
    expect(result.detectedApp.name).toBe("Pawprint Habits");
  });

  it("ambiguous name returns candidates[] sorted by similarity", async () => {
    server.use(
      http.get("https://itunes.apple.com/search", () =>
        HttpResponse.json({
          resultCount: 5,
          results: [
            makeApp({ id: 1, name: "Notebook Pro" }),
            makeApp({ id: 2, name: "Notes & More" }),
            makeApp({ id: 3, name: "Quick Notes" }),
            makeApp({ id: 4, name: "Photo Notes" }),
            makeApp({ id: 5, name: "Sticky Notes Free" }),
          ],
        }),
      ),
    );

    const result = await getDetectedApp({
      store: "ios",
      app: "notes",
      country: "US",
    });

    // None of these is "notes" exactly — should be medium-or-low confidence.
    expect(result.identityConfidence).not.toBe("high");
    expect(result.candidates.length).toBeGreaterThanOrEqual(3);
    // Top candidate has the highest similarity.
    for (let i = 0; i < result.candidates.length - 1; i++) {
      expect(result.candidates[i]!.similarityScore).toBeGreaterThanOrEqual(
        result.candidates[i + 1]!.similarityScore,
      );
    }
  });

  it("returns degraded provenance + low identity when search returns no results", async () => {
    server.use(
      http.get("https://itunes.apple.com/search", () =>
        HttpResponse.json({ resultCount: 0, results: [] }),
      ),
    );

    const result = await getDetectedApp({
      store: "ios",
      app: "completely-fake-app-xyz",
      country: "US",
    });

    expect(result.provenance).toBe("degraded");
    expect(result.identityConfidence).toBe("low");
    expect(result.providerErrors.length).toBeGreaterThan(0);
    expect(result.providerErrors[0]!.kind).toBe("not_found");
  });

  it("returns degraded (NOT fixture) when iTunes rate-limits and allowFixtureFallback is false", async () => {
    server.use(
      http.get(
        "https://itunes.apple.com/search",
        () => new HttpResponse(null, { status: 429 }),
      ),
    );

    const result = await getDetectedApp({
      store: "ios",
      app: "Pawprint Habits",
      country: "US",
      allowFixtureFallback: false,
    });

    expect(result.provenance).toBe("degraded");
    expect(result.providerErrors[0]!.kind).toBe("rate_limited");
  });

  it("returns fixture when allowFixtureFallback is true and provider fails", async () => {
    server.use(
      http.get(
        "https://itunes.apple.com/search",
        () => new HttpResponse(null, { status: 429 }),
      ),
    );

    const result = await getDetectedApp({
      store: "ios",
      app: "Pawprint Habits",
      country: "US",
      allowFixtureFallback: true,
    });

    expect(result.provenance).toBe("fixture");
  });
});

describe("getDetectedApp — appId path", () => {
  it("returns high identityConfidence on successful lookup", async () => {
    server.use(
      http.get("https://itunes.apple.com/lookup", () =>
        HttpResponse.json({
          resultCount: 1,
          results: [makeApp({ id: 570060128, name: "Duolingo" })],
        }),
      ),
    );

    const result = await getDetectedApp({
      store: "ios",
      app: "570060128",
      country: "US",
    });

    expect(result.identityConfidence).toBe("high");
    expect(result.candidates).toEqual([]);
    expect(result.detectedApp.id).toBe("570060128");
  });
});
