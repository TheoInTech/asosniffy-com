import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWebDiscoverability } from "../../src/providers/web-audit.js";
import { resetCacheClientForTests } from "../../src/cache/redis.js";

// Wave 2.2 — web-audit provider. All network access goes through the
// injected fetchImpl seam (same DI convention as llm-mention's client
// injection and product-context's scrape seam), so CI never touches the
// network. Responses are constructed fresh per call because Response
// bodies are single-use.

type RouteTable = Record<string, () => Response>;

function makeFetch(routes: RouteTable): typeof fetch & { calls: string[] } {
  const calls: string[] = [];
  const impl = async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    const route = routes[url];
    if (!route) return new Response("not found", { status: 404 });
    return route();
  };
  const fn = impl as unknown as typeof fetch & { calls: string[] };
  fn.calls = calls;
  return fn;
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const PAGE_HTML = `<html><head>
  <meta name="apple-itunes-app" content="app-id=963034692, app-argument=https://app.example/today">
  <meta property="og:title" content="Streaks">
  <meta property="og:description" content="The habit tracker">
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Streaks",
    offers: { price: "4.99", priceCurrency: "USD" },
    aggregateRating: { ratingValue: 4.2, ratingCount: 900 },
  })}</script>
</head><body><h1>Streaks</h1></body></html>`;

const AASA = {
  applinks: { details: [{ appID: "ABCDE12345.com.example.app", paths: ["*"] }] },
};

const ASSETLINKS = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: "com.example.android", sha256_cert_fingerprints: [] },
  },
];

