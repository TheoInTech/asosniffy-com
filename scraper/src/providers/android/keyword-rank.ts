import type { Confidence, Provenance, RankBucket } from "../../schemas/index.js";
import {
  bucketOfPosition,
  deriveKeywordConfidence,
  type ProviderStatus,
} from "../../scoring/confidence.js";
import { searchApps } from "./play-store.js";

// Sample a keyword's rank for an Android app by searching the Play Store
// (via google-play-scraper) and finding the package position. Mirrors the
// iOS module shape so the data layer can branch on `store` and pick the
// right provider.
//
// Confidence is capped at "medium" because Play Store search results are
// scraped — Google does not expose the ranking algorithm or a stable API.

export interface SampleAndroidKeywordRankInput {
  keyword: string;
  country: string;
  packageName: string;
  depth?: number;
  identityConfidence?: Confidence;
  lang?: string;
}

export interface AndroidKeywordRankResult {
  keyword: string;
  rankBucket: RankBucket;
  confidence: Confidence;
  provenance: Provenance;
  searchedDepth: number;
}

export type AndroidKeywordRankOutcome =
  | AndroidKeywordRankResult
  | { error: "rate_limited" }
  | { error: "network_error" }
  | { error: "blocked" }
  | { error: "not_found" };

export async function sampleAndroidKeywordRank(
  input: SampleAndroidKeywordRankInput,
): Promise<AndroidKeywordRankOutcome> {
  const requestedDepth = input.depth ?? 50;
  const depth = clamp(requestedDepth, 1, 250);

  const searchInput: {
    term: string;
    country: string;
    limit: number;
    lang?: string;
  } = {
    term: input.keyword,
    country: input.country,
    limit: depth,
  };
  if (input.lang !== undefined) searchInput.lang = input.lang;

  const results = await searchApps(searchInput);

  if ("error" in results) {
    return { error: results.error };
  }

  const position =
    results.findIndex((r) => r.packageName === input.packageName) + 1;
  return buildResult({
    keyword: input.keyword,
    position,
    depth,
    returnedCount: results.length,
    identityConfidence: input.identityConfidence ?? "medium",
  });
}

interface BuildResultInput {
  keyword: string;
  position: number;
  depth: number;
  returnedCount: number;
  identityConfidence: Confidence;
}

function buildResult(input: BuildResultInput): AndroidKeywordRankResult {
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
