import type { Confidence, Provenance, RankBucket } from "../schemas/index.js";

// Single source of truth for confidence math.
//
// Phase 1 of the robustness plan moved this out of `providers/apple/keyword-rank.ts`
// so identity confidence (how sure we are we have the right app) can propagate
// into keyword confidence — previously keyword rank could be labeled `medium`
// even when the underlying app match was a coin-flip.
//
// All confidence labels derive from a small set of signals:
//   • providerStatus: did the upstream call succeed, degrade, or fallback?
//   • depthSearched / returnedCount: did we see the full page we asked for?
//   • identityConfidence: how sure are we about the target app?
//   • rankBucket (optional): "not_found" at low depth implies low signal
//
// Rule of thumb: never claim `high` confidence for any signal derived from
// iTunes search positions — Apple does not expose the ranking algorithm, so
// our best honest claim is `medium`. `high` is reserved for direct lookups
// (iTunes /lookup by ID) and future ASA popularity scores.

export type ProviderStatus = "ok" | "degraded" | "fixture";

export interface KeywordConfidenceInputs {
  providerStatus: ProviderStatus;
  depthSearched: number;
  returnedCount: number;
  identityConfidence: Confidence;
  rankBucket?: RankBucket;
}

export function deriveKeywordConfidence(
  input: KeywordConfidenceInputs,
): Confidence {
  // Floor 1: provider failure or fixture → low.
  if (input.providerStatus !== "ok") return "low";

  // Floor 2: identity confidence sets a ceiling — if we picked the wrong app,
  // every downstream signal is suspect.
  if (input.identityConfidence === "low") return "low";

  // Floor 3: truncated result page weakens depth signal.
  const fullPage = input.returnedCount >= input.depthSearched;
  if (!fullPage) return "low";

  // Floor 4: "not_found" at shallow depth could still mean rank > depth, not
  // honestly absent. Surface as low until we paginate deeper (Phase 2).
  if (input.rankBucket === "not_found" && input.depthSearched < 200) {
    return "low";
  }

  // Otherwise: cap at medium. iTunes search positions are not an authoritative
  // ranking source (PLAN.md §11). We do NOT claim `high` here even with a
  // full page and good identity — that would overclaim against an unobservable
  // ground truth.
  if (input.identityConfidence === "high") return "medium";
  return input.identityConfidence;
}

// Map provider status → top-level provenance suggestion. Caller still has
// to merge with cache hit/miss to pick `live` vs `cached`; this only handles
// the live-vs-degraded-vs-fixture branch.
export function provenanceForProviderStatus(
  status: ProviderStatus,
): Provenance {
  switch (status) {
    case "ok":
      return "live";
    case "degraded":
      return "degraded";
    case "fixture":
      return "fixture";
  }
}

// Identity confidence derives from the disambiguation similarity score.
// 0.85+   high   (exact or near-exact match)
// 0.60-   medium (close enough; user can confirm via candidates[])
// <0.60   low    (ambiguous; surface candidates, low-confidence the report)
export function identityConfidenceFromScore(similarityScore: number): Confidence {
  if (similarityScore >= 0.85) return "high";
  if (similarityScore >= 0.6) return "medium";
  return "low";
}

// Bucket-of-position lookup. Lives here so the SSOT for confidence/bucket
// logic is one module — keyword-rank provider imports this rather than
// owning a private copy.
export function bucketOfPosition(position: number): RankBucket {
  if (position <= 0) return "not_found";
  if (position <= 10) return "1-10";
  if (position <= 30) return "11-30";
  if (position <= 50) return "31-50";
  if (position <= 100) return "51-100";
  return "100+";
}
