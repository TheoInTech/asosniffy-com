import { describe, expect, it } from "vitest";
import {
  CATEGORY_CVR_BASELINES,
  DEFAULT_CVR_BASELINE,
  RATING_BANDS,
  RATING_CVR_MULTIPLIER_CURVE,
  THIN_VOLUME,
} from "../../src/data/conversion-benchmarks.js";
import {
  computeConversionIndex,
  type ConversionIndexInput,
} from "../../src/scoring/conversion-index.js";

function input(overrides: Partial<ConversionIndexInput> = {}): ConversionIndexInput {
  return {
    averageUserRating: 4.0,
    userRatingCount: 5_000,
    primaryCategory: null,
    store: "ios",
    ...overrides,
  };
}

describe("conversion benchmark corpus invariants", () => {
  it("curve anchors are strictly increasing in rating and nondecreasing in multiplier", () => {
    const anchors = RATING_CVR_MULTIPLIER_CURVE.anchors;
    expect(anchors.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < anchors.length; i++) {
      expect(anchors[i].rating).toBeGreaterThan(anchors[i - 1].rating);
      expect(anchors[i].multiplier).toBeGreaterThanOrEqual(anchors[i - 1].multiplier);
    }
    // Endpoints from the NP Digital study.
    expect(anchors[0]).toEqual({ rating: 1.0, multiplier: 0.08 });
    expect(anchors[anchors.length - 1]).toEqual({ rating: 5.0, multiplier: 1.0 });
    expect(RATING_CVR_MULTIPLIER_CURVE.source).toContain("NP Digital");
    expect(Number.isInteger(RATING_CVR_MULTIPLIER_CURVE.year)).toBe(true);
  });

  it("every category baseline is a sane attributed range; default spans the documented conflict", () => {
    for (const [category, range] of Object.entries(CATEGORY_CVR_BASELINES)) {
      expect(category.length).toBeGreaterThan(0);
      expect(range.low).toBeGreaterThan(0);
      expect(range.high).toBeGreaterThanOrEqual(range.low);
      expect(range.source.length).toBeGreaterThan(0);
      expect(range.year).toBeGreaterThanOrEqual(2020);
    }
    // AppTweak 2020 (33.7%) vs H1 2024 (25%) — the documented cross-vintage conflict.
    expect(DEFAULT_CVR_BASELINE.low).toBe(25);
    expect(DEFAULT_CVR_BASELINE.high).toBe(33.7);
    expect(DEFAULT_CVR_BASELINE.source.length).toBeGreaterThan(0);
  });

  it("rating bands carry the 3.5 / 4.0 / 4.5 thresholds with community-tested attribution", () => {
    expect(RATING_BANDS.suppression.value).toBe(3.5);
    expect(RATING_BANDS.credibilityFloor.value).toBe(4.0);
    expect(RATING_BANDS.topCluster.value).toBe(4.5);
    for (const band of Object.values(RATING_BANDS)) {
      expect(band.source.length).toBeGreaterThan(0);
      expect(band.evidence).toBe("community-tested");
    }
  });
});

describe("computeConversionIndex — rating multiplier interpolation", () => {
  it("returns exact anchor multipliers at curve anchor ratings", () => {
    const r40 = computeConversionIndex(input({ averageUserRating: 4.0 }));
    expect(r40.ratingMultiplier?.low).toBe(0.83);
    expect(r40.ratingMultiplier?.high).toBe(0.83);
    expect(r40.ratingMultiplier?.source).toContain("NP Digital");

    const r45 = computeConversionIndex(input({ averageUserRating: 4.5 }));
    expect(r45.ratingMultiplier?.low).toBe(0.96);
    expect(r45.ratingMultiplier?.high).toBe(0.96);

    const r30 = computeConversionIndex(input({ averageUserRating: 3.0 }));
    expect(r30.ratingMultiplier?.low).toBe(0.57);

    const r20 = computeConversionIndex(input({ averageUserRating: 2.0 }));
    expect(r20.ratingMultiplier?.low).toBe(0.15);
  });

  it("interpolates linearly between anchors", () => {
    // Midpoint of 4.0 (0.83) .. 4.5 (0.96) = 0.895
    const r425 = computeConversionIndex(input({ averageUserRating: 4.25 }));
    expect(r425.ratingMultiplier?.low).toBeCloseTo(0.895, 4);
    // Midpoint of 3.0 (0.57) .. 4.0 (0.83) = 0.70
    const r35 = computeConversionIndex(input({ averageUserRating: 3.5 }));
    expect(r35.ratingMultiplier?.low).toBeCloseTo(0.7, 4);
    // Midpoint of 2.0 (0.15) .. 3.0 (0.57) = 0.36
    const r25 = computeConversionIndex(input({ averageUserRating: 2.5 }));
    expect(r25.ratingMultiplier?.low).toBeCloseTo(0.36, 4);
    // Midpoint of 4.5 (0.96) .. 5.0 (1.00) = 0.98
    const r475 = computeConversionIndex(input({ averageUserRating: 4.75 }));
    expect(r475.ratingMultiplier?.low).toBeCloseTo(0.98, 4);
  });

  it("a 5.0 rating with healthy volume maps to multiplier 1.0 without the thin-volume flag", () => {
    const result = computeConversionIndex(
      input({ averageUserRating: 5.0, userRatingCount: 50_000 }),
    );
    expect(result.ratingMultiplier?.low).toBe(1);
    expect(result.ratingMultiplier?.high).toBe(1);
    expect(result.thinVolume).toBe(false);
  });
});