function happyRoutes(): RouteTable {
  return {
    "https://app.example/": () => htmlResponse(PAGE_HTML),
    "https://app.example/.well-known/apple-app-site-association": () => jsonResponse(AASA),
    "https://app.example/.well-known/assetlinks.json": () => jsonResponse(ASSETLINKS),
    "https://app.example/robots.txt": () =>
      new Response("User-agent: GPTBot\nDisallow: /\n", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
  };
}

const input = {
  url: "https://app.example/",
  bundleId: "com.example.app",
  packageName: "com.example.android",
  storeRating: 4.7,
};

const on = { enabled: true };

describe("fetchWebDiscoverability", () => {
  beforeEach(() => {
    resetCacheClientForTests();
    vi.restoreAllMocks();
  });

  it("returns null when the flag is off and never fetches", async () => {
    const fetchImpl = makeFetch(happyRoutes());
    expect(
      await fetchWebDiscoverability(input, { enabled: false, fetchImpl }),
    ).toBeNull();
    // Default (no opts.enabled) follows env.WEB_AUDIT_ENABLED, false in tests.
    expect(await fetchWebDiscoverability(input, { fetchImpl })).toBeNull();
    expect(fetchImpl.calls).toEqual([]);
  });

  it("assembles a full audit on the happy path with provenance live", async () => {
    const fetchImpl = makeFetch(happyRoutes());
    const result = await fetchWebDiscoverability(input, { ...on, fetchImpl });
    expect(result).not.toBeNull();
    expect(result!.provenance).toBe("live");
    expect(result!.smartAppBanner).toEqual({
      present: true,
      appId: "963034692",
      hasAppArgument: true,
    });
    expect(result!.appSchema.present).toBe(true);
    expect(result!.appSchema.missingRequiredFields).toEqual([]);
    expect(result!.universalLinks).toEqual({
      present: true,
      valid: true,
      bundleIdListed: true,
    });
    expect(result!.androidAppLinks).toEqual({
      present: true,
      valid: true,
      packageListed: true,
    });
    expect(result!.aiCrawlerAccess).toEqual({
      robotsTxtPresent: true,
      gptBot: "blocked",
      perplexityBot: "allowed",
      googleExtended: "allowed",
    });
    expect(result!.openGraph).toEqual({ title: true, description: true, image: false });
    expect(result!.ratingDrift).toEqual({ schemaValue: 4.2, storeValue: 4.7, drift: -0.5 });
  });

  it("treats missing well-known files as absent findings, not an error", async () => {
    const fetchImpl = makeFetch({
      "https://app.example/": () => htmlResponse("<html><head></head><body></body></html>"),
      // AASA (.well-known AND root fallback), assetlinks, robots all 404.
    });
    const result = await fetchWebDiscoverability(input, { ...on, fetchImpl });
    expect(result).not.toBeNull();
    expect(result!.universalLinks).toEqual({ present: false });
    expect(result!.androidAppLinks).toEqual({ present: false });
    expect(result!.aiCrawlerAccess).toEqual({
      robotsTxtPresent: false,
      gptBot: "allowed",
      perplexityBot: "allowed",
      googleExtended: "allowed",
    });
    expect(result!.smartAppBanner.present).toBe(false);
    // The .well-known path AND the root fallback were both attempted.
    expect(fetchImpl.calls).toContain(
      "https://app.example/.well-known/apple-app-site-association",
    );
    expect(fetchImpl.calls).toContain("https://app.example/apple-app-site-association");
  });

  it("falls back to the root AASA location per the associated-domains spec", async () => {
    const routes = happyRoutes();
    delete (routes as Record<string, unknown>)[
      "https://app.example/.well-known/apple-app-site-association"
    ];
    routes["https://app.example/apple-app-site-association"] = () => jsonResponse(AASA);
    const fetchImpl = makeFetch(routes);
    const result = await fetchWebDiscoverability(input, { ...on, fetchImpl });
    expect(result!.universalLinks).toEqual({
      present: true,
      valid: true,
      bundleIdListed: true,
    });
  });

  it("nulls the whole audit when the page fetch fails", async () => {
    const routes = happyRoutes();
    routes["https://app.example/"] = () => new Response("oops", { status: 500 });
    expect(
      await fetchWebDiscoverability(input, { ...on, fetchImpl: makeFetch(routes) }),
    ).toBeNull();
  });

  it("nulls the whole audit when the page fetch throws", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    expect(await fetchWebDiscoverability(input, { ...on, fetchImpl })).toBeNull();
  });

  it("rejects non-http(s) and private/loopback/link-local URLs (SSRF guard)", async () => {
    const fetchImpl = makeFetch(happyRoutes());
    const bad = [
      "ftp://app.example/",
      "http://localhost/",
      "http://127.0.0.1/admin",
      "http://10.0.0.5/",
      "http://192.168.1.1/",
      "http://169.254.169.254/latest/meta-data",
      "http://172.16.0.1/",
      "not a url",
    ];
    for (const url of bad) {
      expect(
        await fetchWebDiscoverability({ ...input, url }, { ...on, fetchImpl }),
      ).toBeNull();
    }
    expect(fetchImpl.calls).toEqual([]);
  });

  it("follows redirects (capped) and audits the final origin", async () => {
    const routes: RouteTable = {
      "https://app.example/": () =>
        new Response(null, {
          status: 301,
          headers: { location: "https://www.app.example/" },
        }),
      "https://www.app.example/": () => htmlResponse(PAGE_HTML),
      "https://www.app.example/.well-known/apple-app-site-association": () =>
        jsonResponse(AASA),
      "https://www.app.example/.well-known/assetlinks.json": () => jsonResponse(ASSETLINKS),
      "https://www.app.example/robots.txt": () => new Response("", { status: 200 }),
    };
    const fetchImpl = makeFetch(routes);
    const result = await fetchWebDiscoverability(input, { ...on, fetchImpl });
    expect(result).not.toBeNull();
    expect(result!.url).toBe("https://www.app.example/");
    expect(result!.universalLinks).toEqual({
      present: true,
      valid: true,
      bundleIdListed: true,
    });
  });

  it("rejects a redirect into a private address (SSRF on the hop)", async () => {
    const fetchImpl = makeFetch({
      "https://app.example/": () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest" },
        }),
    });
    expect(await fetchWebDiscoverability(input, { ...on, fetchImpl })).toBeNull();
    expect(fetchImpl.calls).toEqual(["https://app.example/"]);
  });

  it("gives up after the redirect cap instead of looping", async () => {
    const fetchImpl = makeFetch({
      "https://app.example/": () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://app.example/" },
        }),
    });
    expect(await fetchWebDiscoverability(input, { ...on, fetchImpl })).toBeNull();
    expect(fetchImpl.calls.length).toBeLessThanOrEqual(5);
  });

  it("serves the second call from cache with provenance cached", async () => {
    const fetchImpl = makeFetch(happyRoutes());
    const first = await fetchWebDiscoverability(input, { ...on, fetchImpl });
    const callsAfterFirst = fetchImpl.calls.length;
    const second = await fetchWebDiscoverability(input, { ...on, fetchImpl });
    expect(first!.provenance).toBe("live");
    expect(second!.provenance).toBe("cached");
    expect(fetchImpl.calls.length).toBe(callsAfterFirst);
  });

  it("re-matches identity against cached artifacts (same origin, different app)", async () => {
    const fetchImpl = makeFetch(happyRoutes());
    const first = await fetchWebDiscoverability(input, { ...on, fetchImpl });
    expect(first!.universalLinks).toEqual({
      present: true,
      valid: true,
      bundleIdListed: true,
    });
    const callsAfterFirst = fetchImpl.calls.length;
    // A sibling app on the same marketing domain must not inherit the
    // first app's bundle match from the cache.
    const second = await fetchWebDiscoverability(
      { ...input, bundleId: "com.other.app", storeRating: 3.1 },
      { ...on, fetchImpl },
    );
    expect(second!.universalLinks).toEqual({
      present: true,
      valid: true,
      bundleIdListed: false,
    });
    expect(second!.ratingDrift).toEqual({ schemaValue: 4.2, storeValue: 3.1, drift: 1.1 });
    expect(fetchImpl.calls.length).toBe(callsAfterFirst);
  });

  it("does not cache a failed audit — a later call retries live", async () => {
    const routes = happyRoutes();
    let fail = true;
    routes["https://app.example/"] = () =>
      fail ? new Response("oops", { status: 500 }) : htmlResponse(PAGE_HTML);
    const fetchImpl = makeFetch(routes);
    expect(await fetchWebDiscoverability(input, { ...on, fetchImpl })).toBeNull();
    fail = false;
    const retry = await fetchWebDiscoverability(input, { ...on, fetchImpl });
    expect(retry).not.toBeNull();
    expect(retry!.provenance).toBe("live");
  });

  it("survives an oversized page body via the size cap", async () => {
    const routes = happyRoutes();
    // Meta tags in the first kilobyte, then ~600 KB of filler past the cap.
    const big = PAGE_HTML.replace("</body>", `${"x".repeat(600 * 1024)}</body>`);
    routes["https://app.example/"] = () => htmlResponse(big);
    const result = await fetchWebDiscoverability(input, {
      ...on,
      fetchImpl: makeFetch(routes),
    });
    expect(result).not.toBeNull();
    expect(result!.smartAppBanner.present).toBe(true);
    expect(result!.openGraph.title).toBe(true);
  });

  it("nulls the audit when the page is not HTML", async () => {
    const routes = happyRoutes();
    routes["https://app.example/"] = () => jsonResponse({ hello: "world" });
    expect(
      await fetchWebDiscoverability(input, { ...on, fetchImpl: makeFetch(routes) }),
    ).toBeNull();
  });
});
