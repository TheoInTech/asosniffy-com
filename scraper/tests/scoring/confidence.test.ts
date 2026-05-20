import { describe, expect, it } from "vitest";
import {
  bucketOfPosition,
  deriveKeywordConfidence,
  identityConfidenceFromScore,
} from "../../src/scoring/confidence.js";

describe("deriveKeywordConfidence", () => {
  it("returns low when providerStatus is degraded or fixture", () => {
    expect(
      deriveKeywordConfidence({
        providerStatus: "degraded",
        depthSearched: 200,
        returnedCount: 200,
        identityConfidence: "high",
      }),
    ).toBe("low");
    expect(
      deriveKeywordConfidence({
        providerStatus: "fixture",
        depthSearched: 200,
        returnedCount: 200,
        identityConfidence: "high",
      }),
    ).toBe("low");
  });

  it("caps at low when identity confidence is low", () => {
    expect(
      deriveKeywordConfidence({
        providerStatus: "ok",
        depthSearched: 200,
        returnedCount: 200,
        identityConfidence: "low",
        rankBucket: "1-10",
      }),
    ).toBe("low");
  });

  it("returns low when the page is truncated", () => {
    expect(
      deriveKeywordConfidence({
        providerStatus: "ok",
        depthSearched: 50,
        returnedCount: 10,
        identityConfidence: "high",
      }),
    ).toBe("low");
  });

  it("returns low for not_found at shallow depth", () => {
    expect(
      deriveKeywordConfidence({
        providerStatus: "ok",
        depthSearched: 50,
        returnedCount: 50,
        identityConfidence: "high",
        rankBucket: "not_found",
      }),
    ).toBe("low");
  });

  it("caps at medium even with high identity (iTunes is not authoritative)", () => {
    expect(
      deriveKeywordConfidence({
        providerStatus: "ok",
        depthSearched: 50,
        returnedCount: 50,
        identityConfidence: "high",
        rankBucket: "1-10",
      }),
    ).toBe("medium");
  });
});

describe("identityConfidenceFromScore", () => {
  it("maps 0.85+ to high", () => {
    expect(identityConfidenceFromScore(0.85)).toBe("high");
    expect(identityConfidenceFromScore(0.95)).toBe("high");
  });
  it("maps 0.6 to 0.85 to medium", () => {
    expect(identityConfidenceFromScore(0.6)).toBe("medium");
    expect(identityConfidenceFromScore(0.8)).toBe("medium");
  });
  it("maps under 0.6 to low", () => {
    expect(identityConfidenceFromScore(0.5)).toBe("low");
    expect(identityConfidenceFromScore(0)).toBe("low");
  });
});

describe("bucketOfPosition", () => {
  it("maps positions to expected buckets", () => {
    expect(bucketOfPosition(0)).toBe("not_found");
    expect(bucketOfPosition(1)).toBe("1-10");
    expect(bucketOfPosition(10)).toBe("1-10");
    expect(bucketOfPosition(11)).toBe("11-30");
    expect(bucketOfPosition(30)).toBe("11-30");
    expect(bucketOfPosition(31)).toBe("31-50");
    expect(bucketOfPosition(50)).toBe("31-50");
    expect(bucketOfPosition(51)).toBe("51-100");
    expect(bucketOfPosition(100)).toBe("51-100");
    expect(bucketOfPosition(101)).toBe("100+");
  });
});
