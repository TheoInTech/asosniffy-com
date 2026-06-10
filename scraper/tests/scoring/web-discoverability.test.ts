import { describe, expect, it } from "vitest";
import {
  assembleWebDiscoverability,
  parseAasa,
  parseAppSchema,
  parseAssetlinks,
  parseOg,
  parseRobotsForAiCrawlers,
  parseSmartAppBanner,
  type AasaFinding,
  type AssetlinksFinding,
} from "../../src/scoring/web-discoverability.js";

// Wave 2.2 — web discoverability audit, pure parser layer.
//
// Every parser is exercised against inline HTML/JSON fixtures: present,
// absent, and malformed for each surface. No network, no cheerio-vs-regex
// assumptions leak into the assertions — only the documented finding shapes.

// --- parseSmartAppBanner ---------------------------------------------------

describe("parseSmartAppBanner", () => {
  it("detects a full banner with app-id and app-argument", () => {
    const html = `<html><head>
      <meta name="apple-itunes-app" content="app-id=963034692, app-argument=https://app.example/match/42">
    </head><body></body></html>`;
    expect(parseSmartAppBanner(html)).toEqual({
      present: true,
      appId: "963034692",
      hasAppArgument: true,
    });
  });

  it("detects a banner with app-id only (no app-argument)", () => {
    const html = `<head><meta name="apple-itunes-app" content="app-id=963034692"></head>`;
    expect(parseSmartAppBanner(html)).toEqual({
      present: true,
      appId: "963034692",
      hasAppArgument: false,
    });
  });

  it("returns absent when the meta tag is missing", () => {
    const html = `<head><meta name="viewport" content="width=device-width"></head>`;
    expect(parseSmartAppBanner(html)).toEqual({
      present: false,
      appId: null,
      hasAppArgument: false,
    });
  });

  it("reports present but appId null on malformed content", () => {
    const html = `<head><meta name="apple-itunes-app" content="affiliate-data=foo"></head>`;
    const result = parseSmartAppBanner(html);
    expect(result.present).toBe(true);
    expect(result.appId).toBeNull();
    expect(result.hasAppArgument).toBe(false);
  });

  it("matches the meta name case-insensitively", () => {
    const html = `<head><meta name="Apple-iTunes-App" content="app-id=123"></head>`;
    expect(parseSmartAppBanner(html).present).toBe(true);
    expect(parseSmartAppBanner(html).appId).toBe("123");
  });
});

// --- parseAppSchema --------------------------------------------------------