describe("computeConversionIndex — rating bands", () => {
  it.each([
    [3.49, "below-suppression"],
    [3.5, "below-credibility"],
    [3.99, "below-credibility"],
    [4.0, "credible"],
    [4.49, "credible"],
    [4.5, "top-cluster"],
  ] as const)("rating %f lands in band %s", (rating, band) => {
    const result = computeConversionIndex(input({ averageUserRating: rating }));
    expect(result.ratingBand).toBe(band);
    expect(result.bandNote).not.toBeNull();
  });

  it("band notes flag the thresholds as community-tested, not store-documented", () => {
    const result = computeConversionIndex(input({ averageUserRating: 3.2 }));
    expect(result.bandNote).toContain("Community-tested");
    expect(result.bandNote).toContain("not store-documented");
  });
});

describe("computeConversionIndex — honesty gates", () => {
  it("returns all-null rating fields when the rating is missing", () => {
    const result = computeConversionIndex(
      input({ averageUserRating: null, userRatingCount: null }),
    );
    expect(result.ratingMultiplier).toBeNull();
    expect(result.ratingBand).toBeNull();
    expect(result.bandNote).toBeNull();
    expect(result.estimatedConversionIndex).toBeNull();
    expect(result.thinVolume).toBe(false);
  });

  it("treats an iTunes zero rating (unrated app) as no signal", () => {
    const result = computeConversionIndex(
      input({ averageUserRating: 0, userRatingCount: 0 }),
    );
    expect(result.ratingMultiplier).toBeNull();
    expect(result.ratingBand).toBeNull();
    expect(result.estimatedConversionIndex).toBeNull();
  });

  it("returns a null baseline and null index for an unmapped category", () => {
    const result = computeConversionIndex(input({ primaryCategory: "Games" }));
    expect(result.categoryCvrBaseline).toBeNull();
    expect(result.estimatedConversionIndex).toBeNull();
    // Rating side still works.
    expect(result.ratingMultiplier).not.toBeNull();
    expect(result.ratingBand).toBe("credible");
  });

  it("returns a null baseline when the category is missing", () => {
    const result = computeConversionIndex(input({ primaryCategory: null }));
    expect(result.categoryCvrBaseline).toBeNull();
    expect(result.estimatedConversionIndex).toBeNull();
  });
});

describe("computeConversionIndex — category baseline and estimated index", () => {
  it("multiplies the rating multiplier against both ends of a mapped category baseline", () => {
    const baseline = CATEGORY_CVR_BASELINES["Productivity"];
    expect(baseline).toBeDefined();
    const result = computeConversionIndex(
      input({ averageUserRating: 4.0, primaryCategory: "Productivity" }),
    );
    expect(result.categoryCvrBaseline).toEqual(baseline);
    expect(result.estimatedConversionIndex).not.toBeNull();
    expect(result.estimatedConversionIndex!.low).toBeCloseTo(0.83 * baseline.low, 1);
    expect(result.estimatedConversionIndex!.high).toBeCloseTo(0.83 * baseline.high, 1);
    // Provenance: both contributing sources named, year = most recent contributor.
    expect(result.estimatedConversionIndex!.source).toContain("NP Digital");
    expect(result.estimatedConversionIndex!.source).toContain(baseline.source);
    expect(result.estimatedConversionIndex!.year).toBe(
      Math.max(RATING_CVR_MULTIPLIER_CURVE.year, baseline.year),
    );
  });

  it("still reports the category baseline when the rating is missing (index stays null)", () => {
    const result = computeConversionIndex(
      input({ averageUserRating: null, primaryCategory: "Productivity" }),
    );
    expect(result.categoryCvrBaseline).toEqual(CATEGORY_CVR_BASELINES["Productivity"]);
    expect(result.estimatedConversionIndex).toBeNull();
  });
});

