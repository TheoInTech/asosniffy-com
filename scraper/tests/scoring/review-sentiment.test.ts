import { describe, expect, it } from "vitest";
import {
  analyzeReviewSentiment,
  MIN_REVIEWS_FOR_SENTIMENT,
} from "../../src/scoring/review-sentiment.js";

// Helper to make a review body of a given sentiment. Uses tokens from the
// curated dictionaries inside review-sentiment.ts. Mirrors what a real
// app-store review tends to look like — short title + 1-2 sentence body.
function posReview(extra = ""): string {
  return `Love this app\nAmazing experience, really useful and intuitive. ${extra}`;
}
function negReview(extra = ""): string {
  return `Terrible\nReally buggy and slow, crashes constantly. ${extra}`;
}
function neutralReview(extra = ""): string {
  return `Fine\nDecent enough but nothing special. ${extra}`;
}

describe("analyzeReviewSentiment — coverage gates", () => {
  it("returns null when review coverage is 'unavailable'", () => {
    const out = analyzeReviewSentiment({
      reviewBodies: Array.from({ length: 20 }, () => posReview()),
      reviewCoverage: "unavailable",
    });
    expect(out).toBeNull();
  });

  it("returns null when review coverage is 'skipped'", () => {
    const out = analyzeReviewSentiment({
      reviewBodies: Array.from({ length: 20 }, () => posReview()),
      reviewCoverage: "skipped",
    });
    expect(out).toBeNull();
  });

  it("returns null when review count is below MIN_REVIEWS_FOR_SENTIMENT", () => {
    const bodies = Array.from({ length: MIN_REVIEWS_FOR_SENTIMENT - 1 }, () =>
      posReview(),
    );
    expect(
      analyzeReviewSentiment({ reviewBodies: bodies, reviewCoverage: "complete" }),
    ).toBeNull();
  });

  it("returns a result at exactly MIN_REVIEWS_FOR_SENTIMENT", () => {
    const bodies = Array.from({ length: MIN_REVIEWS_FOR_SENTIMENT }, () =>
      posReview(),
    );
    const out = analyzeReviewSentiment({
      reviewBodies: bodies,
      reviewCoverage: "complete",
    });
    expect(out).not.toBeNull();
    expect(out?.totalReviewsAnalyzed).toBe(MIN_REVIEWS_FOR_SENTIMENT);
  });
});

describe("analyzeReviewSentiment — polarity distribution", () => {
  it("scores all-positive reviews as ≥80% positive", () => {
    const bodies = Array.from({ length: 10 }, () => posReview());
    const out = analyzeReviewSentiment({
      reviewBodies: bodies,
      reviewCoverage: "complete",
    });
    expect(out?.positivePercent).toBeGreaterThanOrEqual(80);
    expect(out?.negativePercent).toBe(0);
  });

  it("scores all-negative reviews as ≥80% negative", () => {
    const bodies = Array.from({ length: 10 }, () => negReview());
    const out = analyzeReviewSentiment({
      reviewBodies: bodies,
      reviewCoverage: "complete",
    });
    expect(out?.negativePercent).toBeGreaterThanOrEqual(80);
    expect(out?.positivePercent).toBe(0);
  });

  it("scores neutral-only reviews as ≥80% neutral", () => {
    const bodies = Array.from({ length: 10 }, () => neutralReview());
    const out = analyzeReviewSentiment({
      reviewBodies: bodies,
      reviewCoverage: "complete",
    });
    expect(out?.neutralPercent).toBeGreaterThanOrEqual(80);
  });

  it("percent fields sum to ≈100 (rounding drift ≤ 1)", () => {
    const bodies = [
      posReview(),
      posReview(),
      posReview(),
      negReview(),
      negReview(),
      neutralReview(),
      neutralReview(),
    ];
    const out = analyzeReviewSentiment({
      reviewBodies: bodies,
      reviewCoverage: "complete",
    });
    const sum =
      (out?.positivePercent ?? 0) +
      (out?.neutralPercent ?? 0) +
      (out?.negativePercent ?? 0);
    expect(Math.abs(sum - 100)).toBeLessThanOrEqual(1);
  });
});

