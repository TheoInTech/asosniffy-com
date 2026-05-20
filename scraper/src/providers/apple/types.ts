import type { Provenance } from "../../schemas/index.js";

// Normalized App Store record. Subset of the iTunes Search API result —
// only the fields we actually consume downstream (quote/diagnose).
export interface AppRecord {
  id: string;
  name: string;
  developer: string;
  primaryCategory: string;
  subtitle?: string;
  description: string;
  ratingsSummary: {
    average: number;
    count: number;
  };
  screenshots: string[];
  currentVersion: string;
  iconUrl?: string;
  bundleId?: string;
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
