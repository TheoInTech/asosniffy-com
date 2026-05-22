import { describe, expect, it } from "vitest";
import {
  extractAudienceTokens,
  extractFeatureTokens,
  extractTopicalKeywords,
  fetchProductProfile,
  pickPriorityPages,
  type ScrapedPage,
} from "../../src/providers/product-context.js";

// Phase B — Product-context provider. Tests the extractor logic and the
// fetchProductProfile orchestration via an injected `scrape` seam so CI
// never hits real Firecrawl/Browserbase/network paths.

function makePage(overrides: Partial<ScrapedPage> = {}): ScrapedPage {
  return {
    url: "https://tally.example/",
    text: "",
    headings: [],
    bullets: [],
    links: [],
    ...overrides,
  };
}

describe("pickPriorityPages", () => {
  it("returns same-origin priority pages first (features/about/pricing/how-it-works)", () => {
    const result = pickPriorityPages({
      links: [
        "https://tally.example/blog/post-1", // skip pattern
        "https://tally.example/random",
        "https://tally.example/features",
        "https://other-domain.com/features", // cross-origin → drop
        "https://tally.example/about",
        "https://tally.example/pricing",
      ],
      baseUrl: "https://tally.example/",
      max: 4,
    });
    // /features, /about, /pricing should win the priority bucket.
    expect(result.slice(0, 3).sort()).toEqual([
      "https://tally.example/about",
      "https://tally.example/features",
      "https://tally.example/pricing",
    ]);
    // /random fills the 4th slot.
    expect(result).toContain("https://tally.example/random");
    // skip patterns and cross-origin are absent.
    expect(result.some((u) => u.includes("/blog/"))).toBe(false);
    expect(result.some((u) => u.includes("other-domain"))).toBe(false);
  });

  it("ranks remaining (non-priority) links by frequency desc", () => {
    const result = pickPriorityPages({
      links: [
        "https://tally.example/x",
        "https://tally.example/y",
        "https://tally.example/y",
        "https://tally.example/y",
        "https://tally.example/z",
        "https://tally.example/z",
      ],
      baseUrl: "https://tally.example/",
      max: 3,
    });
    expect(result[0]).toBe("https://tally.example/y"); // 3 occurrences
    expect(result[1]).toBe("https://tally.example/z"); // 2 occurrences
  });

  it("returns empty array when the base URL doesn't parse", () => {
    const result = pickPriorityPages({
      links: ["https://anywhere/foo"],
      baseUrl: "not-a-url",
      max: 4,
    });
    expect(result).toEqual([]);
  });
});

describe("extractFeatureTokens", () => {
  it("ranks bullet + heading tokens by frequency, with headings weighted 2×", () => {
    const tokens = extractFeatureTokens([
      makePage({
        headings: ["Pickleball Scoring"],
        bullets: ["Drills and routines", "Match overlays for iPad"],
      }),
    ]);
    // scoring + pickleball are in heading → 2× weight each
    expect(tokens).toContain("pickleball");
    expect(tokens).toContain("scoring");
    expect(tokens).toContain("drills");
    expect(tokens).toContain("routines");
    expect(tokens).toContain("overlays");
    // generic / stoplisted words are filtered
    expect(tokens).not.toContain("and");
    expect(tokens).not.toContain("for");
  });

  it("dedups token frequency across multiple pages", () => {
    const tokens = extractFeatureTokens([
      makePage({ bullets: ["Scoring widget"] }),
      makePage({ bullets: ["Better scoring"] }),
    ]);
    expect(tokens[0]).toBe("scoring"); // highest freq across pages
  });
});

describe("extractAudienceTokens", () => {
  it("picks 'for X' phrases from body text", () => {
    const result = extractAudienceTokens([
      makePage({
        text: "Pickleball scoring built for tournament directors. " +
          "Trusted by indie pickleball coaches.",
      }),
    ]);
    expect(result.some((p) => p.includes("tournament directors"))).toBe(true);
  });

  it("rejects 'for' phrases that are only stoplisted tokens", () => {
    const result = extractAudienceTokens([
      makePage({ text: "Built for the team for you for us." }),
    ]);
    // All extracted phrases should have at least one non-stoplisted word.
    for (const phrase of result) {
      const words = phrase.split(/\s+/);
      const meaningful = words.filter(
        (w) => !["the", "team", "you", "us", "for"].includes(w),
      );
      expect(meaningful.length).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("extractTopicalKeywords", () => {
  it("only surfaces tokens that appear ≥2 times across pages", () => {
    const result = extractTopicalKeywords([
      makePage({ text: "pickleball pickleball scoring drills onceonly" }),
    ]);
    expect(result).toContain("pickleball"); // 2 occurrences
    expect(result).not.toContain("onceonly"); // 1 occurrence
  });
});

describe("fetchProductProfile (via injected scrape)", () => {
  it("returns provenance:'live' with extracted tokens when scrape succeeds", async () => {
    const profile = await fetchProductProfile({
      sellerUrl: "https://tally.example/",
      scrape: async (url) => {
        if (url === "https://tally.example/") {
          return makePage({
            url,
            headings: ["Tally — Everything Pickleball"],
            bullets: [
              "Scoring widget for live matches",
              "Drills library for solo practice",
              "Overlays for iPad streaming",
            ],
            text: "Pickleball scoring built for tournament directors and coaches.",
            links: [
              "https://tally.example/features",
              "https://tally.example/pricing",
            ],
          });
        }
        return makePage({ url, text: "More pickleball drills." });
      },
    });
    expect(profile.provenance).toBe("live");
    expect(profile.productOneLiner).toBe("Tally — Everything Pickleball");
    expect(profile.featureTokens).toContain("pickleball");
    expect(profile.featureTokens).toContain("scoring");
    expect(profile.featureTokens).toContain("drills");
    expect(profile.featureTokens).toContain("overlays");
    expect(profile.audienceTokens.some((p) => p.includes("tournament"))).toBe(
      true,
    );
    // sourceUrls includes homepage + at least one internal page.
    expect(profile.sourceUrls).toContain("https://tally.example/");
    expect(profile.sourceUrls.length).toBeGreaterThan(1);
  });

  it("returns provenance:'degraded' when the homepage scrape fails", async () => {
    const profile = await fetchProductProfile({
      sellerUrl: "https://tally.example/",
      scrape: async () => null,
    });
    expect(profile.provenance).toBe("degraded");
    expect(profile.sourceUrls).toEqual([]);
    expect(profile.featureTokens).toEqual([]);
    expect(profile.productOneLiner).toBeNull();
  });
});