describe("analyzeReviewSentiment — negation + intensifier handling", () => {
  it("flips 'not good' from positive to negative", () => {
    const bodies = Array.from({ length: 10 }, () => `Hmm\nnot good at all.`);
    const out = analyzeReviewSentiment({
      reviewBodies: bodies,
      reviewCoverage: "complete",
    });
    // Without negation handling these would parse positive. With it,
    // expect negative to dominate.
    expect(out?.negativePercent).toBeGreaterThan(out?.positivePercent ?? 0);
  });

  it("intensifier 'very bad' counts as 2x negative weight", () => {
    // 5 reviews of "very bad" should easily push negative > 50%.
    const bodies = Array.from({ length: 5 }, () => `bad\nvery bad app`);
    const out = analyzeReviewSentiment({
      reviewBodies: bodies,
      reviewCoverage: "complete",
    });
    expect(out?.negativePercent).toBeGreaterThanOrEqual(80);
  });
});

describe("analyzeReviewSentiment — complaint themes", () => {
  it("extracts the most-mentioned word across distinct negative reviews", () => {
    // 4 negative reviews all complain about battery; 1 neutral mentions it.
    const bodies = [
      `Terrible\nbattery dies in two hours, awful experience.`,
      `Bad\nbattery drain is the worst, garbage app.`,
      `Frustrating\nbattery just gets worse, broken app.`,
      `Annoying\nbattery is unusable, horrible.`,
      `Okay\nbattery seems fine, decent app.`, // neutral — should not count
      `Bad\ncrashing all the time, terrible.`,
      `Awful\ncrashing screens, worst app.`,
      // pad to clear MIN_REVIEWS_FOR_SENTIMENT and keep negative majority.
    ];
    const out = analyzeReviewSentiment({
      reviewBodies: bodies,
      reviewCoverage: "complete",
    });
    expect(out).not.toBeNull();
    // "battery" appeared in 4 distinct negative reviews; "crashing" in 2.
    expect(out?.topComplaintThemes[0]?.theme).toBe("battery");
    expect(out?.topComplaintThemes[0]?.sampleCount).toBe(4);
  });

  it("drops themes that appeared in fewer than 2 distinct negative reviews", () => {
    const bodies = [
      `Bad\nbattery is terrible.`, // battery: 1 negative
      `Terrible\nbattery is awful.`, // battery: 2 negative ← qualifies
      `Bad\nads are annoying.`, // ads: 1 negative
      `Awful\nads everywhere, broken.`, // ads: 2 negative ← qualifies
      `Garbage\nrandom complaint hate.`, // singletons should drop
      `Crash\nstupid bugs broken.`,
    ];
    const out = analyzeReviewSentiment({
      reviewBodies: bodies,
      reviewCoverage: "complete",
    });
    const themes = (out?.topComplaintThemes ?? []).map((t) => t.theme);
    expect(themes).toContain("battery");
    expect(themes).toContain("ads");
    // Singleton complaint themes that only appeared once should not surface.
    for (const t of out?.topComplaintThemes ?? []) {
      expect(t.sampleCount).toBeGreaterThanOrEqual(2);
    }
  });

  it("returns at most 5 complaint themes", () => {
    // Synthesize 10 distinct complaint nouns each appearing in 3 negative reviews.
    const nouns = [
      "battery",
      "ads",
      "subscription",
      "ratings",
      "interface",
      "loading",
      "syncing",
      "performance",
      "tutorial",
      "notifications",
    ];
    const bodies: string[] = [];
    for (const noun of nouns) {
      for (let i = 0; i < 3; i++) {
        bodies.push(`Bad\n${noun} is terrible and broken.`);
      }
    }
    const out = analyzeReviewSentiment({
      reviewBodies: bodies,
      reviewCoverage: "complete",
    });
    expect(out?.topComplaintThemes.length).toBeLessThanOrEqual(5);
  });
});

describe("analyzeReviewSentiment — empty + edge cases", () => {
  it("returns null on empty review array", () => {
    expect(
      analyzeReviewSentiment({ reviewBodies: [], reviewCoverage: "complete" }),
    ).toBeNull();
  });

  it("treats reviews with no sentiment tokens as neutral", () => {
    const bodies = Array.from(
      { length: 10 },
      () => `Update\nNew version released yesterday.`,
    );
    const out = analyzeReviewSentiment({
      reviewBodies: bodies,
      reviewCoverage: "complete",
    });
    expect(out?.neutralPercent).toBe(100);
    expect(out?.topComplaintThemes).toHaveLength(0);
  });

  it("totalReviewsAnalyzed equals the input array length", () => {
    const bodies = Array.from({ length: 12 }, () => posReview());
    const out = analyzeReviewSentiment({
      reviewBodies: bodies,
      reviewCoverage: "complete",
    });
    expect(out?.totalReviewsAnalyzed).toBe(12);
  });
});
