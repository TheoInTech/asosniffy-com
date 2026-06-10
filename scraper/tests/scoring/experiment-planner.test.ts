import { describe, expect, it } from "vitest";
import {
  adviseRatingReset,
  planZeroBudgetExperiment,
  type BenchmarkRangeLike,
} from "../../src/scoring/experiment-planner.js";

// Hand-computed expectations (do not derive these from the module under test):
//
//   n per arm = ceil( 2 * p * (1-p) * (z_alpha + z_beta)^2 / (p * MDE)^2 )
//   z_alpha = 1.645 (90% confidence, two-sided), z_beta = 0.8416 (80% power)
//   (1.645 + 0.8416)^2 = 2.4866^2 = 6.18317956
//   MDE = 0.15 relative; arms = 2 (original + 1 treatment)
//
//   p = 0.25 : raw = 2*0.25*0.75*6.18317956 / 0.0375^2 = 1648.85 -> 1649/arm
//              total = 3298 -> at 1000 imps/day -> ceil(3.298) = 4 days
//   p = 0.04 : raw = 549.616*(0.96/0.04) = 13190.79 -> 13191/arm -> 26382 total
//              at 1000/day -> ceil(26.382) = 27 days
//   p = 0.02 : raw = 549.616*(0.98/0.02) = 26931.19 -> 26932/arm -> 53864 total
//              at 1000/day -> ceil(53.864) = 54 days

const CVR_RANGE: BenchmarkRangeLike = {
  low: 0.02,
  high: 0.04,
  source: "AppTweak H1 2024 via Adapty",
  year: 2024,
};

const CVR_POINT: BenchmarkRangeLike = {
  low: 0.25,
  high: 0.25,
  source: "AppTweak H1 2024 via Adapty",
  year: 2024,
};

