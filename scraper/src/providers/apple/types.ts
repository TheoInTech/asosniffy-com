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
  provenance: Provenance;
}

// Error envelope shared across Apple endpoints. Providers NEVER throw on
// upstream failures (rate-limit, not found) — they return an error envelope
// and let the orchestrator decide whether to fall back to cache or fixture.
export type AppleProviderError =
  | { error: "rate_limited" }
  | { error: "not_found" }
  | { error: "network_error" };
