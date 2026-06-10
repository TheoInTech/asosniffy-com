// Estimated conversion index — the deterministic core of conversionAudit
// (discoverability roadmap 1.2).
//
// Converts the two public rating fields every store listing exposes
// (averageUserRating, userRatingCount) plus the iTunes primaryGenreName into
// an estimated page-view-to-install conversion range:
//
//   estimatedConversionIndex = ratingMultiplier x categoryCvrBaseline
//
// where the multiplier comes from linear interpolation over the NP Digital
// 49-company star-rating curve and the baseline from the AppTweak-H1-2024
// per-category CVR table — both in data/conversion-benchmarks.ts with full
// source + year attribution (see that file's header for URLs).
//
// Honesty gates (the null-on-insufficient-data pattern from momentum.ts):
//   • rating missing/zero → multiplier, band, note, index are all null.
//   • category unmapped (or store android) → baseline and index are null;
//     we never substitute the cross-category default.
//   • flat near-5.0 rating on thin volume → `thinVolume` flag + the
//     multiplier range widened down to the curve value at 3.0, because
//     PowerReviews (e-commerce) found flat 5.0 converts like 3.0-3.49.
//     The two studies disagree, so the range ships the disagreement
//     (roadmap [CONFLICT] convention) instead of picking a winner.
//   • android → the curve is iOS-derived; we apply it as an approximation
//     with the range widened by ANDROID_MULTIPLIER_WIDENING and say so in
//     both the source string and the band note. Category baselines are
//     iOS-only in the corpus, so android never gets a baseline or index.
//
// What this module deliberately does NOT claim:
//   • This is an inferred index from third-party correlational research,
//     not a measured CVR — downstream report fields must carry `inferred`
//     provenance, and every range names its source + year.
//   • The 3.5/4.0/4.5 band thresholds are vendor analyses (AppFollow 2026,
//     NP Digital, Adapty), NOT Apple- or Google-documented policy; every
//     band note ends with that disclaimer.
//   • No download or revenue estimates, no causal claims — a rating band is
//     a correlate of conversion, not a promise.
//
// Pure and deterministic: no I/O, no clock, no LLM. Inputs are
// already-fetched lookup fields passed as parameters.

import {
  type BenchmarkRange,
  CATEGORY_CVR_BASELINES,
  RATING_BANDS,
  RATING_CVR_MULTIPLIER_CURVE,
  THIN_VOLUME,
} from "../data/conversion-benchmarks.js";

export interface ConversionIndexInput {
  averageUserRating: number | null;
  userRatingCount: number | null;
  // iTunes `primaryGenreName`, passed verbatim (exact-match lookup).
  primaryCategory: string | null;
  store: "ios" | "android";
}

export type RatingBand =
  | "below-suppression"
  | "below-credibility"
  | "credible"
  | "top-cluster";

export interface ConversionIndexResult {
  ratingMultiplier: BenchmarkRange | null;
  ratingBand: RatingBand | null;
  bandNote: string | null;
  categoryCvrBaseline: BenchmarkRange | null;
  // Estimated page-view-to-install percent range (multiplier x baseline).
  estimatedConversionIndex: BenchmarkRange | null;
  thinVolume: boolean;
}

// ASSUMPTION (documented, ours): the NP Digital curve is iOS-derived. On
// android we widen the multiplier range by +/-15% — the largest documented
// cross-source relative spread in the research corpus (the AppTweak
// 2020-vs-2024 average-CVR conflict) adopted as a floor for cross-platform
// extrapolation uncertainty. It is not a measured Android error bar.
export const ANDROID_MULTIPLIER_WIDENING = 0.15;

const NOT_STORE_DOCUMENTED =
  "Community-tested claim, not store-documented policy.";

export function computeConversionIndex(
  input: ConversionIndexInput,
): ConversionIndexResult {
  const rating = sanitizeRating(input.averageUserRating);
  const ratingCount = sanitizeCount(input.userRatingCount);
  const baseline = resolveBaseline(input.primaryCategory, input.store);

  // Honesty gate: no rating (or iTunes' 0-means-unrated) → no rating-side
  // output. The baseline is still reported when resolvable — it depends
  // only on category + store.
  if (rating === null) {
    return {
      ratingMultiplier: null,
      ratingBand: null,
      bandNote: null,
      categoryCvrBaseline: baseline,
      estimatedConversionIndex: null,
      thinVolume: false,
    };
  }

  const band = ratingBandFor(rating);
  const naiveMultiplier = interpolateRatingMultiplier(rating);

  // Thin-volume caveat (PowerReviews, e-commerce): flat near-5.0 on a thin
  // rating count. Requires a known count — when the count is unknown we
  // skip the check (flag stays false) and say so in the note.
  const countUnknown = ratingCount === null;
  const thinVolume =
    !countUnknown &&
    rating >= THIN_VOLUME.ratingFloor &&
    ratingCount < THIN_VOLUME.countCeiling;

  let low = naiveMultiplier;
  let high = naiveMultiplier;
  let source: string = RATING_CVR_MULTIPLIER_CURVE.source;
  let year: number = RATING_CVR_MULTIPLIER_CURVE.year;

  if (thinVolume) {
    // NP Digital says ~1.00; PowerReviews says "converts like 3.0-3.49"
    // (curve floor at 3.0). The sources disagree → ship the spread.
    low = interpolateRatingMultiplier(THIN_VOLUME.convertsLikeRating.low);
    source = `${source}; ${THIN_VOLUME.source}`;
    year = Math.max(year, THIN_VOLUME.year);
  }

  if (input.store === "android") {
    low = low * (1 - ANDROID_MULTIPLIER_WIDENING);
    high = Math.min(1, high * (1 + ANDROID_MULTIPLIER_WIDENING));
    source = `${source} (iOS-derived curve applied to Android as an approximation, widened +/-15%)`;
  }

  const ratingMultiplier: BenchmarkRange = {
    low: round4(Math.max(0, low)),
    high: round4(Math.min(1, Math.max(low, high))),
    source,
    year,
  };

  const bandNote = buildBandNote({
    rating,
    ratingCount,
    band,
    thinVolume,
    countUnknown,
    store: input.store,
  });

  const estimatedConversionIndex =
    baseline === null
      ? null
      : {
          low: round1(ratingMultiplier.low * baseline.low),
          high: round1(ratingMultiplier.high * baseline.high),
          source: `Rating multiplier (${ratingMultiplier.source}) x category baseline (${baseline.source})`,
          year: Math.max(ratingMultiplier.year, baseline.year),
        };

  return {
    ratingMultiplier,
    ratingBand: band,
    bandNote,
    categoryCvrBaseline: baseline,
    estimatedConversionIndex,
    thinVolume,
  };
}