describe("planZeroBudgetExperiment", () => {
  it("matches the hand-computed sample-size math for a point baseline (p=0.25)", () => {
    const plan = planZeroBudgetExperiment({
      store: "ios",
      estDailyImpressions: 1000,
      baselineCvr: CVR_POINT,
    });
    expect(plan.daysToSignificance).toEqual({ low: 4, high: 4 });
    expect(plan.feasible).toBe(true);
    expect(plan.suggestedFirstTest).toBe("screenshots");
  });

  it("uses baselineCvr.high for days.low and baselineCvr.low for days.high", () => {
    const plan = planZeroBudgetExperiment({
      store: "ios",
      estDailyImpressions: 1000,
      baselineCvr: CVR_RANGE,
    });
    expect(plan.daysToSignificance).toEqual({ low: 27, high: 54 });
    expect(plan.feasible).toBe(true);
  });

  it("is feasible exactly at the 90-day boundary", () => {
    // 53864 total / 600 per day = 89.77 -> ceil 90 -> still inside the window
    const plan = planZeroBudgetExperiment({
      store: "ios",
      estDailyImpressions: 600,
      baselineCvr: CVR_RANGE,
    });
    expect(plan.daysToSignificance?.high).toBe(90);
    expect(plan.feasible).toBe(true);
  });

  it("flips infeasible just past the 90-day boundary", () => {
    // 53864 / 590 = 91.3 -> ceil 92 -> beyond the window
    const plan = planZeroBudgetExperiment({
      store: "ios",
      estDailyImpressions: 590,
      baselineCvr: CVR_RANGE,
    });
    expect(plan.daysToSignificance?.high).toBe(92);
    expect(plan.feasible).toBe(false);
  });

  it("still suggests a screenshots test when only the optimistic end fits the window", () => {
    // low = ceil(26382/400) = 66 <= 90 < high = ceil(53864/400) = 135
    const plan = planZeroBudgetExperiment({
      store: "ios",
      estDailyImpressions: 400,
      baselineCvr: CVR_RANGE,
    });
    expect(plan.daysToSignificance).toEqual({ low: 66, high: 135 });
    expect(plan.feasible).toBe(false);
    expect(plan.suggestedFirstTest).toBe("screenshots");
  });

  it("returns null suggestedFirstTest and a fix-fundamentals recommendation when no test can fit", () => {
    // even the optimistic end: ceil(26382/100) = 264 > 90
    const plan = planZeroBudgetExperiment({
      store: "ios",
      estDailyImpressions: 100,
      baselineCvr: CVR_RANGE,
    });
    expect(plan.daysToSignificance).toEqual({ low: 264, high: 539 });
    expect(plan.feasible).toBe(false);
    expect(plan.suggestedFirstTest).toBeNull();
    expect(plan.recommendation.toLowerCase()).toMatch(/rating|metadata/);
  });

  it("returns feasible null when estDailyImpressions is null, with a paste-in recommendation", () => {
    const plan = planZeroBudgetExperiment({
      store: "ios",
      estDailyImpressions: null,
      baselineCvr: CVR_RANGE,
    });
    expect(plan.feasible).toBeNull();
    expect(plan.daysToSignificance).toBeNull();
    expect(plan.suggestedFirstTest).toBeNull();
    expect(plan.recommendation).toMatch(/App Store Connect/);
  });

  it("returns feasible null when baselineCvr is null", () => {
    const plan = planZeroBudgetExperiment({
      store: "ios",
      estDailyImpressions: 1000,
      baselineCvr: null,
    });
    expect(plan.feasible).toBeNull();
    expect(plan.daysToSignificance).toBeNull();
    expect(plan.recommendation.toLowerCase()).toContain("baseline");
  });

  it("treats an invalid baselineCvr range as missing rather than computing nonsense", () => {
    const plan = planZeroBudgetExperiment({
      store: "ios",
      estDailyImpressions: 1000,
      baselineCvr: { low: 0.04, high: 0.02, source: "broken", year: 2024 },
    });
    expect(plan.feasible).toBeNull();
    expect(plan.daysToSignificance).toBeNull();
  });

  it("treats zero impressions as known-infeasible, not unknown", () => {
    const plan = planZeroBudgetExperiment({
      store: "ios",
      estDailyImpressions: 0,
      baselineCvr: CVR_RANGE,
    });
    expect(plan.feasible).toBe(false);
    expect(plan.daysToSignificance).toBeNull();
    expect(plan.suggestedFirstTest).toBeNull();
  });

  it("routes android to Play Store Listing Experiments and notes the absent hard window", () => {
    const plan = planZeroBudgetExperiment({
      store: "android",
      estDailyImpressions: 1000,
      baselineCvr: CVR_RANGE,
    });
    expect(plan.daysToSignificance).toEqual({ low: 27, high: 54 });
    expect(plan.feasible).toBe(true);
    expect(plan.platformPath).toMatch(/Store Listing Experiments/i);
    expect(plan.assumptions.join(" ")).toMatch(/no hard duration cap/i);
  });

  it("routes ios to Apple Product Page Optimization in platformPath", () => {
    const plan = planZeroBudgetExperiment({
      store: "ios",
      estDailyImpressions: 1000,
      baselineCvr: CVR_RANGE,
    });
    expect(plan.platformPath).toMatch(/Product Page Optimization/);
  });

  it("documents constants, evidence framing, and the benchmark source+year in assumptions", () => {
    const plan = planZeroBudgetExperiment({
      store: "ios",
      estDailyImpressions: 1000,
      baselineCvr: CVR_RANGE,
    });
    const joined = plan.assumptions.join(" ");
    expect(joined).toContain("1.645"); // z_alpha documented
    expect(joined).toContain("0.8416"); // z_beta documented
    expect(joined).toContain("15%"); // relative MDE documented
    expect(joined).toContain("AppTweak H1 2024 via Adapty"); // benchmark source
    expect(joined).toContain("2024"); // benchmark year
    expect(joined).toMatch(/Apple-documented/); // evidence framing
    expect(joined).toMatch(/community-tested/i); // screenshots-first is not Apple doctrine
  });
});

