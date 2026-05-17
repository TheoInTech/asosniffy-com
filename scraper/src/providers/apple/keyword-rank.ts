import type { Confidence, Provenance, RankBucket } from "../../schemas/index.js";
import { searchApps } from "./itunes.js";

export interface SampleKeywordRankInput {
  keyword: string;
  country: string;
  appId: string;
  depth?: number;
}

export interface KeywordRankResult {
  keyword: string;
  rankBucket: RankBucket;
  confidence: Confidence;
  provenance: Provenance;
}

export type KeywordRankOutcome =
  | KeywordRankResult
  | { error: "rate_limited" }
  | { error: "network_error" };

// Sample a keyword's rank for a given app by searching the App Store and
// finding the app's position in the results. "not_found" (per PLAN.md §14)
// is a normal return — meaning the app didn't appear in the searched depth.
export async function sampleKeywordRank(
  input: SampleKeywordRankInput,
): Promise<KeywordRankOutcome> {
  const requestedDepth = input.depth ?? 50;
  const depth = clamp(requestedDepth, 1, 200);

  const results = await searchApps({
    term: input.keyword,
    country: input.country,
    limit: depth,
  });

  if ("error" in results) {
    if (results.error === "not_found") {
      // searchApps doesn't return not_found, but be defensive — treat as
      // an empty result set rather than an error.
      return buildResult({
        keyword: input.keyword,
        position: -1,
        depth,
        returnedCount: 0,
      });
    }
    return { error: results.error };
  }

  const position = results.findIndex((r) => r.id === input.appId) + 1; // 1-indexed; 0 → not found
  return buildResult({
    keyword: input.keyword,
    position,
    depth,
    returnedCount: results.length,
  });
}

interface BuildResultInput {
  keyword: string;
  position: number; // 0 = not found, 1+ = 1-indexed rank
  depth: number;
  returnedCount: number;
}

function buildResult(input: BuildResultInput): KeywordRankResult {
  // Confidence floor: if Apple returned fewer results than we asked for
  // (truncation or partial response), the rank signal is degraded.
  const confidence: Confidence = input.returnedCount >= input.depth ? "medium" : "low";

  return {
    keyword: input.keyword,
    rankBucket: bucketOfPosition(input.position),
    confidence,
    provenance: "live",
  };
}

function bucketOfPosition(position: number): RankBucket {
  if (position <= 0) return "not_found";
  if (position <= 10) return "1-10";
  if (position <= 30) return "11-30";
  if (position <= 50) return "31-50";
  if (position <= 100) return "51-100";
  return "100+";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
