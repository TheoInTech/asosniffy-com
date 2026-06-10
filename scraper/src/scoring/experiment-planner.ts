// Zero-budget experiment planner + iOS rating-reset advisor (roadmap 1.2,
// conversionAudit section).
//
// Two pure, deterministic advisors built only from already-fetched inputs:
//
//   planZeroBudgetExperiment — can this app's estimated impressions reach
//     statistical significance inside Apple's Product Page Optimization
//     window, and which creative element should the first test change?
//   adviseRatingReset — should the developer use Apple's per-version summary
//     rating reset on the next release?
//
// Where the mechanics and constants come from:
//   • Apple PPO envelope (up to 3 treatments vs the original, 90-day cap,
//     results reported at 90% confidence in App Analytics, treatment assets
//     pass App Review) — Apple first-party:
//     https://developer.apple.com/app-store/product-page-optimization/
//   • Google Play Store Listing Experiments (free native A/B tests, no hard
//     duration cap, Google recommends one element at a time and at least a
//     week per test; Google-published case studies show +20-45% installs) —
//     https://play.google.com/console/about/store-listing-experiments/
//   • "Screenshots first" creative priority (screenshots > icon > video)
//     comes from SplitMetrics' corpus of thousands of A/B tests (2024) —
//     community-tested, NOT Apple doctrine:
//     https://splitmetrics.com/blog/ab-testing/
//   • iOS rating-reset mechanics (summary rating is per-territory, resettable
//     when releasing a new version, written reviews persist, Apple warns to
//     use it sparingly) — Apple first-party:
//     https://developer.apple.com/app-store/ratings-and-reviews/
//   • Play displayed rating is officially weighted toward recent ratings
//     (no developer-triggered reset exists) — Google first-party:
//     https://support.google.com/googleplay/android-developer/answer/138230
//   • The 4.0 "credibility threshold" is community/vendor analysis
//     (AppFollow ranking-factors guide, 2026; NP Digital featuring data) —
//     https://appfollow.io/blog/aso-ranking-factors
//
// Sample-size math is the standard two-proportion approximation with equal
// arms and p1 ~= p2 ~= p:
//
//   n per arm ~= 2 * p * (1 - p) * (z_alpha + z_beta)^2 / (p * MDE)^2
//
// with z_alpha = 1.645 (90% confidence, two-sided — matching the confidence
// level Apple reports for PPO), z_beta = 0.8416 (80% power), and a 15%
// relative minimum detectable effect. The plan assumes the recommended
// indie configuration of 2 arms (original + 1 treatment); PPO supports up
// to 3 treatments, but splitting traffic across more arms multiplies the
// estimated duration.
//
// What this module deliberately does NOT claim:
//   • It does not predict the size of any conversion lift — it only sizes
//     whether a chosen lift would be *detectable*.
//   • It is not Apple's proprietary duration estimator (which uses your real
//     ASC impressions/downloads); days here are estimates from category-level
//     baseline ranges, each carrying its source + year.
//   • It does not claim screenshot captions affect search rank (contested;
//     Apple has reportedly denied OCR indexing) — screenshots are recommended
//     purely as the #1 *conversion* element.
//   • It does not promise a rating reset improves rank; the reset advisor
//     only compares the displayed-number consequences of the documented lever.
//
// Honesty gates: missing inputs (null impressions, null/invalid baseline)
// produce null-bearing fields with a recommendation explaining what to paste
// in — never a fabricated estimate. No I/O, no clock reads, no LLM calls.

// Structural duplicate of the shared benchmark-range convention
// ({ low, high, source, year }); the schema integrator unifies the type.
export interface BenchmarkRangeLike {
  low: number;
  high: number;
  source: string;
  year: number;
}