describe("adviseRatingReset", () => {
  it("recommends consider when the current version is materially better and lifetime is below 4.0", () => {
    const advice = adviseRatingReset({
      lifetimeAverage: 3.6,
      lifetimeCount: 800,
      currentVersionAverage: 4.4,
      currentVersionCount: 120,
    });
    expect(advice.stance).toBe("consider");
    expect(advice.rationale).toMatch(/4\.0/); // credibility threshold cited
  });

  it("recommends avoid when lifetime average is at or above 4.0 (social proof)", () => {
    const advice = adviseRatingReset({
      lifetimeAverage: 4.0,
      lifetimeCount: 12_000,
      currentVersionAverage: 4.6,
      currentVersionCount: 300,
    });
    expect(advice.stance).toBe("avoid");
    expect(advice.rationale.toLowerCase()).toContain("social proof");
  });

  it("recommends avoid when the current version is worse than lifetime", () => {
    const advice = adviseRatingReset({
      lifetimeAverage: 3.8,
      lifetimeCount: 500,
      currentVersionAverage: 3.2,
      currentVersionCount: 90,
    });
    expect(advice.stance).toBe("avoid");
    expect(advice.rationale.toLowerCase()).toContain("worse");
  });

  it("returns insufficient-data when averages are missing", () => {
    const advice = adviseRatingReset({
      lifetimeAverage: null,
      lifetimeCount: null,
      currentVersionAverage: null,
      currentVersionCount: null,
    });
    expect(advice.stance).toBe("insufficient-data");
  });

  it("returns insufficient-data when the improvement rides on too few current-version ratings", () => {
    const advice = adviseRatingReset({
      lifetimeAverage: 3.5,
      lifetimeCount: 1000,
      currentVersionAverage: 3.9,
      currentVersionCount: 30,
    });
    expect(advice.stance).toBe("insufficient-data");
    expect(advice.rationale).toContain("50"); // volume threshold documented
  });

  it("returns insufficient-data when the delta is positive but below the 0.3 threshold", () => {
    const advice = adviseRatingReset({
      lifetimeAverage: 3.6,
      lifetimeCount: 400,
      currentVersionAverage: 3.8,
      currentVersionCount: 500,
    });
    expect(advice.stance).toBe("insufficient-data");
    expect(advice.rationale).toContain("0.3"); // delta threshold documented
  });

  it("accepts the exact thresholds: delta == 0.3 and count == 50", () => {
    const advice = adviseRatingReset({
      lifetimeAverage: 3.6,
      lifetimeCount: 200,
      currentVersionAverage: 3.9,
      currentVersionCount: 50,
    });
    expect(advice.stance).toBe("consider");
  });

  it("rejects count just under the threshold (49)", () => {
    const advice = adviseRatingReset({
      lifetimeAverage: 3.6,
      lifetimeCount: 200,
      currentVersionAverage: 3.9,
      currentVersionCount: 49,
    });
    expect(advice.stance).toBe("insufficient-data");
  });

  it("treats an unchanged rating as not-worse but not consider-worthy", () => {
    const advice = adviseRatingReset({
      lifetimeAverage: 3.7,
      lifetimeCount: 300,
      currentVersionAverage: 3.7,
      currentVersionCount: 200,
    });
    expect(advice.stance).toBe("insufficient-data");
  });

  it("treats out-of-range averages as missing data, never as signal", () => {
    const advice = adviseRatingReset({
      lifetimeAverage: 7,
      lifetimeCount: 100,
      currentVersionAverage: 4.5,
      currentVersionCount: 100,
    });
    expect(advice.stance).toBe("insufficient-data");
  });

  it("always explains the iOS per-version reset lever and the Android non-equivalent in mechanics", () => {
    for (const input of [
      {
        lifetimeAverage: 3.6,
        lifetimeCount: 800,
        currentVersionAverage: 4.4,
        currentVersionCount: 120,
      },
      {
        lifetimeAverage: 4.5,
        lifetimeCount: 800,
        currentVersionAverage: 4.6,
        currentVersionCount: 120,
      },
      {
        lifetimeAverage: null,
        lifetimeCount: null,
        currentVersionAverage: null,
        currentVersionCount: null,
      },
    ]) {
      const advice = adviseRatingReset(input);
      expect(advice.mechanics).toMatch(/App Store Connect/);
      expect(advice.mechanics).toMatch(/territory/);
      expect(advice.mechanics).toMatch(/recent/i); // Play recent-weighting note
    }
  });
});
