import type {
  Confidence,
  Coverage,
  Provenance,
} from "../schemas/index.js";

// Map a provenance label to the user-facing confidence label.
// live / cached → high   (fresh provider data, possibly memoized)
// inferred      → medium (AI-synthesized from real evidence)
// fixture       → low    (demo fallback — UI should call this out)
export function deriveCoverageFromProvenance(prov: Provenance): Confidence {
  switch (prov) {
    case "live":
    case "cached":
      return "high";
    case "inferred":
      return "medium";
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
}

export function buildCoverage(input: CoverageInput): Coverage {
  return {
    appMetadata: deriveCoverageFromProvenance(input.appMetadata),
    keywordRank: deriveCoverageFromProvenance(input.keywordRank),
    competitorTrail: input.competitors
      ? deriveCoverageFromProvenance(input.competitors)
      : "medium",
    // No review source in MVP — see PLAN.md §11. Always "low".
    reviews: "low",
  };
}

// Worst-case provenance reducer. If any input is "fixture" the whole label
// degrades to fixture, etc. Used when summarizing N keyword-rank calls into
// a single dataProvenance.keywordRank label.
export function worstProvenance(provs: readonly Provenance[]): Provenance {
  if (provs.length === 0) return "fixture";
  if (provs.includes("fixture")) return "fixture";
  if (provs.includes("inferred")) return "inferred";
  if (provs.includes("cached")) return "cached";
  return "live";
}