export interface ExperimentPlanInput {
  store: "ios" | "android";
  // Estimated daily store-listing impressions. null = unknown (e.g. the
  // founder has not pasted ASC/Play Console numbers and no rank-based
  // estimate is available).
  estDailyImpressions: number | null;
  // Category-level baseline conversion rate as a sourced range. Must describe
  // the same funnel stage as estDailyImpressions (impressions x install rate,
  // or page views x page CVR).
  baselineCvr: BenchmarkRangeLike | null;
}

export interface ExperimentPlan {
  // true/false when computable; null when inputs are insufficient.
  feasible: boolean | null;
  // low end uses baselineCvr.high (higher conversion -> fewer samples);
  // high end uses baselineCvr.low. Days are ceil'd integers.
  daysToSignificance: { low: number; high: number } | null;
  assumptions: string[];
  recommendation: string;
  suggestedFirstTest: "screenshots" | "icon" | "video" | null;
  platformPath: string;
}

// --- Tunables (documented in assumptions[] on every computed plan) ---
const Z_ALPHA = 1.645; // 90% confidence, two-sided
const Z_BETA = 0.8416; // 80% power
const RELATIVE_MDE = 0.15; // 15% relative minimum detectable effect
const ARMS = 2; // original + 1 treatment (recommended indie configuration)
const PPO_WINDOW_DAYS = 90; // Apple-documented PPO cap; comparability yardstick on Android

const IOS_PLATFORM_PATH =
  "Apple Product Page Optimization (App Store Connect -> Product Page Optimization): " +
  "free native A/B test of the default product page; up to 3 treatments vs the original, " +
  "90-day cap, results reported at 90% confidence; treatment assets pass App Review and " +
  "alternate icons must ship in the binary.";

const ANDROID_PLATFORM_PATH =
  "Google Play Store Listing Experiments (Play Console -> Store listing experiments): " +
  "free native A/B tests with no hard duration cap; Google recommends testing one element " +
  "at a time and running at least a week to absorb weekday/weekend traffic patterns.";