describe("computeConversionIndex — thin-volume caveat (PowerReviews)", () => {
  it("flags a flat 5.0 with low volume and widens the multiplier down to the converts-like-3.0 floor", () => {
    const result = computeConversionIndex(
      input({ averageUserRating: 5.0, userRatingCount: 12 }),
    );
    expect(result.thinVolume).toBe(true);
    // Low end: curve value at 3.0 (PowerReviews: flat 5.0 converts like 3.0-3.49).
    expect(result.ratingMultiplier?.low).toBe(0.57);
    // High end: the naive curve value — the two studies disagree; ship the spread.
    expect(result.ratingMultiplier?.high).toBe(1);
    expect(result.ratingMultiplier?.source).toContain("PowerReviews");
    expect(result.bandNote).toContain("PowerReviews");
    expect(result.bandNote).toContain("e-commerce");
  });

  it("does not flag thin volume below the flat-rating floor", () => {
    const result = computeConversionIndex(
      input({ averageUserRating: 4.8, userRatingCount: 12 }),
    );
    expect(result.thinVolume).toBe(false);
    expect(result.ratingMultiplier?.low).toBe(result.ratingMultiplier?.high);
  });

  it("respects the documented count threshold boundary", () => {
    const atCeiling = computeConversionIndex(
      input({ averageUserRating: 5.0, userRatingCount: THIN_VOLUME.countCeiling }),
    );
    expect(atCeiling.thinVolume).toBe(false);
    const belowCeiling = computeConversionIndex(
      input({ averageUserRating: 5.0, userRatingCount: THIN_VOLUME.countCeiling - 1 }),
    );
    expect(belowCeiling.thinVolume).toBe(true);
  });

  it("skips the thin-volume check (flag stays false) when the rating count is unknown", () => {
    const result = computeConversionIndex(
      input({ averageUserRating: 5.0, userRatingCount: null }),
    );
    expect(result.thinVolume).toBe(false);
    expect(result.bandNote).toContain("thin-volume check skipped");
  });
});

describe("computeConversionIndex — android handling", () => {
  it("applies the iOS-derived curve as a widened approximation and notes it", () => {
    const result = computeConversionIndex(
      input({ averageUserRating: 4.0, store: "android" }),
    );
    // 0.83 widened by +/-15% (documented cross-platform uncertainty assumption).
    expect(result.ratingMultiplier?.low).toBeCloseTo(0.7055, 4);
    expect(result.ratingMultiplier?.high).toBeCloseTo(0.9545, 4);
    expect(result.ratingMultiplier?.source).toContain("Android");
    expect(result.bandNote).toContain("iOS-derived");
  });

  it("clamps the widened android multiplier at 1.0", () => {
    const result = computeConversionIndex(
      input({ averageUserRating: 5.0, userRatingCount: 50_000, store: "android" }),
    );
    expect(result.ratingMultiplier?.high).toBe(1);
  });

  it("never returns a category baseline or estimated index on android (corpus is iOS-only)", () => {
    const result = computeConversionIndex(
      input({ primaryCategory: "Productivity", store: "android" }),
    );
    expect(result.categoryCvrBaseline).toBeNull();
    expect(result.estimatedConversionIndex).toBeNull();
  });

  it("combines thin-volume widening with the android approximation", () => {
    const result = computeConversionIndex(
      input({ averageUserRating: 5.0, userRatingCount: 10, store: "android" }),
    );
    expect(result.thinVolume).toBe(true);
    expect(result.ratingMultiplier?.low).toBeCloseTo(0.57 * 0.85, 4);
    expect(result.ratingMultiplier?.high).toBe(1);
  });
});

describe("computeConversionIndex — determinism", () => {
  it("returns identical output for identical input", () => {
    const a = computeConversionIndex(
      input({ averageUserRating: 4.3, userRatingCount: 321, primaryCategory: "Finance" }),
    );
    const b = computeConversionIndex(
      input({ averageUserRating: 4.3, userRatingCount: 321, primaryCategory: "Finance" }),
    );
    expect(a).toEqual(b);
  });
});
