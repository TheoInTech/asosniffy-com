import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { sampleKeywordRank } from "../../../src/providers/apple/keyword-rank.js";

const TARGET_APP_ID = "570060128";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeResults(positions: { id: string }[], padTo: number) {
  const padded = [...positions];
  while (padded.length < padTo) {
    padded.push({ id: `filler-${padded.length}` });
  }
  return padded.map((r) => ({
    trackId: Number.isNaN(Number(r.id)) ? Math.random() : Number(r.id),
    trackName: `App ${r.id}`,
    artistName: "Developer",
    primaryGenreName: "Productivity",
    description: "",
    screenshotUrls: [],
    averageUserRating: 4.0,
    userRatingCount: 100,
    version: "1.0",
  }));
}

function stubSearch(rawResults: ReturnType<typeof makeResults>): void {
  server.use(
    http.get("https://itunes.apple.com/search", () =>
      HttpResponse.json({ resultCount: rawResults.length, results: rawResults }),
    ),
  );
}

interface BucketCase {
  position: number; // 1-indexed position to place TARGET_APP_ID
  depth: number;
  expected: string;
  description: string;
}

const bucketCases: BucketCase[] = [
  { position: 1, depth: 50, expected: "1-10", description: "position 1 → 1-10" },
  { position: 10, depth: 50, expected: "1-10", description: "position 10 → 1-10" },
  { position: 11, depth: 50, expected: "11-30", description: "position 11 → 11-30" },
  { position: 30, depth: 50, expected: "11-30", description: "position 30 → 11-30" },
  { position: 31, depth: 50, expected: "31-50", description: "position 31 → 31-50" },
  { position: 50, depth: 50, expected: "31-50", description: "position 50 → 31-50" },
  { position: 51, depth: 100, expected: "51-100", description: "position 51 → 51-100" },
  { position: 100, depth: 100, expected: "51-100", description: "position 100 → 51-100" },
  { position: 101, depth: 200, expected: "100+", description: "position 101 → 100+" },
];

describe("sampleKeywordRank — bucket boundaries", () => {
  for (const c of bucketCases) {
    it(c.description, async () => {
      const filler = Array.from({ length: c.position - 1 }, (_, i) => ({ id: `pre-${i}` }));
      const results = makeResults([...filler, { id: TARGET_APP_ID }], c.depth);
      stubSearch(results);

      const result = await sampleKeywordRank({
        keyword: "habit tracker",
        country: "US",
        appId: TARGET_APP_ID,
        depth: c.depth,
      });
      if ("error" in result) throw new Error(`unexpected error: ${result.error}`);
      expect(result.rankBucket).toBe(c.expected);
      expect(result.provenance).toBe("live");
    });
  }
});

describe("sampleKeywordRank — not_found and confidence", () => {
  it("returns 'not_found' when the target app is absent from the result page", async () => {
    stubSearch(makeResults([{ id: "9999" }], 50));
    const result = await sampleKeywordRank({
      keyword: "habit tracker",
      country: "US",
      appId: TARGET_APP_ID,
      depth: 50,
    });
    if ("error" in result) throw new Error(`unexpected error: ${result.error}`);
    expect(result.rankBucket).toBe("not_found");
  });

  it("'not_found' is a normal return (no thrown error)", async () => {
    stubSearch([]);
    const result = await sampleKeywordRank({
      keyword: "zzz",
      country: "US",
      appId: TARGET_APP_ID,
      depth: 50,
    });
    expect("error" in result).toBe(false);
    if (!("error" in result)) expect(result.rankBucket).toBe("not_found");
  });

  it("confidence is 'medium' when the result page is full", async () => {
    const results = makeResults([{ id: TARGET_APP_ID }], 50);
    stubSearch(results);
    const result = await sampleKeywordRank({
      keyword: "x",
      country: "US",
      appId: TARGET_APP_ID,
      depth: 50,
    });
    if ("error" in result) throw new Error("unexpected error");
    expect(result.confidence).toBe("medium");
  });

  it("confidence is 'low' when the result page is truncated", async () => {
    const results = makeResults([{ id: TARGET_APP_ID }], 5);
    stubSearch(results);
    const result = await sampleKeywordRank({
      keyword: "x",
      country: "US",
      appId: TARGET_APP_ID,
      depth: 50,
    });
    if ("error" in result) throw new Error("unexpected error");
    expect(result.confidence).toBe("low");
  });
});

describe("sampleKeywordRank — rate limiting", () => {
  it("returns { error: 'rate_limited' } when iTunes returns 429", async () => {
    server.use(
      http.get("https://itunes.apple.com/search", () =>
        new HttpResponse(null, { status: 429 }),
      ),
    );
    const result = await sampleKeywordRank({
      keyword: "x",
      country: "US",
      appId: TARGET_APP_ID,
      depth: 50,
    });
    expect(result).toEqual({ error: "rate_limited" });
  });
});
