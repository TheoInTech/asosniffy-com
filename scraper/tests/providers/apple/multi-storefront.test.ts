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
import { lookupLocalized } from "../../../src/providers/apple/multi-storefront.js";
import { resetCacheClientForTests } from "../../../src/cache/redis.js";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  resetCacheClientForTests();
});

function makeApp(country: string, trackName: string) {
  return {
    trackId: 570060128,
    trackName,
    artistName: "Duolingo, Inc.",
    primaryGenreName: "Education",
    description: `Description in ${country}`,
    screenshotUrls: [],
    averageUserRating: 4.7,
    userRatingCount: 1500000,
    version: "7.1.2",
  };
}

describe("lookupLocalized", () => {
  it("fetches per-storefront in parallel and keys by uppercase country", async () => {
    server.use(
      http.get("https://itunes.apple.com/lookup", ({ request }) => {
        const url = new URL(request.url);
        const country = url.searchParams.get("country") ?? "";
        return HttpResponse.json({
          resultCount: 1,
          results: [makeApp(country, `Duolingo (${country})`)],
        });
      }),
    );
    const result = await lookupLocalized("570060128", ["us", "Gb", "JP"]);
    expect(Object.keys(result.storefronts).sort()).toEqual(["GB", "JP", "US"]);
    const us = result.storefronts.US;
    expect("error" in us!).toBe(false);
    if (!("error" in us!)) {
      expect(us.name).toBe("Duolingo (US)");
    }
  });

  it("de-duplicates input countries", async () => {
    let calls = 0;
    server.use(
      http.get("https://itunes.apple.com/lookup", ({ request }) => {
        calls += 1;
        const url = new URL(request.url);
        return HttpResponse.json({
          resultCount: 1,
          results: [
            makeApp(url.searchParams.get("country") ?? "", "Localized"),
          ],
        });
      }),
    );
    await lookupLocalized("570060128", ["US", "us", "US"]);
    expect(calls).toBe(1);
  });

  it("isolates per-storefront errors", async () => {
    server.use(
      http.get("https://itunes.apple.com/lookup", ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("country") === "FR") {
          return new HttpResponse(null, { status: 429 });
        }
        return HttpResponse.json({
          resultCount: 1,
          results: [makeApp("US", "Localized")],
        });
      }),
    );
    const result = await lookupLocalized("570060128", ["US", "FR"]);
    expect("error" in result.storefronts.FR!).toBe(true);
    expect("error" in result.storefronts.US!).toBe(false);
  });
});
