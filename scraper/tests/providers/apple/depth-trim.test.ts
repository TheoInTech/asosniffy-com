import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { sampleKeywordRank } from "../../../src/providers/apple/keyword-rank.js";

const TARGET_APP_ID = "570060128";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function paddedResults(includeTarget: boolean, total: number) {
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
  while (results.length < total) {
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

describe("Phase-2 iOS depth-trim past 200", () => {
  it("emits rankBucket '100+' with confidence:low when refined search finds the app", async () => {
    // Primary search at depth 200: target NOT included.
    // Refined search ("{keyword} {refinement}"): target IS included.
    let callIndex = 0;
    server.use(
      http.get("https://itunes.apple.com/search", () => {
        callIndex += 1;
        if (callIndex === 1) {
          return HttpResponse.json(paddedResults(false, 200));
        }
        return HttpResponse.json(paddedResults(true, 50));
      }),
    );

    const result = await sampleKeywordRank({
      keyword: "language",
      country: "US",
      appId: TARGET_APP_ID,
      depth: 200,
      refinement: "Education",
    });
    if ("error" in result) throw new Error("unexpected error");
    expect(result.rankBucket).toBe("100+");
    expect(result.confidence).toBe("low");
    expect(result.searchedDepth).toBe(200);
    expect(callIndex).toBe(2);
  });

  it("emits not_found when refinement also fails to surface the app", async () => {
    server.use(
      http.get("https://itunes.apple.com/search", () =>
        HttpResponse.json(paddedResults(false, 200)),
      ),
    );

    const result = await sampleKeywordRank({
      keyword: "language",
      country: "US",
      appId: TARGET_APP_ID,
      depth: 200,
      refinement: "Education",
    });
    if ("error" in result) throw new Error("unexpected error");
    expect(result.rankBucket).toBe("not_found");
  });

  it("does not run refinement when no refinement is provided", async () => {
    let calls = 0;
    server.use(
      http.get("https://itunes.apple.com/search", () => {
        calls += 1;
        return HttpResponse.json(paddedResults(false, 200));
      }),
    );

    const result = await sampleKeywordRank({
      keyword: "language",
      country: "US",
      appId: TARGET_APP_ID,
      depth: 200,
    });
    if ("error" in result) throw new Error("unexpected error");
    expect(result.rankBucket).toBe("not_found");
    expect(calls).toBe(1);
  });
});

describe("Phase-4 hotfix — report-data wires refinement so /diagnose surfaces 100+ instead of not_found", () => {
  it("real-world scenario: pickleball + Tally Everything Pickleball — primary miss, refined hit → rankBucket 100+", async () => {
    // Simulates the user-reported bug: small app named "Tally Everything
    // Pickleball" (id 6762223327, primaryCategory "Sports") in the US store
    // doesn't appear in the top 200 for "pickleball" but DOES appear when
    // narrowed to "pickleball Sports". Pre-hotfix returned not_found;
    // post-hotfix should return "100+" with confidence:low + searchedDepth:200.
    let searchCallCount = 0;
    server.use(
      http.get("https://itunes.apple.com/lookup", () =>
        HttpResponse.json({
          resultCount: 1,
          results: [
            {
              trackId: Number(TARGET_APP_ID),
              trackName: "Tally Everything Pickleball",
              artistName: "Some Studio",
              primaryGenreName: "Sports",
              description: "Score keeper.",
              screenshotUrls: [],
              averageUserRating: 5.0,
              userRatingCount: 12,
              version: "1.0",
            },
          ],
        }),
      ),
      http.get("https://itunes.apple.com/search", ({ request }) => {
        searchCallCount += 1;
        const url = new URL(request.url);
        const term = url.searchParams.get("term") ?? "";
        // Primary search "pickleball" → target NOT included (rank past 200).
        if (term === "pickleball") {
          return HttpResponse.json(paddedResults(false, 200));
        }
        // Refined search "pickleball Sports" → target IS included.
        return HttpResponse.json(paddedResults(true, 50));
      }),
    );

    const { getFullReportData } = await import(
      "../../../src/data/report-data.js"
    );
    const { resetCacheClientForTests } = await import(
      "../../../src/cache/redis.js"
    );
    resetCacheClientForTests();

    const data = await getFullReportData({
      store: "ios",
      app: TARGET_APP_ID,
      country: "US",
      keywords: ["pickleball"],
    });

    expect(data.keywordRanks).toHaveLength(1);
    const rank = data.keywordRanks[0]!;
    expect(rank.rankBucket).toBe("100+");
    expect(rank.confidence).toBe("low");
    expect(rank.searchedDepth).toBe(200);
    expect(rank.provenance).toBe("live");
    // Two search calls: primary "pickleball" then refined "pickleball Sports".
    // (Competitor-search adds a third — total ≥2 from keyword-rank alone.)
    expect(searchCallCount).toBeGreaterThanOrEqual(2);
  });
});
