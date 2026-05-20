import type { QuoteResponse } from "@sniffy/scraper/schemas";

export type NoScentReason =
  | "app-not-found"
  | "all-keywords-missing"
  | "country-unsupported"
  | "all-fixture"
  | "coverage-degraded";

export interface NoScentInputs {
  quote: QuoteResponse;
  knownCountries?: readonly string[];
}

export function shouldShowNoScent({
  quote,
  knownCountries,
}: NoScentInputs): NoScentReason | null {
  if (
    quote.detectedApp.id.length === 0 ||
    quote.detectedApp.name.trim() === "" ||
    quote.detectedApp.name.toLowerCase() === "unknown"
  ) {
    return "app-not-found";
  }

  if (
    knownCountries &&
    knownCountries.length > 0 &&
    !knownCountries.includes(quote.country)
  ) {
    return "country-unsupported";
  }

  // Phase 1 — coverage.status === "degraded" means every live provider
  // returned a classified error (rate-limited / network / schema-drift).
  // Surface this BEFORE the all-keywords-missing branch so users see the
  // actual provider error reason instead of the generic "trail cold" copy.
  if (quote.coverage.status === "degraded") {
    return "coverage-degraded";
  }

  const preview = quote.shallowScan.previewKeyword;
  // The shallowScan only carries one preview; we treat "not_found" + inferred
  // provenance as evidence that we couldn't find a trail at all.
  if (preview.rankBucket === "not_found") {
    return "all-keywords-missing";
  }

  const allFixture =
    quote.shallowScan.previewKeyword.provenance === "fixture" &&
    quote.coverage.keywordRank === "low";
  if (allFixture) {
    return "all-fixture";
  }

  return null;
}
