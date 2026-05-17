import type { Confidence, Provenance } from "../../schemas/index.js";

// Android preview record. Distinct from the Apple AppRecord because the
// Play Store data we can get without paid providers is structurally weaker
// (no reliable subtitle, screenshots, or current-version field). MVP keeps
// this minimal — see PLAN.md §11 (Android preview-quality only).
export interface AndroidAppPreview {
  packageName: string;
  name: string;
  developer: string;
  primaryCategory: string;
  ratingsSummary: {
    average: number;
    count: number;
  };
  confidence: Confidence;
  provenance: Provenance;
}

export type AndroidProviderError =
  | { error: "blocked" }
  | { error: "not_found" }
  | { error: "network_error" };
