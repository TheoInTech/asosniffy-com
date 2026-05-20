import type { Confidence, Provenance } from "../../schemas/index.js";
import type { RankBucket } from "../../schemas/index.js";
import {
  bucketOfPosition,
  deriveKeywordConfidence,
  type ProviderStatus,
} from "../../scoring/confidence.js";
import { searchApps } from "./itunes.js";

export interface SampleKeywordRankInput {
  keyword: string;
  country: string;
  appId: string;
  depth?: number;
  // Identity confidence from the upstream detect step. Keyword confidence
  // is capped by how sure we are about the target app — picking the wrong
  // app means every rank claim is suspect. Default "medium" preserves
  // Phase-0 behavior for callers that don't pass it.
  identityConfidence?: Confidence;
  // Optional refinement signal used by the Phase-2 depth-trim: when the
  // primary search doesn't find the app within `depth`, we retry with
  // `{keyword} {refinement}` (e.g. category name) to bound the rank at
  // "100+" honestly rather than emitting "not_found".
  refinement?: string;
}

export interface KeywordRankResult {
  keyword: string;
  rankBucket: RankBucket;
  confidence: Confidence;
  provenance: Provenance;
  searchedDepth: number;
}

export type KeywordRankOutcome =
  | KeywordRankResult
  | { error: "rate_limited" }
  | { error: "network_error" };

// Sample a keyword's rank for a given app by searching the App Store and
// finding the app's position in the results. iTunes Search API caps results
// at 200 per query and does not paginate. Phase 2 adds a "long-tail trim"
// follow-up search when the app is `not_found` at depth 200 so we can
// honestly emit `rankBucket: "100+"` (with `confidence: "low"`) instead of
// the misleading `not_found` for apps that exist deeper in the result tail.
export async function sampleKeywordRank(
  input: SampleKeywordRankInput,
): Promise<KeywordRankOutcome> {
  const requestedDepth = input.depth ?? 50;
  const depth = clamp(requestedDepth, 1, 200);

  const primary = await searchApps({
    term: input.keyword,
    country: input.country,
    limit: depth,
  });

  if ("error" in primary) {
    if (primary.error === "not_found") {
      return buildResult({
        keyword: input.keyword,
        position: -1,
        depth,
        returnedCount: 0,
        identityConfidence: input.identityConfidence ?? "medium",
      });
    }
    return { error: primary.error };
  }

  const position = primary.findIndex((r) => r.id === input.appId) + 1; // 1-indexed; 0 → not found
  if (position > 0) {
    return buildResult({
      keyword: input.keyword,
      position,
      depth,
      returnedCount: primary.length,
      identityConfidence: input.identityConfidence ?? "medium",
    });
  }

  // Depth-trim (Phase 2): not_found at full depth. Run a refined search to
  // see whether the app appears in a narrower co-occurrence — if so, emit
  // "100+" with confidence: low + a searchedDepth marker rather than the
  // misleading not_found.
  if (depth === 200 && input.refinement) {
    const refined = await searchApps({
      term: `${input.keyword} ${input.refinement}`.slice(0, 100),
      country: input.country,
      limit: 50,
    });
    if (!("error" in refined)) {
      const refinedPosition = refined.findIndex((r) => r.id === input.appId) + 1;
      if (refinedPosition > 0) {
        return {
          keyword: input.keyword,
          rankBucket: "100+",
          confidence: "low",
          provenance: "live",
          searchedDepth: depth,
        };
      }
    }
  }

  return buildResult({
    keyword: input.keyword,
    position: 0,
    depth,
    returnedCount: primary.length,
    identityConfidence: input.identityConfidence ?? "medium",
  });
}

interface BuildResultInput {
  keyword: string;
  position: number; // 0 = not found, 1+ = 1-indexed rank
  depth: number;
  returnedCount: number;
  identityConfidence: Confidence;
}

function buildResult(input: BuildResultInput): KeywordRankResult {
  const providerStatus: ProviderStatus = "ok";
  const rankBucket = bucketOfPosition(input.position);
  const confidence = deriveKeywordConfidence({
    providerStatus,
    depthSearched: input.depth,
    returnedCount: input.returnedCount,
    identityConfidence: input.identityConfidence,
    rankBucket,
  });

  return {
    keyword: input.keyword,
    rankBucket,
    confidence,
    provenance: "live",
    searchedDepth: input.depth,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
