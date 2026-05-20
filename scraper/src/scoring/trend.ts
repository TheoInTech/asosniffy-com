import type { RankBucket } from "../schemas/index.js";
import type { RankSample } from "../cache/timeseries.js";

// Per-keyword trend signal computed from a series of daily rank snapshots.
// `null` represents an honest cold-start: we never claim a trend from a
// single point.
//
// Sign convention for deltaPositions:
//   positive  → rank got WORSE (position number increased)
//   negative  → rank IMPROVED  (position number decreased)
//   null      → not enough samples (or current sample is not_found)
//
// We pick the comparison window by length:
//   ≥ 7 samples → 7d window
//   else        → 30d window (broader so we don't quietly degrade to null)

export type TrendWindow = "7d" | "30d";

export interface Trend {
  window: TrendWindow;
  deltaPositions: number | null;
  previousBucket: RankBucket | null;
  samplesCount: number;
}

export interface ComputeTrendInput {
  // Series ordered ascending by day. The newest entry is treated as the
  // "current" sample; older entries are the baseline.
  series: readonly RankSample[];
}

export function computeTrend(input: ComputeTrendInput): Trend | null {
  const series = input.series;
  if (series.length < 2) return null;

  // Pick the comparison window. ≥ 7 samples → 7d (a meaningful baseline).
  const window: TrendWindow = series.length >= 7 ? "7d" : "30d";
  const baseline = series[0]!;
  const current = series[series.length - 1]!;

  // `position` is 1-indexed; 0 represents not_found. We can't compute a
  // meaningful delta when either endpoint is not_found — but the trend
  // shape still surfaces samplesCount + previousBucket so the UI can show
  // "was in 11-30, now not_found" qualitatively.
  const deltaPositions =
    baseline.position > 0 && current.position > 0
      ? current.position - baseline.position
      : null;

  return {
    window,
    deltaPositions,
    previousBucket: baseline.bucket,
    samplesCount: series.length,
  };
}