export function planZeroBudgetExperiment(
  input: ExperimentPlanInput,
): ExperimentPlan {
  const platformPath =
    input.store === "ios" ? IOS_PLATFORM_PATH : ANDROID_PLATFORM_PATH;
  const baseAssumptions = mathAssumptions(input.store, input.baselineCvr);

  const impressions = finiteOrNull(input.estDailyImpressions);
  const cvr = validBaselineOrNull(input.baselineCvr);

  // Honesty gate: unknown impressions -> we cannot size anything. Tell the
  // founder exactly which number to paste in instead of guessing.
  if (impressions === null) {
    return {
      feasible: null,
      daysToSignificance: null,
      assumptions: [
        ...baseAssumptions,
        "[missing-input] estDailyImpressions was not provided; feasibility cannot be computed.",
      ],
      recommendation:
        input.store === "ios"
          ? "Cannot size a test without daily impressions. Paste your App Store Connect " +
            "impressions (Analytics -> Metrics -> Impressions, last 30 days divided by 30) " +
            "into estDailyImpressions and re-run to learn whether a Product Page Optimization " +
            "test can reach 90% confidence within 90 days."
          : "Cannot size a test without daily impressions. Paste your Play Console store " +
            "listing visitors (Statistics -> Store performance, last 30 days divided by 30) " +
            "into estDailyImpressions and re-run to size a Store Listing Experiment. " +
            "(App Store Connect is the iOS equivalent.)",
      suggestedFirstTest: null,
      platformPath,
    };
  }

  // Honesty gate: no usable conversion baseline -> same refusal to guess.
  if (cvr === null) {
    return {
      feasible: null,
      daysToSignificance: null,
      assumptions: [
        ...baseAssumptions,
        "[missing-input] No valid baseline conversion-rate range was available " +
          "(needs 0 < low <= high < 1 with a source and year); sample size cannot be computed.",
      ],
      recommendation:
        "Cannot size a test without a baseline conversion rate for this category. " +
        "Provide a sourced category CVR range (or your real conversion rate from " +
        "App Store Connect / Play Console) and re-run.",
      suggestedFirstTest: null,
      platformPath,
    };
  }

  // Zero (or negative) impressions is known data, not missing data: no
  // traffic means no test can ever conclude.
  if (impressions <= 0) {
    return {
      feasible: false,
      daysToSignificance: null,
      assumptions: [
        ...baseAssumptions,
        "[input] estDailyImpressions <= 0: there is no traffic to randomize, so days-to-significance is undefined.",
      ],
      recommendation:
        "Estimated daily impressions are zero, so no A/B test can reach significance. " +
        "Fix discoverability first (rating thresholds, metadata coverage, keyword targeting) " +
        "to build impression volume, then revisit testing.",
      suggestedFirstTest: null,
      platformPath,
    };
  }

  // days.low <- optimistic end (cvr.high needs fewer samples);
  // days.high <- conservative end (cvr.low needs more).
  const totalSamplesOptimistic = samplesPerArm(cvr.high) * ARMS;
  const totalSamplesConservative = samplesPerArm(cvr.low) * ARMS;
  const days = {
    low: Math.ceil(totalSamplesOptimistic / impressions),
    high: Math.ceil(totalSamplesConservative / impressions),
  };

  const feasible = days.high <= PPO_WINDOW_DAYS;
  // "Too low for any test": even the optimistic end of the baseline range
  // cannot conclude inside the window.
  const anyTestViable = days.low <= PPO_WINDOW_DAYS;

  const assumptions = [
    ...baseAssumptions,
    `[input] estDailyImpressions = ${impressions}; days = ceil(samples / impressions) per range end.`,
  ];

  if (!anyTestViable) {
    return {
      feasible: false,
      daysToSignificance: days,
      assumptions,
      recommendation:
        `Estimated impressions (${impressions}/day) cannot reach 90% confidence within ` +
        `${PPO_WINDOW_DAYS} days even at the optimistic end of the baseline range ` +
        `(${days.low}-${days.high} days needed). Do not start an A/B test yet: fix the app's ` +
        "rating standing and metadata coverage first to grow impressions, then re-plan.",
      suggestedFirstTest: null,
      platformPath,
    };
  }

  if (!feasible) {
    return {
      feasible: false,
      daysToSignificance: days,
      assumptions,
      recommendation:
        `Marginal traffic: a 2-arm test needs ${days.low}-${days.high} days to 90% confidence, ` +
        `and the conservative end exceeds the ${PPO_WINDOW_DAYS}-day window. If you test anyway, ` +
        "run a single treatment changing only the first 1-3 screenshots (the #1 conversion " +
        "element in large A/B corpora) and accept that the test may end inconclusive.",
      suggestedFirstTest: "screenshots",
      platformPath,
    };
  }

  return {
    feasible: true,
    daysToSignificance: days,
    assumptions,
    recommendation:
      `Run a 2-arm test (original + 1 treatment) changing only the first 1-3 screenshots ` +
      `(the #1 conversion element in large A/B corpora); expect roughly ${days.low}-${days.high} ` +
      `days to 90% confidence at ${impressions} impressions/day. Test one element at a time; ` +
      "icon is the evidence-backed second test, preview video third.",
    suggestedFirstTest: "screenshots",
    platformPath,
  };
}

// n per arm, ceil'd. p is the baseline conversion rate in (0, 1).
function samplesPerArm(p: number): number {
  const zSum = Z_ALPHA + Z_BETA;
  const raw = (2 * p * (1 - p) * zSum * zSum) / (p * RELATIVE_MDE) ** 2;
  return Math.ceil(raw);
}