function ldJson(obj: unknown): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify(obj)}</script></head><body></body></html>`;
}

describe("parseAppSchema", () => {
  it("parses a complete SoftwareApplication with no missing required fields", () => {
    const html = ldJson({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Streaks",
      offers: { "@type": "Offer", price: "4.99", priceCurrency: "USD" },
      aggregateRating: { "@type": "AggregateRating", ratingValue: 4.6, ratingCount: 1200 },
    });
    const result = parseAppSchema(html);
    expect(result.present).toBe(true);
    expect(result.type).toBe("SoftwareApplication");
    expect(result.missingRequiredFields).toEqual([]);
    expect(result.aggregateRatingValue).toBe(4.6);
  });

  it("flags missing offers.price (Google required field)", () => {
    const html = ldJson({
      "@type": "MobileApplication",
      name: "Streaks",
      aggregateRating: { ratingValue: "4.6", ratingCount: 10 },
    });
    const result = parseAppSchema(html);
    expect(result.present).toBe(true);
    expect(result.type).toBe("MobileApplication");
    expect(result.missingRequiredFields).toEqual(["offers.price"]);
    // string ratingValue is coerced to a number
    expect(result.aggregateRatingValue).toBe(4.6);
  });

  it("flags the aggregateRating-or-review requirement when both are absent", () => {
    const html = ldJson({
      "@type": "SoftwareApplication",
      name: "Streaks",
      offers: { price: 0 },
    });
    const result = parseAppSchema(html);
    expect(result.missingRequiredFields).toEqual(["aggregateRating or review"]);
    expect(result.aggregateRatingValue).toBeNull();
  });

  it("accepts price 0 (free app) as a present offers.price", () => {
    const html = ldJson({
      "@type": "SoftwareApplication",
      name: "Streaks",
      offers: { price: 0 },
      review: { "@type": "Review", reviewRating: { ratingValue: 5 } },
    });
    const result = parseAppSchema(html);
    expect(result.missingRequiredFields).toEqual([]);
    // review satisfies the requirement, but there is still no aggregate value
    expect(result.aggregateRatingValue).toBeNull();
  });

  it("flags missing name", () => {
    const html = ldJson({
      "@type": "SoftwareApplication",
      offers: { price: "1.99" },
      aggregateRating: { ratingValue: 4 },
    });
    expect(parseAppSchema(html).missingRequiredFields).toEqual(["name"]);
  });

  it("returns absent when there is no JSON-LD at all", () => {
    const result = parseAppSchema("<html><body><h1>Hi</h1></body></html>");
    expect(result).toEqual({
      present: false,
      type: null,
      missingRequiredFields: [],
      aggregateRatingValue: null,
    });
  });

  it("treats malformed JSON-LD as absent, not a crash", () => {
    const html = `<script type="application/ld+json">{not json]</script>`;
    expect(parseAppSchema(html).present).toBe(false);
  });

  it("finds an app node inside @graph and array @type (VideoGame co-typing)", () => {
    const html = ldJson({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", name: "Example Corp" },
        {
          "@type": ["VideoGame", "MobileApplication"],
          name: "Pickle Smash",
          offers: { price: "0" },
          aggregateRating: { ratingValue: "4.2" },
        },
      ],
    });
    const result = parseAppSchema(html);
    expect(result.present).toBe(true);
    expect(result.type).toBe("MobileApplication");
    expect(result.aggregateRatingValue).toBe(4.2);
  });

  it("does NOT count a VideoGame-only node (no rich result per Google docs)", () => {
    const html = ldJson({
      "@type": "VideoGame",
      name: "Pickle Smash",
      offers: { price: "0" },
      aggregateRating: { ratingValue: 4.2 },
    });
    expect(parseAppSchema(html).present).toBe(false);
  });

  it("ignores non-app JSON-LD (e.g. Organization only)", () => {
    const html = ldJson({ "@type": "Organization", name: "Example Corp" });
    expect(parseAppSchema(html).present).toBe(false);
  });
});

// --- parseAasa -------------------------------------------------------------

describe("parseAasa", () => {
  const aasa = JSON.stringify({
    applinks: {
      apps: [],
      details: [{ appID: "ABCDE12345.com.example.app", paths: ["/match/*"] }],
    },
  });

  it("validates and matches TEAMID.bundleId by suffix", () => {
    expect(parseAasa(aasa, "com.example.app")).toEqual({
      present: true,
      valid: true,
      bundleIdListed: true,
    });
  });

  it("supports the newer appIDs array format", () => {
    const json = JSON.stringify({
      applinks: {
        details: [
          { appIDs: ["ABCDE12345.com.example.app", "ABCDE12345.com.example.clip"], components: [] },
        ],
      },
    });
    expect(parseAasa(json, "com.example.clip")).toEqual({
      present: true,
      valid: true,
      bundleIdListed: true,
    });
  });

  it("does NOT suffix-match when the prefix is not a bare team ID", () => {
    // "ABCDE12345.foo.com.example.app" is a DIFFERENT bundle id that merely
    // ends with the target — the segment before the suffix must be the
    // dot-free team ID.
    const json = JSON.stringify({
      applinks: { details: [{ appID: "ABCDE12345.foo.com.example.app", paths: ["*"] }] },
    });
    expect(parseAasa(json, "com.example.app").bundleIdListed).toBe(false);
  });

  it("returns bundleIdListed null when the bundleId is unknown", () => {
    expect(parseAasa(aasa, null)).toEqual({
      present: true,
      valid: true,
      bundleIdListed: null,
    });
  });

  it("reports invalid on malformed JSON without claiming a bundle match", () => {
    expect(parseAasa("{nope", "com.example.app")).toEqual({
      present: true,
      valid: false,
      bundleIdListed: null,
    });
  });

  it("reports invalid when applinks.details is missing", () => {
    const json = JSON.stringify({ webcredentials: { apps: ["ABCDE12345.com.example.app"] } });
    const result = parseAasa(json, "com.example.app");
    expect(result.valid).toBe(false);
    expect(result.bundleIdListed).toBeNull();
  });
});

// --- parseAssetlinks --------------------------------------------------------

describe("parseAssetlinks", () => {
  const assetlinks = JSON.stringify([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.example.app",
        sha256_cert_fingerprints: ["AA:BB"],
      },
    },
  ]);

  it("validates and matches the package name", () => {
    expect(parseAssetlinks(assetlinks, "com.example.app")).toEqual({
      present: true,
      valid: true,
      packageListed: true,
    });
  });

  it("reports packageListed false for a different package", () => {
    expect(parseAssetlinks(assetlinks, "com.other.app")).toEqual({
      present: true,
      valid: true,
      packageListed: false,
    });
  });

  it("returns packageListed null when the package is unknown", () => {
    expect(parseAssetlinks(assetlinks, null).packageListed).toBeNull();
  });

  it("reports invalid on malformed JSON", () => {
    expect(parseAssetlinks("not json", "com.example.app")).toEqual({
      present: true,
      valid: false,
      packageListed: null,
    });
  });

  it("reports invalid when the document is not a statement array", () => {
    const result = parseAssetlinks(JSON.stringify({ foo: "bar" }), "com.example.app");
    expect(result.valid).toBe(false);
    expect(result.packageListed).toBeNull();
  });
});

// --- parseRobotsForAiCrawlers ----------------------------------------------

describe("parseRobotsForAiCrawlers", () => {
  it("defaults to allowed on an empty robots.txt", () => {
    expect(parseRobotsForAiCrawlers("")).toEqual({
      gptBot: "allowed",
      perplexityBot: "allowed",
      googleExtended: "allowed",
    });
  });

  it("blocks a specific bot with Disallow: /", () => {
    const robots = "User-agent: GPTBot\nDisallow: /\n";
    expect(parseRobotsForAiCrawlers(robots)).toEqual({
      gptBot: "blocked",
      perplexityBot: "allowed",
      googleExtended: "allowed",
    });
  });

  it("blocks all three via the wildcard group", () => {
    const robots = "User-agent: *\nDisallow: /\n";
    expect(parseRobotsForAiCrawlers(robots)).toEqual({
      gptBot: "blocked",
      perplexityBot: "blocked",
      googleExtended: "blocked",
    });
  });

  it("lets a specific allow group override a blocking wildcard", () => {
    const robots = [
      "User-agent: *",
      "Disallow: /",
      "",
      "User-agent: GPTBot",
      "Disallow:",
    ].join("\n");
    expect(parseRobotsForAiCrawlers(robots)).toEqual({
      gptBot: "allowed",
      perplexityBot: "blocked",
      googleExtended: "blocked",
    });
  });

  it("applies a multi-agent group to every listed agent", () => {
    const robots = [
      "User-agent: GPTBot",
      "User-agent: Google-Extended",
      "Disallow: /",
    ].join("\n");
    expect(parseRobotsForAiCrawlers(robots)).toEqual({
      gptBot: "blocked",
      perplexityBot: "allowed",
      googleExtended: "blocked",
    });
  });

  it("does not treat a sub-path Disallow as a full block", () => {
    const robots = "User-agent: PerplexityBot\nDisallow: /private\n";
    expect(parseRobotsForAiCrawlers(robots).perplexityBot).toBe("allowed");
  });

  it("matches agent names case-insensitively and ignores comments", () => {
    const robots = [
      "# block AI training",
      "user-agent: gptbot # inline comment",
      "disallow: /",
    ].join("\n");
    expect(parseRobotsForAiCrawlers(robots).gptBot).toBe("blocked");
  });
});

// --- parseOg -----------------------------------------------------------------

describe("parseOg", () => {
  it("detects all three OG tags", () => {
    const html = `<head>
      <meta property="og:title" content="Streaks">
      <meta property="og:description" content="Habit tracking">
      <meta property="og:image" content="https://app.example/og.png">
    </head>`;
    expect(parseOg(html)).toEqual({ title: true, description: true, image: true });
  });

  it("reports partial coverage", () => {
    const html = `<head><meta property="og:title" content="Streaks"></head>`;
    expect(parseOg(html)).toEqual({ title: true, description: false, image: false });
  });

  it("accepts the name= attribute variant and rejects empty content", () => {
    const html = `<head>
      <meta name="og:title" content="Streaks">
      <meta property="og:image" content="">
    </head>`;
    expect(parseOg(html)).toEqual({ title: true, description: false, image: false });
  });

  it("returns all false on a page without OG tags", () => {
    expect(parseOg("<html><body></body></html>")).toEqual({
      title: false,
      description: false,
      image: false,
    });
  });
});

// --- assembleWebDiscoverability ----------------------------------------------

describe("assembleWebDiscoverability", () => {
  const baseParts = {
    url: "https://app.example/",
    smartAppBanner: { present: true, appId: "963034692", hasAppArgument: false },
    appSchema: {
      present: true,
      type: "SoftwareApplication",
      missingRequiredFields: [],
      aggregateRatingValue: 4.2,
    },
    universalLinks: { present: false } as AasaFinding,
    androidAppLinks: { present: false } as AssetlinksFinding,
    robotsTxtPresent: true,
    aiCrawlers: {
      gptBot: "allowed" as const,
      perplexityBot: "allowed" as const,
      googleExtended: "blocked" as const,
    },
    openGraph: { title: true, description: true, image: false },
    storeRating: 4.7,
    checkedAt: "2026-06-11T00:00:00.000Z",
    provenance: "live" as const,
  };

  it("computes ratingDrift as schema minus store value", () => {
    const result = assembleWebDiscoverability(baseParts);
    expect(result.ratingDrift).toEqual({
      schemaValue: 4.2,
      storeValue: 4.7,
      drift: -0.5,
    });
    expect(result.url).toBe("https://app.example/");
    expect(result.provenance).toBe("live");
    expect(result.checkedAt).toBe("2026-06-11T00:00:00.000Z");
    expect(result.aiCrawlerAccess).toEqual({
      robotsTxtPresent: true,
      gptBot: "allowed",
      perplexityBot: "allowed",
      googleExtended: "blocked",
    });
  });

  it("returns ratingDrift null when the schema has no aggregateRating", () => {
    const result = assembleWebDiscoverability({
      ...baseParts,
      appSchema: { ...baseParts.appSchema, aggregateRatingValue: null },
    });
    expect(result.ratingDrift).toBeNull();
  });

  it("returns ratingDrift null when the store rating is unknown", () => {
    expect(
      assembleWebDiscoverability({ ...baseParts, storeRating: null }).ratingDrift,
    ).toBeNull();
  });

  it("passes the per-surface findings through untouched", () => {
    const result = assembleWebDiscoverability(baseParts);
    expect(result.smartAppBanner).toEqual(baseParts.smartAppBanner);
    expect(result.appSchema).toEqual(baseParts.appSchema);
    expect(result.universalLinks).toEqual({ present: false });
    expect(result.androidAppLinks).toEqual({ present: false });
    expect(result.openGraph).toEqual(baseParts.openGraph);
  });
});
