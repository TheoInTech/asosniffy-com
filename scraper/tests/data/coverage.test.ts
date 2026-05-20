import { describe, expect, it } from "vitest";
import {
  buildCoverage,
  deriveCoverageFromProvenance,
  worstProvenance,
} from "../../src/data/coverage.js";

describe("deriveCoverageFromProvenance", () => {
  it("live and cached map to high", () => {
    expect(deriveCoverageFromProvenance("live")).toBe("high");
    expect(deriveCoverageFromProvenance("cached")).toBe("high");
  });

  it("inferred maps to medium", () => {
    expect(deriveCoverageFromProvenance("inferred")).toBe("medium");
  });

  it("fixture maps to low", () => {
    expect(deriveCoverageFromProvenance("fixture")).toBe("low");
  });

  it("degraded maps to low", () => {
    expect(deriveCoverageFromProvenance("degraded")).toBe("low");
  });
});

describe("buildCoverage", () => {
  it("derives appMetadata and keywordRank from provenance, defaults competitorTrail and reviews", () => {
    const coverage = buildCoverage({
      appMetadata: "live",
      keywordRank: "fixture",
    });
    expect(coverage).toMatchObject({
      appMetadata: "high",
      keywordRank: "low",
      competitorTrail: "medium",
      reviews: "low",
    });
    // Phase 1: status and providerErrors are always present.
    expect(coverage.status).toBeDefined();
    expect(Array.isArray(coverage.providerErrors)).toBe(true);
  });

  it("status is 'ok' when all inputs are live/cached", () => {
    const coverage = buildCoverage({
      appMetadata: "live",
      keywordRank: "cached",
      competitors: "live",
    });
    expect(coverage.status).toBe("ok");
  });

  it("status is 'degraded' when all inputs are degraded", () => {
    const coverage = buildCoverage({
      appMetadata: "degraded",
      keywordRank: "degraded",
    });
    expect(coverage.status).toBe("degraded");
  });

  it("status is 'partial' when some live and some degraded", () => {
    const coverage = buildCoverage({
      appMetadata: "live",
      keywordRank: "degraded",
    });
    expect(coverage.status).toBe("partial");
  });

  it("status is 'fixture_only' when any input is fixture", () => {
    const coverage = buildCoverage({
      appMetadata: "fixture",
      keywordRank: "fixture",
    });
    expect(coverage.status).toBe("fixture_only");
  });

  it("propagates providerErrors verbatim", () => {
    const coverage = buildCoverage({
      appMetadata: "degraded",
      keywordRank: "degraded",
      providerErrors: [
        {
          provider: "apple-itunes",
          kind: "rate_limited",
          message: "Apple rate-limited /lookup",
        },
      ],
    });
    expect(coverage.providerErrors).toHaveLength(1);
    expect(coverage.providerErrors[0]!.provider).toBe("apple-itunes");
  });

  it("derives competitorTrail when provided", () => {
    const coverage = buildCoverage({
      appMetadata: "live",
      keywordRank: "live",
      competitors: "fixture",
    });
    expect(coverage.competitorTrail).toBe("low");
  });

  it("reviews is always low (no MVP source)", () => {
    const coverage = buildCoverage({
      appMetadata: "live",
      keywordRank: "live",
      competitors: "live",
    });
    expect(coverage.reviews).toBe("low");
  });
});

describe("worstProvenance", () => {
  it("returns 'fixture' if any input is fixture", () => {
    expect(worstProvenance(["live", "cached", "fixture"])).toBe("fixture");
  });

  it("returns 'degraded' when any input is degraded but none fixture", () => {
    expect(worstProvenance(["live", "degraded", "cached"])).toBe("degraded");
  });

  it("returns 'inferred' if any is inferred but none fixture/degraded", () => {
    expect(worstProvenance(["live", "inferred", "cached"])).toBe("inferred");
  });

  it("returns 'cached' if any is cached but none worse", () => {
    expect(worstProvenance(["live", "cached", "live"])).toBe("cached");
  });

  it("returns 'live' if all are live", () => {
    expect(worstProvenance(["live", "live"])).toBe("live");
  });

  it("returns 'degraded' (not 'fixture') for an empty input — empty is honest-empty", () => {
    expect(worstProvenance([])).toBe("degraded");
  });
});
