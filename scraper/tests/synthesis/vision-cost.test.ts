import { describe, expect, it } from "vitest";
import { computeVisionCost } from "../../src/synthesis/cost.js";
import { PREMIUM_FEATURES } from "../../src/payment/cogs.js";

describe("computeVisionCost — caps keep the projection honest", () => {
  it("a capped pass (≤8 images, low detail, cheap model) stays under the creativeVision projection", () => {
    // The env hard cap: OWN(5) + COMPETITORS(3) × EACH(1) = 8 images.
    const cost = computeVisionCost({
      model: "gpt-5.4-mini",
      imageCount: 8,
      promptTokens: 800,
      outputTokens: 700,
    });
    expect(cost.costUsd).not.toBeNull();
    const cents = cost.costUsd! * 100;
    // The whole point: an honestly-capped vision pass is a fraction of the
    // 5¢ the creativeVision add-on price is sized against — generous headroom
    // for output variance and provider price drift. (The $0.18 the user
    // measured was ~25 full-detail images on a full-tier model — uncapped.)
    expect(cents).toBeLessThan(PREMIUM_FEATURES.creativeVision.projectedCogsCents);
  });

  it("returns null cost for an unknown model rather than guessing", () => {
    expect(
      computeVisionCost({ model: "mystery-vision", imageCount: 4, promptTokens: 100, outputTokens: 100 }).costUsd,
    ).toBeNull();
  });

  it("cost scales with image count", () => {
    const few = computeVisionCost({ model: "gpt-5.4-mini", imageCount: 2, promptTokens: 500, outputTokens: 500 });
    const many = computeVisionCost({ model: "gpt-5.4-mini", imageCount: 8, promptTokens: 500, outputTokens: 500 });
    expect(many.costUsd!).toBeGreaterThan(few.costUsd!);
  });
});
