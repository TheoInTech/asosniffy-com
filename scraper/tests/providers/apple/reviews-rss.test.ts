import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { fetchAppleReviewsRss } from "../../../src/providers/apple/reviews-rss.js";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeFeedPage(count: number, startId = 1) {
  // Apple's RSS feed includes an app-metadata entry first; reviews follow.
  // Reviewers carry `im:rating`; the app entry doesn't — our parser filters
  // entries without a rating, so we don't need to insert one here.
  const entries = Array.from({ length: count }, (_, i) => ({
    id: { label: `${startId + i}` },
    title: { label: `Title ${startId + i}` },
    content: { label: `Body ${startId + i} habit tracker daily routine` },
    "im:rating": { label: String((i % 5) + 1) },
    author: { name: { label: `User ${startId + i}` } },
    updated: { label: "2026-05-01T00:00:00Z" },
  }));
  return { feed: { entry: entries } };
}

describe("fetchAppleReviewsRss", () => {
  it("walks pages until empty and returns coverage: complete", async () => {
    let page = 0;
    server.use(
      http.get(
        "https://itunes.apple.com/:country/rss/customerreviews/page=:page/id=:id/sortby=mostrecent/json",
        () => {
          page += 1;
          if (page === 1) return HttpResponse.json(makeFeedPage(50));
          if (page === 2) return HttpResponse.json(makeFeedPage(20, 51)); // partial → final page
          return HttpResponse.json({ feed: { entry: [] } });
        },
      ),
    );
    const result = await fetchAppleReviewsRss({
      appId: "570060128",
      country: "US",
      maxPages: 5,
    });
    if ("error" in result) throw new Error("unexpected error");
    expect(result.coverage).toBe("complete");
    expect(result.sampleSize).toBe(70);
    expect(result.pagesFetched).toBe(2);
  });

  it("returns coverage: unavailable when feed is empty for the first page", async () => {
    server.use(
      http.get(
        "https://itunes.apple.com/:country/rss/customerreviews/page=:page/id=:id/sortby=mostrecent/json",
        () => HttpResponse.json({ feed: { entry: [] } }),
      ),
    );
    const result = await fetchAppleReviewsRss({
      appId: "570060128",
      country: "US",
    });
    if ("error" in result) throw new Error("unexpected error");
    expect(result.coverage).toBe("unavailable");
    expect(result.sampleSize).toBe(0);
  });

  it("returns error when first-page fetch is rate-limited", async () => {
    server.use(
      http.get(
        "https://itunes.apple.com/:country/rss/customerreviews/page=:page/id=:id/sortby=mostrecent/json",
        () => new HttpResponse(null, { status: 429 }),
      ),
    );
    const result = await fetchAppleReviewsRss({
      appId: "570060128",
      country: "US",
    });
    expect(result).toEqual({ error: "rate_limited" });
  });

  it("returns coverage: partial when later page rate-limits after a successful first page", async () => {
    let page = 0;
    server.use(
      http.get(
        "https://itunes.apple.com/:country/rss/customerreviews/page=:page/id=:id/sortby=mostrecent/json",
        () => {
          page += 1;
          if (page === 1) return HttpResponse.json(makeFeedPage(50));
          return new HttpResponse(null, { status: 429 });
        },
      ),
    );
    const result = await fetchAppleReviewsRss({
      appId: "570060128",
      country: "US",
      maxPages: 5,
    });
    if ("error" in result) throw new Error("unexpected error");
    expect(result.coverage).toBe("partial");
    expect(result.sampleSize).toBe(50);
  });
});
