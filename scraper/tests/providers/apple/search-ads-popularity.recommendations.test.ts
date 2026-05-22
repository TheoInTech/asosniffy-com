import { describe, expect, it } from "vitest";
import { _internal_extractRecommendedKeywords_forTests as extract } from "../../../src/providers/apple/search-ads-popularity.js";

describe("extractRecommendedKeywords — defensive Apple response parsing", () => {
  it("parses the canonical v5 shape with recommendedKeywords[]", () => {
    const body = {
      data: {
        recommendedKeywords: [
          {
            keyword: "Pickleball",
            popularity: 73,
            suggestedAmount: { amount: "1.25" },
          },
          {
            keyword: "court reservation",
            popularity: 41,
            bidLow: { amount: "0.50" },
            bidHigh: { amount: "1.50" },
          },
        ],
      },
    };
    const out = extract(body);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      keyword: "pickleball",
      popularity: 73,
    });
    // suggestedAmount falls back to bidLowUsd when bidLow itself is missing.
    expect(out[0]?.bidLowUsd).toBe(1.25);
    expect(out[1]).toMatchObject({
      keyword: "court reservation",
      popularity: 41,
      bidLowUsd: 0.5,
      bidHighUsd: 1.5,
    });
  });

  it("tolerates the alternate `recommendations[]` field name (legacy shape)", () => {
    const body = {
      data: {
        recommendations: [
          { keyword: "tournament tracker", popularity: 55 },
        ],
      },
    };
    const out = extract(body);
    expect(out).toHaveLength(1);
    expect(out[0]?.keyword).toBe("tournament tracker");
  });

  it("returns empty array on null/empty/non-object body", () => {
    expect(extract(null)).toEqual([]);
    expect(extract(undefined)).toEqual([]);
    expect(extract("not an object")).toEqual([]);
    expect(extract({})).toEqual([]);
  });

  it("skips items with missing/empty keyword fields", () => {
    const body = {
      data: {
        recommendedKeywords: [
          { popularity: 50 }, // no keyword
          { keyword: "", popularity: 50 }, // empty
          { keyword: "   ", popularity: 50 }, // whitespace
          { keyword: "valid", popularity: 50 },
        ],
      },
    };
    const out = extract(body);
    expect(out).toHaveLength(1);
    expect(out[0]?.keyword).toBe("valid");
  });

  it("clamps popularity into the 5-100 range Apple advertises", () => {
    const body = {
      data: {
        recommendedKeywords: [
          { keyword: "low", popularity: 2 },
          { keyword: "high", popularity: 999 },
          { keyword: "missing" }, // null popularity
        ],
      },
    };
    const out = extract(body);
    expect(out.find((k) => k.keyword === "low")?.popularity).toBe(5);
    expect(out.find((k) => k.keyword === "high")?.popularity).toBe(100);
    expect(out.find((k) => k.keyword === "missing")?.popularity).toBeNull();
  });

  it("handles bid amounts as both number and stringified number", () => {
    const body = {
      data: {
        recommendedKeywords: [
          {
            keyword: "stringamt",
            bidLow: { amount: "0.75" },
            bidHigh: { amount: "2.00" },
          },
          {
            keyword: "numericamt",
            bidLow: { amount: 0.5 },
            bidHigh: { amount: 1.5 },
          },
          {
            keyword: "badamt",
            bidLow: { amount: "not-a-number" },
          },
        ],
      },
    };
    const out = extract(body);
    expect(out.find((k) => k.keyword === "stringamt")?.bidLowUsd).toBe(0.75);
    expect(out.find((k) => k.keyword === "numericamt")?.bidLowUsd).toBe(0.5);
    expect(out.find((k) => k.keyword === "badamt")?.bidLowUsd).toBeNull();
  });

  it("normalizes keyword to lowercase + trimmed", () => {
    const body = {
      data: {
        recommendedKeywords: [
          { keyword: "  Pickleball Tournament  ", popularity: 50 },
        ],
      },
    };
    const out = extract(body);
    expect(out[0]?.keyword).toBe("pickleball tournament");
  });
});
