import type { Provenance } from "../../schemas/index.js";

// Normalized App Store record. Subset of the iTunes Search API result —
// only the fields we actually consume downstream (quote/diagnose).
//
// `subtitle` is populated by the storefront-page provider (the iTunes Search
// API never returns it). `subtitleProvenance` records the storefront fetch's
// outcome:
//   live | cached → fetched/served successfully (subtitle may still be empty
//                   if the app genuinely has no subtitle)
//   degraded     → storefront fetch failed; subtitle is intentionally absent
//   undefined    → storefront fetch was not attempted (legacy path / fixture)
// Scoring uses this to swap the "subtitle is empty" advisory for "subtitle
// source unavailable" when we can't honestly claim the field is empty.
export interface AppRecord {
  id: string;
  name: string;
  developer: string;
  primaryCategory: string;
  subtitle?: string;
  subtitleProvenance?: Provenance;
  description: string;
  ratingsSummary: {
    average: number;
    count: number;
  };
  screenshots: string[];
  currentVersion: string;
  iconUrl?: string;
  bundleId?: string;
  // iTunes returns ISO date strings for both fields when the app has been
  // released in the queried country. Region-locked apps occasionally come
  // back without one or both. Consumers (scoring/keyword-difficulty,
  // scoring/momentum) treat missing dates as honest unknowns.
  releaseDate?: string;
  currentVersionReleaseDate?: string;
  // Phase B — iTunes Search API fields previously ignored. All optional
  // for back-compat with existing fixtures and the legacy mappers.
  //
  //   sellerUrl       — the developer's marketing/landing site. Feeds the
  //                     product-context provider (scrapes homepage + 3-5
  //                     priority pages to mine product tokens).
  //   artistViewUrl   — the developer's App Store page (more-apps-by-this-
  //                     developer). Useful for portfolio-style competitor
  //                     signal in future phases.
  //   releaseNotes    — "What's new in this version" copy. Carries fresh
  //                     feature-launch language that the description may
  //                     not yet reflect; Phase C will mine this for
  //                     recently-added-feature tokens.
  //   genres          — array of genre names (primary + secondary). Apple
  //                     uses these for category-relevance assertions
  //                     (multi-genre apps are common: "Sports, Health &
  //                     Fitness"). primaryCategory == genres[0] in
  //                     practice but exposing the full array unlocks
  //                     adjacent-category targeting.
  sellerUrl?: string;
  artistViewUrl?: string;
  releaseNotes?: string;
  genres?: string[];
  provenance: Provenance;
}

// Error envelope shared across Apple endpoints. Providers NEVER throw on
// upstream failures (rate-limit, not found) — they return an error envelope
// and let the orchestrator decide whether to surface as degraded or cache
// the negative result.
//
// The legacy three-variant shape is kept for back-compat with existing
// tests; richer typed errors flow through `providers/_lib/errors.ts` for
// downstream consumers that need retry-after, http-status, etc.
export type AppleProviderError =
  | { error: "rate_limited" }
  | { error: "not_found" }
  | { error: "network_error" };
