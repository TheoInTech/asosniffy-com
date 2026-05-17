// Cache invalidation knobs.
//
// Bumping a constant here orphans every cache key that embeds it — use that
// instead of writing manual delete-by-prefix scripts when the underlying
// data shape changes.
//
//   PROVIDER_VERSION — bump when a provider's normalized response shape changes
//                      (e.g., AppRecord gets a new required field).
//   REPORT_VERSION   — bump when the scoring / synthesis logic changes in a
//                      way that should invalidate previously-cached reports.

export const PROVIDER_VERSION = "p1";
export const REPORT_VERSION = "r1";