function mathAssumptions(
  store: "ios" | "android",
  cvr: BenchmarkRangeLike | null,
): string[] {
  const assumptions = [
    `[statistics] Two-proportion sample size: n per arm = 2*p*(1-p)*(z_alpha+z_beta)^2 / (p*MDE)^2 ` +
      `with z_alpha=${Z_ALPHA} (90% confidence, two-sided), z_beta=${Z_BETA} (80% power), ` +
      `relative MDE=${RELATIVE_MDE * 100}%.`,
    `[planner-choice] Sized as a ${ARMS}-arm test (original + 1 treatment), the highest-power ` +
      "zero-budget configuration; Apple PPO supports up to 3 treatments, but more arms multiply the duration.",
    store === "ios"
      ? `[Apple-documented] Product Page Optimization: up to 3 treatments, ${PPO_WINDOW_DAYS}-day cap, ` +
        "results reported at 90% confidence (developer.apple.com/app-store/product-page-optimization)."
      : `[Google-documented] Play Store Listing Experiments are free with no hard duration cap; the ` +
        `${PPO_WINDOW_DAYS}-day feasibility bound here is a comparability yardstick, not a Play limit. ` +
        "Google recommends at least one week per test (play.google.com/console/about/store-listing-experiments).",
    "[community-tested] Screenshots > icon > video as conversion levers comes from SplitMetrics' " +
      "corpus of thousands of A/B tests (2024), not from Apple or Google documentation.",
    "[honesty] daysToSignificance is an estimate from category-level baselines, not Apple's " +
      "duration estimator; estDailyImpressions and the baseline CVR must describe the same funnel stage.",
  ];
  if (cvr) {
    assumptions.splice(
      2,
      0,
      `[benchmark] Baseline CVR ${formatPct(cvr.low)}-${formatPct(cvr.high)} (${cvr.source}, ${cvr.year}).`,
    );
  }
  return assumptions;
}

function formatPct(fraction: number): string {
  const pct = fraction * 100;
  const rounded = Math.round(pct * 100) / 100;
  return `${rounded}%`;
}

function validBaselineOrNull(
  cvr: BenchmarkRangeLike | null,
): BenchmarkRangeLike | null {
  if (!cvr) return null;
  if (!Number.isFinite(cvr.low) || !Number.isFinite(cvr.high)) return null;
  if (cvr.low <= 0 || cvr.high >= 1 || cvr.low > cvr.high) return null;
  return cvr;
}

