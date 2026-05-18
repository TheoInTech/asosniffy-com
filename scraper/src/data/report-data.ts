import {
  type AppIdentifier,
  type CountryCode,
  type DataProvenance,
  type DetectedApp,
  type Provenance,
  type RankBucket,
  type Confidence,
  type Store,
} from "../schemas/index.js";
import { searchApps } from "../providers/apple/itunes.js";
import type { AppRecord } from "../providers/apple/types.js";
import {
  sampleKeywordRank,
  type KeywordRankOutcome,
} from "../providers/apple/keyword-rank.js";
import { withCache } from "../cache/wrapper.js";
import { cacheKey } from "../cache/keys.js";
import { CACHE_TTL } from "../cache/ttl.js";
import { getDetectedApp, type DetectResult } from "./detect.js";
import { worstProvenance } from "./coverage.js";

export interface ReportDataInput {
  store: Store;
  app: AppIdentifier;
  country: CountryCode;
  keywords: readonly string[];
}

export interface KeywordRankDatum {
  keyword: string;
  rankBucket: RankBucket;
  confidence: Confidence;
  provenance: Provenance;
}

export interface CompetitorCandidate {
  appId: string;
  name: string;
  provenance: Provenance;
  // Phase 04 scoring needs the competitor's title/subtitle/description for
  // unique-token diffing. Populated when Phase 03 already has the full record
  // from `searchApps`; absent otherwise (fixture path).
  record?: AppRecord;
}

export interface ReportData {
  detectedApp: DetectedApp;
  detect: DetectResult;
  keywordRanks: KeywordRankDatum[];
  competitors: CompetitorCandidate[];
  dataProvenance: DataProvenance;
}

// Aggregates everything the orchestrator needs to build a paid diagnose
// report. Every source carries its own provenance and degrades gracefully
// to fixture under provider failure (PLAN.md §14).
export async function getFullReportData(
  input: ReportDataInput,
): Promise<ReportData> {
  const detect = await getDetectedApp({
    store: input.store,
    app: input.app,
    country: input.country,
  });

  const keywordRanks = await collectKeywordRanks(input, detect);
  const competitors = await collectCompetitors(input, detect);

  const dataProvenance: DataProvenance = {
    appMetadata: detect.provenance,
    keywordRank: worstProvenance(keywordRanks.map((r) => r.provenance)),
    competitors: worstProvenance(competitors.map((c) => c.provenance)),
    // Phase 04 owns AI synthesis. Until then, recommendations are fixture
    // overlays, so the honest label is fixture.
    recommendations: "fixture",
  };

  return {
    detectedApp: detect.detectedApp,
    detect,
    keywordRanks,
    competitors,
    dataProvenance,
  };
}

async function collectKeywordRanks(
  input: ReportDataInput,
  detect: DetectResult,
): Promise<KeywordRankDatum[]> {
  if (input.keywords.length === 0) return [];
  if (input.store !== "ios" || !detect.appRecord) {
    // No live rank possible — emit fixture rows for each requested keyword.
    return input.keywords.map((keyword) => ({
      keyword,
      rankBucket: "not_found",
      confidence: "low",
      provenance: "fixture",
    }));
  }

  return Promise.all(
    input.keywords.map(async (keyword) => {
      const outcome = await withCache<KeywordRankOutcome>(
        () =>
          sampleKeywordRank({
            keyword,
            country: input.country,
            appId: detect.appRecord!.id,
            depth: 200,
          }),
        {
          key: cacheKey({
            namespace: "apple:keyword-rank",
            country: input.country,
            appId: detect.appRecord!.id,
            extra: { keyword: keyword.toLowerCase(), depth: 200 },
          }),
          ttlSeconds: CACHE_TTL.keywordRank,
          namespace: "apple:keyword-rank",
        },
      );
      if ("error" in outcome) {
        return {
          keyword,
          rankBucket: "not_found" as const,
          confidence: "low" as const,
          provenance: "fixture" as const,
        };
      }
      return outcome;
    }),
  );
}

async function collectCompetitors(
  input: ReportDataInput,
  detect: DetectResult,
): Promise<CompetitorCandidate[]> {
  if (input.store !== "ios" || input.keywords.length === 0) return [];

  const firstKeyword = input.keywords[0]!;
  const results = await withCache(
    () =>
      searchApps({
        term: firstKeyword,
        country: input.country,
        limit: 20,
      }),
    {
      key: cacheKey({
        namespace: "apple:competitor-search",
        country: input.country,
        extra: { keyword: firstKeyword.toLowerCase(), limit: 20 },
      }),
      ttlSeconds: CACHE_TTL.appMetadata,
      namespace: "apple:competitor-search",
    },
  );

  if ("error" in results) return [];

  return results
    .filter((r) => r.id !== detect.detectedApp.id)
    .slice(0, 5)
    .map((r) => ({
      appId: r.id,
      name: r.name,
      provenance: r.provenance,
      record: r,
    }));
}