// Linear interpolation over the NP Digital anchor points. Exported for the
// experiment-planner and creative-gap modules that need the raw curve.
// Rating is clamped to the curve's [1.0, 5.0] domain.
export function interpolateRatingMultiplier(rating: number): number {
  const anchors = RATING_CVR_MULTIPLIER_CURVE.anchors;
  let lo = anchors[0];
  if (lo === undefined) return 0; // unreachable: the corpus is non-empty
  if (rating <= lo.rating) return lo.multiplier;
  for (const hi of anchors) {
    if (rating <= hi.rating) {
      const t = (rating - lo.rating) / (hi.rating - lo.rating);
      return lo.multiplier + t * (hi.multiplier - lo.multiplier);
    }
    lo = hi;
  }
  // rating above the last anchor (already clamped upstream): saturate.
  return lo.multiplier;
}

function ratingBandFor(rating: number): RatingBand {
  if (rating < RATING_BANDS.suppression.value) return "below-suppression";
  if (rating < RATING_BANDS.credibilityFloor.value) return "below-credibility";
  if (rating < RATING_BANDS.topCluster.value) return "credible";
  return "top-cluster";
}

function buildBandNote(params: {
  rating: number;
  ratingCount: number | null;
  band: RatingBand;
  thinVolume: boolean;
  countUnknown: boolean;
  store: "ios" | "android";
}): string {
  const r = formatRating(params.rating);
  const { suppression, credibilityFloor, topCluster } = RATING_BANDS;

  let note: string;
  switch (params.band) {
    case "below-suppression":
      note = `Rating ${r} is below the ${suppression.value} threshold at which vendor analyses report measurably suppressed search visibility (${suppression.source}, ${suppression.year}). ${NOT_STORE_DOCUMENTED}`;
      break;
    case "below-credibility":
      note = `Rating ${r} clears the ${suppression.value} suppression threshold but sits below the ${credibilityFloor.value} credibility-and-featuring floor (${credibilityFloor.source}). ${NOT_STORE_DOCUMENTED}`;
      break;
    case "credible":
      note = `Rating ${r} clears the ${credibilityFloor.value} credibility-and-featuring floor but is below the ${topCluster.value} band where top-3 positions for competitive keywords cluster (${topCluster.source}, ${topCluster.year}). ${NOT_STORE_DOCUMENTED}`;
      break;
    case "top-cluster":
      note = `Rating ${r} is inside the ${topCluster.value}+ band where vendor analyses report top-3 positions for competitive keywords cluster (${topCluster.source}, ${topCluster.year}). ${NOT_STORE_DOCUMENTED}`;
      break;
  }

  if (params.thinVolume) {
    note += ` Caveat: a flat ${r} average on only ${params.ratingCount} ratings — ${THIN_VOLUME.source} found flat 5.0 products convert like 3.0-3.49 products, so the multiplier range is widened down to the 3.0 curve value. This is e-commerce evidence, not app-store-measured.`;
  } else if (params.countUnknown && params.rating >= THIN_VOLUME.ratingFloor) {
    note += " Rating count unavailable - thin-volume check skipped.";
  }

  if (params.store === "android") {
    note += ` The rating-multiplier curve is iOS-derived (${RATING_CVR_MULTIPLIER_CURVE.source}); it is applied to Android as an approximation with the range widened +/-15%. Category CVR baselines in the corpus are iOS-only, so no baseline or estimated index is reported for Android.`;
  }

  return note;
}

function resolveBaseline(
  primaryCategory: string | null,
  store: "ios" | "android",
): BenchmarkRange | null {
  // The baseline table is iOS page-view-to-install data keyed by iTunes
  // primaryGenreName. Platform direction flips per category (see the data
  // module header), so android never gets a baseline — and therefore never
  // gets an estimated index. Unmapped categories return null; we do NOT
  // substitute DEFAULT_CVR_BASELINE (that constant is for report copy).
  if (store !== "ios") return null;
  if (primaryCategory === null) return null;
  const baseline = CATEGORY_CVR_BASELINES[primaryCategory.trim()];
  return baseline ?? null;
}

function sanitizeRating(rating: number | null): number | null {
  if (rating === null || !Number.isFinite(rating) || rating <= 0) return null;
  // Stores display 1.0..5.0; clamp defensively for out-of-range producers.
  return Math.min(5, Math.max(1, rating));
}

function sanitizeCount(count: number | null): number | null {
  if (count === null || !Number.isFinite(count) || count < 0) return null;
  return Math.floor(count);
}

function formatRating(rating: number): string {
  return rating.toFixed(2);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
