import { describe, expect, it } from "vitest";
import type { QuoteResponse } from "@sniffy/scraper/schemas";
import { shouldShowNoScent } from "./triggers";

function makeQuote(overrides: Partial<QuoteResponse> = {}): QuoteResponse {
  const base: QuoteResponse = {
    requestId: "req_123",
    sniffId: "sniff_abc",
    store: "ios",
    country: "US",
    detectedApp: { id: "1234", name: "TestApp", developer: "Tester" },
    pricing: {
      currency: "USDC",
      network: "eip155:2910",
      estimatedTotal: "0.05",
      breakdown: [{ label: "base", amount: "0.03" }],
    },
    coverage: {
      appMetadata: "high",
      keywordRank: "medium",
      competitorTrail: "medium",
      reviews: "low",
    },
    shallowScan: {
      title: "TestApp",
      subtitle: "do the test",
      primaryCategory: "Productivity",
      ratingsSummary: { average: 4.5, count: 1200 },
      previewKeyword: {
        keyword: "test",
        rankBucket: "11-30",
        confidence: "medium",
        provenance: "live",
      },
    },
    next: { paidEndpoint: "/api/v1/aso/diagnose" },
  };
  return { ...base, ...overrides };
}

describe("shouldShowNoScent", () => {
  it("returns null for a healthy quote", () => {
    expect(shouldShowNoScent({ quote: makeQuote() })).toBeNull();
  });

  it("flags app-not-found when detected app has no id", () => {
    const quote = makeQuote({
      detectedApp: { id: "", name: "", developer: "" },
    });
    expect(shouldShowNoScent({ quote })).toBe("app-not-found");
  });

  it("flags app-not-found when name is 'unknown'", () => {
    const quote = makeQuote({
      detectedApp: { id: "1", name: "unknown", developer: "—" },
    });
    expect(shouldShowNoScent({ quote })).toBe("app-not-found");
  });

  it("flags country-unsupported when country isn't in the known list", () => {
    const quote = makeQuote({ country: "ZZ" });
    expect(
      shouldShowNoScent({ quote, knownCountries: ["US", "GB"] }),
    ).toBe("country-unsupported");
  });

  it("flags all-keywords-missing when preview is not_found", () => {
    const quote = makeQuote({
      shallowScan: {
        ...makeQuote().shallowScan,
        previewKeyword: {
          keyword: "obscure",
          rankBucket: "not_found",
          confidence: "low",
          provenance: "inferred",
        },
      },
    });
    expect(shouldShowNoScent({ quote })).toBe("all-keywords-missing");
  });

  it("flags all-fixture when preview is fixture + low keywordRank coverage", () => {
    const quote = makeQuote({
      coverage: {
        appMetadata: "low",
        keywordRank: "low",
        competitorTrail: "low",
        reviews: "low",
      },
      shallowScan: {
        ...makeQuote().shallowScan,
        previewKeyword: {
          keyword: "x",
          rankBucket: "31-50",
          confidence: "low",
          provenance: "fixture",
        },
      },
    });
    expect(shouldShowNoScent({ quote })).toBe("all-fixture");
  });
});