function finiteOrNull(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Rating-reset advisor (iOS lever; Android explicitly has no equivalent).
// ---------------------------------------------------------------------------

export interface RatingResetInput {
  // Territory-level numbers from the iTunes lookup (averageUserRating /
  // userRatingCount vs the *ForCurrentVersion fields). null = field absent.
  lifetimeAverage: number | null;
  lifetimeCount: number | null;
  currentVersionAverage: number | null;
  currentVersionCount: number | null;
}

export interface RatingResetAdvice {
  stance: "consider" | "avoid" | "insufficient-data";
  rationale: string;
  mechanics: string;
}

// --- Tunables (cited inline in rationale strings) ---
// 4.0 is the community-observed credibility threshold (AppFollow 2026 ranking
// factors; NP Digital featuring data clusters at 4.0-4.4+). At or above it,
// resetting erases social proof for little displayed-number upside.
const CREDIBILITY_THRESHOLD = 4.0;
// Sniffy engineering thresholds (not store policy): the current-version trend
// must beat lifetime by >= 0.3 stars on >= 50 current-version ratings before
// a reset is worth the risk Apple itself warns about ("use sparingly" — few
// post-reset ratings discourage downloads).
const MATERIAL_DELTA = 0.3;
const MIN_CURRENT_VERSION_COUNT = 50;
// Float-noise guard for the delta comparison (e.g. 4.1 - 3.8 = 0.2999...98).
const EPS = 1e-9;

const RESET_MECHANICS =
  "Apple-documented: App Store Connect lets you reset the summary rating when releasing a " +
  "new version, applied per territory (written reviews persist and Apple advises using it " +
  "sparingly); Android has no equivalent reset - Google Play's displayed rating is " +
  "automatically weighted toward recent ratings (Google-documented).";

export function adviseRatingReset(input: RatingResetInput): RatingResetAdvice {
  const lifetimeAverage = ratingOrNull(input.lifetimeAverage);
  const currentAverage = ratingOrNull(input.currentVersionAverage);
  const lifetimeCount = countOrNull(input.lifetimeCount);
  const currentCount = countOrNull(input.currentVersionCount);

  if (lifetimeAverage === null || currentAverage === null) {
    return {
      stance: "insufficient-data",
      rationale:
        "Lifetime and current-version rating averages are both required to compare the trend; " +
        "at least one was missing or outside the valid 0-5 range. They come free from the " +
        "iTunes lookup (averageUserRating vs averageUserRatingForCurrentVersion) per territory.",
      mechanics: RESET_MECHANICS,
    };
  }

  if (lifetimeAverage >= CREDIBILITY_THRESHOLD) {
    const proof =
      lifetimeCount !== null ? ` of ${lifetimeCount} lifetime ratings` : "";
    return {
      stance: "avoid",
      rationale:
        `Lifetime average ${fmt(lifetimeAverage)} is at or above the ${fmt(CREDIBILITY_THRESHOLD)} ` +
        `credibility threshold (community-tested, AppFollow 2026); a reset would erase the ` +
        `social proof${proof} for little displayed-number upside.`,
      mechanics: RESET_MECHANICS,
    };
  }

  const delta = currentAverage - lifetimeAverage;

  if (delta < 0) {
    return {
      stance: "avoid",
      rationale:
        `Current-version average ${fmt(currentAverage)} is worse than the lifetime average ` +
        `${fmt(lifetimeAverage)}; a reset would replace the displayed rating with the worse number.`,
      mechanics: RESET_MECHANICS,
    };
  }

  if (delta + EPS >= MATERIAL_DELTA) {
    if (currentCount === null || currentCount < MIN_CURRENT_VERSION_COUNT) {
      return {
        stance: "insufficient-data",
        rationale:
          `Current-version rating improved by ${fmt(delta)} stars, but only ` +
          `${currentCount ?? "an unknown number of"} current-version ratings back it ` +
          `(threshold: ${MIN_CURRENT_VERSION_COUNT}, a Sniffy threshold, not store policy). ` +
          "A reset on thin volume risks the low-rating-count penalty Apple warns about; " +
          "gather more current-version ratings first.",
        mechanics: RESET_MECHANICS,
      };
    }
    return {
      stance: "consider",
      rationale:
        `Current-version average ${fmt(currentAverage)} (${currentCount} ratings) beats the ` +
        `lifetime average ${fmt(lifetimeAverage)} by ${fmt(delta)} stars (threshold: ${MATERIAL_DELTA}, ` +
        `a Sniffy threshold), and the lifetime average sits below the ${fmt(CREDIBILITY_THRESHOLD)} ` +
        "credibility threshold (community-tested, AppFollow 2026). Resetting on the next release " +
        "would surface the improved trend; Apple still advises using resets sparingly.",
      mechanics: RESET_MECHANICS,
    };
  }

  return {
    stance: "insufficient-data",
    rationale:
      `Current-version average ${fmt(currentAverage)} is not materially better than the lifetime ` +
      `average ${fmt(lifetimeAverage)} (delta ${fmt(delta)}, threshold ${MATERIAL_DELTA} - a Sniffy ` +
      "threshold, not store policy); the trend is too weak to justify the reset risk.",
    mechanics: RESET_MECHANICS,
  };
}

function ratingOrNull(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (value < 0 || value > 5) return null;
  return value;
}

function countOrNull(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (value < 0) return null;
  return value;
}

// Round to 2 decimals, render with 1-2 decimals ("4.0", "3.65", "0.3").
function fmt(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded.toFixed(2).replace(/0$/, "");
}
