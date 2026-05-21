// Per-app momentum signal — ratings-per-day derived from iTunes lookup.
//
// Inspired by the rating-velocity weight in the difficulty formula ported
// in keyword-difficulty.ts. The momentum block exposes the same number at
// the target-app level so founders see "your app gathers 12 ratings/day
// (growing)" as a first-class diagnostic alongside per-keyword difficulty.

export type MomentumLabel = "growing" | "steady" | "declining";

export interface ComputeMomentumInput {
  userRatingCount: number;
  releaseDate?: string;
  currentVersionReleaseDate?: string;
  // Injected for deterministic tests. Defaults to Date.now() at call time.
  now?: number;
}

export interface MomentumSignal {
  ratingsPerDay: number | null;
  momentumLabel: MomentumLabel | null;
  daysSinceFirstRelease: number | null;
  daysSinceLastRelease: number | null;
}

export function computeMomentum(input: ComputeMomentumInput): MomentumSignal {
  // Region-locked apps occasionally come back from iTunes without a
  // releaseDate. Return all-null rather than fake a 0 — the schema layer
  // surfaces this honestly via provenance/confidence.
  if (!input.releaseDate) {
    return {
      ratingsPerDay: null,
      momentumLabel: null,
      daysSinceFirstRelease: null,
      daysSinceLastRelease: null,
    };
  }

  const now = input.now ?? Date.now();
  const firstReleaseMs = Date.parse(input.releaseDate);
  if (!Number.isFinite(firstReleaseMs)) {
    return {
      ratingsPerDay: null,
      momentumLabel: null,
      daysSinceFirstRelease: null,
      daysSinceLastRelease: null,
    };
  }

  // Clamp to 1 to avoid div-by-zero on brand-new apps. Their formula doesn't
  // guard for this; we do.
  const daysSinceFirstRelease = Math.max(
    1,
    Math.floor((now - firstReleaseMs) / DAY_MS),
  );

  let daysSinceLastRelease: number | null = null;
  if (input.currentVersionReleaseDate) {
    const lastMs = Date.parse(input.currentVersionReleaseDate);
    if (Number.isFinite(lastMs)) {
      daysSinceLastRelease = Math.max(0, Math.floor((now - lastMs) / DAY_MS));
    }
  }

  const ratingCount = Math.max(0, input.userRatingCount ?? 0);
  const ratingsPerDay = ratingCount / daysSinceFirstRelease;

  // Bucketing: <0.05 rpd → declining, 0.05..2 → steady, >2 → growing.
  // The thresholds aren't sacred; they're picked so that a typical
  // long-tail app (a few hundred ratings over a few years) lands "steady"
  // and a mid-tier app (a few thousand ratings per year) lands "growing".
  let label: MomentumLabel;
  if (ratingsPerDay > 2) {
    label = "growing";
  } else if (ratingsPerDay >= 0.05) {
    label = "steady";
  } else {
    label = "declining";
  }

  return {
    ratingsPerDay: round(ratingsPerDay, 2),
    momentumLabel: label,
    daysSinceFirstRelease,
    daysSinceLastRelease,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
