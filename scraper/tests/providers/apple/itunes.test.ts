import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { lookupApp, searchApps } from "../../../src/providers/apple/itunes.js";

const sampleResult = {
  trackId: 570060128,
  trackName: "Duolingo",
  artistName: "Duolingo, Inc.",
  primaryGenreName: "Education",
  description: "Learn a language for free.",
  screenshotUrls: ["https://example.com/screenshot1.png"],
  averageUserRating: 4.7,
  userRatingCount: 1500000,
  version: "7.1.2",
};

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("lookupApp", () => {
  it("returns a normalized AppRecord on success", async () => {
    server.use(
      http.get("https://itunes.apple.com/lookup", () =>
        HttpResponse.json({ resultCount: 1, results: [sampleResult] }),
      ),
    );

    const result = await lookupApp({ id: "570060128", country: "US" });
    if ("error" in result) throw new Error(`Unexpected error: ${result.error}`);

    expect(result.id).toBe("570060128");
    expect(result.name).toBe("Duolingo");
    expect(result.developer).toBe("Duolingo, Inc.");
    expect(result.primaryCategory).toBe("Education");
    expect(result.ratingsSummary).toEqual({ average: 4.7, count: 1500000 });
    expect(result.provenance).toBe("live");
  });

  it("returns { error: 'not_found' } when the API returns no results", async () => {
    server.use(
      http.get("https://itunes.apple.com/lookup", () =>
        HttpResponse.json({ resultCount: 0, results: [] }),
      ),
    );

    const result = await lookupApp({ id: "0", country: "US" });
    expect(result).toEqual({ error: "not_found" });
  });

  it("returns { error: 'rate_limited' } on HTTP 429", async () => {
    server.use(
      http.get("https://itunes.apple.com/lookup", () =>
        new HttpResponse(null, { status: 429 }),
      ),
    );

    const result = await lookupApp({ id: "1", country: "US" });
    expect(result).toEqual({ error: "rate_limited" });
  });

  it("returns { error: 'rate_limited' } on HTTP 403", async () => {
    server.use(
      http.get("https://itunes.apple.com/lookup", () =>
        new HttpResponse(null, { status: 403 }),
      ),
    );

    const result = await lookupApp({ id: "1", country: "US" });
    expect(result).toEqual({ error: "rate_limited" });
  });

  it("returns { error: 'network_error' } when fetch throws", async () => {
    server.use(
      http.get("https://itunes.apple.com/lookup", () => HttpResponse.error()),
    );

    const result = await lookupApp({ id: "1", country: "US" });
    expect(result).toEqual({ error: "network_error" });
  });

  it("URL-encodes the id and country query params", async () => {
    let observedUrl = "";
    server.use(
      http.get("https://itunes.apple.com/lookup", ({ request }) => {
        observedUrl = request.url;
        return HttpResponse.json({ resultCount: 1, results: [sampleResult] });
      }),
    );

    await lookupApp({ id: "570060128", country: "US" });
    expect(observedUrl).toContain("id=570060128");
    expect(observedUrl).toContain("country=US");
  });
});

describe("searchApps", () => {
  it("returns an array of AppRecords on success", async () => {
    server.use(
      http.get("https://itunes.apple.com/search", () =>
        HttpResponse.json({
          resultCount: 2,
          results: [sampleResult, { ...sampleResult, trackId: 999, trackName: "Other" }],
        }),
      ),
    );

    const result = await searchApps({ term: "language", country: "US", limit: 50 });
    if ("error" in result) throw new Error(`Unexpected error: ${result.error}`);

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe("570060128");
    expect(result[1]!.id).toBe("999");
    expect(result[1]!.name).toBe("Other");
    expect(result.every((r) => r.provenance === "live")).toBe(true);
  });

  it("clamps limit to [1, 200] and uses default 50 when omitted", async () => {
    let observed: URL | null = null;
    server.use(
      http.get("https://itunes.apple.com/search", ({ request }) => {
        observed = new URL(request.url);
        return HttpResponse.json({ resultCount: 0, results: [] });
      }),
    );

    await searchApps({ term: "x", country: "US" });
    expect(observed!.searchParams.get("limit")).toBe("50");
    expect(observed!.searchParams.get("entity")).toBe("software");

    observed = null;
    await searchApps({ term: "x", country: "US", limit: 500 });
    expect(observed!.searchParams.get("limit")).toBe("200");

    observed = null;
    await searchApps({ term: "x", country: "US", limit: 0 });
    expect(observed!.searchParams.get("limit")).toBe("1");
  });

  it("returns { error: 'rate_limited' } on HTTP 403", async () => {
    server.use(
      http.get("https://itunes.apple.com/search", () =>
        new HttpResponse(null, { status: 403 }),
      ),
    );

    const result = await searchApps({ term: "habit", country: "US", limit: 10 });
    expect(result).toEqual({ error: "rate_limited" });
  });

  it("returns an empty array (not an error) when the API has zero matches", async () => {
    server.use(
      http.get("https://itunes.apple.com/search", () =>
        HttpResponse.json({ resultCount: 0, results: [] }),
      ),
    );

    const result = await searchApps({ term: "zzz", country: "US", limit: 50 });
    expect(result).toEqual([]);
  });
});
