import type { RankBucket } from "../schemas/index.js";
import type { RankSample } from "../cache/timeseries.js";

// Rank-regression detector. A regression is a keyword whose current rank
// dropped by ≥10 positions vs its 7-day rolling median.
//
// Floors (intentional, prevent false positives):
//   - Require ≥ 3 samples in the 7-day window. A single noisy datapoint
//     shouldn't trigger an alert.
//   - Skip keywords where the current sample is `not_found` (position 0)
//     OR the median is computed over any not_found point (would skew low).
//   - Only surface regressions, never improvements (that's a separate
//     `improvements[]` candidate for a future phase).

const POSITION_DROP_THRESHOLD = 10;
const MIN_SAMPLES_FOR_REGRESSION = 3;
const WINDOW_DAYS = 7;

export interface RegressionItem {
  keyword: string;
  previousBucket: RankBucket;
  currentBucket: RankBucket;
  deltaPositions: number;
  samplesCount: number;
}

export interface DetectRegressionsInput {
  seriesByKeyword: ReadonlyMap<string, readonly RankSample[]>;
}

export function detectRegressions(
  input: DetectRegressionsInput,
): RegressionItem[] {
  const out: RegressionItem[] = [];

  for (const [keyword, series] of input.seriesByKeyword.entries()) {
    if (series.length < MIN_SAMPLES_FOR_REGRESSION) continue;
    const currentSample = series[series.length - 1]!;
    if (currentSample.position <= 0) continue;

    // 7-day window (samples up to and INCLUDING current, minus current).
    const window = series.slice(-WINDOW_DAYS, -1);
    if (window.length < MIN_SAMPLES_FOR_REGRESSION - 1) continue;

    const positions = window
      .map((s) => s.position)
      .filter((p) => p > 0);
    if (positions.length < MIN_SAMPLES_FOR_REGRESSION - 1) continue;

    const median = computeMedian(positions);
    const deltaPositions = currentSample.position - median;
    if (deltaPositions < POSITION_DROP_THRESHOLD) continue;

    const previousBucket = window[window.length - 1]!.bucket;
    out.push({
      keyword,
      previousBucket,
      currentBucket: currentSample.bucket,
      deltaPositions,
      samplesCount: series.length,
    });
  }

  // Sort by severity (largest position drop first) so the UI surfaces the
  // worst regression at the top.
  out.sort((a, b) => b.deltaPositions - a.deltaPositions);
  return out;
}

function computeMedian(numbers: readonly number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return sorted[mid]!;
}
