import type { Confidence, Provenance } from "../../schemas/index.js";

// Normalized Google Play record. Distinct from the Apple AppRecord because
// the Play Store data we can get without paid providers is structurally
// weaker (no reliable subtitle/keywords-field equivalent, no current-version
// in the same shape). Phase 2 promotes this from fixture-only to real data
// via google-play-scraper, with confidence capped at "medium".
//
// The `provenance: "live"` claim is bounded by:
//   • google-play-scraper is unmaintained (per its README); a Play Store
//     HTML layout change breaks the parser. Phase 4 schema-drift detection
//     surfaces breakage before users feel it.
//   • Play Store ToS is ambiguous for automated access. The throttle +
//     low rate budget + identifying UA puts us in the same posture as
//     industry-standard ASO tools.
export interface AndroidAppRecord {
  packageName: string;
  name: string;
  developer: string;
  primaryCategory: string;
  description: string;
  ratingsSummary: {
    average: number;
    count: number;
  };
  iconUrl?: string;
  screenshots: string[];
  installsText?: string;
  free: boolean;
  scoreText?: string;
  url?: string;
  // Capped at "medium" because we're scraping public pages rather than
  // querying an official API. See providers/android/play-store.ts.
  confidence: Confidence;
  provenance: Provenance;
}

// Lightweight preview shape kept for back-compat with the Phase-0 path —
// detect.ts still uses this in the disabled/fixture branch. Real provider
// returns AndroidAppRecord (which is a superset).
export interface AndroidAppPreview {
  packageName: string;
  name: string;
  developer: string;
  primaryCategory: string;
  ratingsSummary: {
    average: number;
    count: number;
  };
  iconUrl?: string;
  confidence: Confidence;
  provenance: Provenance;
}

export type AndroidProviderError =
  | { error: "blocked" }
  | { error: "not_found" }
  | { error: "rate_limited" }
  | { error: "network_error" };
