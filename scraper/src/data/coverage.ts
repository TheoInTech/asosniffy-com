import type {
  Confidence,
  Coverage,
  CoverageProviderError,
  CoverageStatus,
  Provenance,
} from "../schemas/index.js";

// Map a provenance label to the user-facing confidence label.
// live / cached → high   (fresh provider data, possibly memoized)
// inferred      → medium (AI-synthesized from real evidence)
// degraded      → low    (provider failed; row intentionally empty)
// fixture       → low    (demo fallback — UI should call this out)
export function deriveCoverageFromProvenance(prov: Provenance): Confidence {
  switch (prov) {
    case "live":
    case "cached":
      return "high";
    case "inferred":
      return "medium";
    case "degraded":
    case "fixture":
      return "low";
  }
}

export interface CoverageInput {
  appMetadata: Provenance;
  keywordRank: Provenance;
  // Quote-time callers don't have competitor data yet — orchestrator-time
  // callers supply both.
  competitors?: Provenance;
  // Optional surface for provider errors that occurred during the request.
  // The /sample endpoint always passes an empty array. /diagnose and /quote
  // pass classified errors so the UI can render "Apple rate-limited us;
  // retry in 60s" instead of "this is sample data."
  providerErrors?: readonly CoverageProviderError[];
}

export function buildCoverage(input: CoverageInput): Coverage {
  const provs: Provenance[] = [input.appMetadata, input.keywordRank];
  if (input.competitors !== undefined) provs.push(input.competitors);
  return {
    appMetadata: deriveCoverageFromProvenance(input.appMetadata),
    keywordRank: deriveCoverageFromProvenance(input.keywordRank),
    competitorTrail:
      input.competitors !== undefined
        ? deriveCoverageFromProvenance(input.competitors)
        : "medium",
    // No review source in MVP — see PLAN.md §11. Always "low".
    reviews: "low",
    status: deriveCoverageStatus(provs),
    providerErrors: input.providerErrors ? [...input.providerErrors] : [],
  };
}

// Worst-case provenance reducer. If any input is "fixture" the whole label
// degrades to fixture, etc. Used when summarizing N keyword-rank calls into
// a single dataProvenance.keywordRank label.
//
// Order from worst to best: fixture > degraded > inferred > cached > live.
// "fixture" is worst because it's intentionally fake; "degraded" comes next
// because it's honestly empty; "inferred" is AI over evidence; "cached" and
// "live" are real provider data.
export function worstProvenance(provs: readonly Provenance[]): Provenance {
  if (provs.length === 0) return "degraded";
  if (provs.includes("fixture")) return "fixture";
  if (provs.includes("degraded")) return "degraded";
  if (provs.includes("inferred")) return "inferred";
  if (provs.includes("cached")) return "cached";
  return "live";
}

// Compute top-level coverage.status from the per-field provenance set.
//   all live/cached      → ok
//   some live/cached + some degraded → partial
//   all degraded         → degraded
//   any fixture          → fixture_only (only allowed in /sample)
export function deriveCoverageStatus(
  provs: readonly Provenance[],
): CoverageStatus {
  if (provs.length === 0) return "degraded";
  if (provs.some((p) => p === "fixture")) return "fixture_only";

  const realCount = provs.filter((p) => p === "live" || p === "cached").length;
  const degradedCount = provs.filter((p) => p === "degraded").length;

  if (degradedCount === provs.length) return "degraded";
  if (degradedCount > 0 && realCount > 0) return "partial";
  // All inferred or all real — treat as ok (inferred is post-synthesis, after
  // we've already verified the inputs are non-fixture).
  return "ok";
}
