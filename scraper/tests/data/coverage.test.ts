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
});

describe("buildCoverage", () => {
  it("derives appMetadata and keywordRank from provenance, defaults competitorTrail and reviews", () => {
    const coverage = buildCoverage({
      appMetadata: "live",
      keywordRank: "fixture",
    });
    expect(coverage).toEqual({
      appMetadata: "high",
      keywordRank: "low",
      competitorTrail: "medium",
      reviews: "low",
    });
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

  it("returns 'inferred' if any is inferred but none fixture", () => {
    expect(worstProvenance(["live", "inferred", "cached"])).toBe("inferred");
  });

  it("returns 'cached' if any is cached but none fixture/inferred", () => {
    expect(worstProvenance(["live", "cached", "live"])).toBe("cached");
  });

  it("returns 'live' if all are live", () => {
    expect(worstProvenance(["live", "live"])).toBe("live");
  });

  it("returns 'fixture' for an empty input (defensive)", () => {
    expect(worstProvenance([])).toBe("fixture");
  });
});
