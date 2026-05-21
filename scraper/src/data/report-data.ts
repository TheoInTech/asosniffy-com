import {
  type AppIdentifier,
  type CountryCode,
  type CoverageProviderError,
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
import {
  sampleAndroidKeywordRank,
  type AndroidKeywordRankOutcome,
} from "../providers/android/keyword-rank.js";
import {
  similarApps as gplaySimilarApps,
  searchApps as searchAndroidApps,
} from "../providers/android/play-store.js";
import type { AndroidAppRecord } from "../providers/android/types.js";
import { withCache } from "../cache/wrapper.js";
import { cacheKey } from "../cache/keys.js";
import { CACHE_TTL } from "../cache/ttl.js";
import { getDetectedApp, type DetectResult } from "./detect.js";
import { worstProvenance } from "./coverage.js";
import { toProviderError } from "../providers/_lib/errors.js";
import {
  getKeywordPopularity,
  type PopularityOutcome,
} from "../providers/apple/search-ads-popularity.js";
import {
  suggestKeywords as gplaySuggestKeywords,
  fetchAndroidReviews,
} from "../providers/android/play-store.js";
import { fetchAppleReviewsRss } from "../providers/apple/reviews-rss.js";
import type { KeywordPopularityInfo } from "../scoring/keyword-diagnosis.js";

export interface ReportDataInput {
  store: Store;
  app: AppIdentifier;
  country: CountryCode;
  keywords: readonly string[];
  // When true, fixture fallback is allowed end-to-end (e.g. /sample).
  // Defaults to false — Phase 1 honest-floor policy.
  allowFixtureFallback?: boolean;
}

export interface KeywordRankDatum {
  keyword: string;
  rankBucket: RankBucket;
  confidence: Confidence;
  provenance: Provenance;
  // Depth we searched to. Surfaces in the response so callers can tell
  // apart "honestly not in top-200" from "we hit a rate-limit at 50".
  searchedDepth: number;
  // iOS-only: top-N competitors from the same iTunes search response,
  // surfaced for keyword-difficulty scoring. Always undefined on the
  // Android path and on error/fixture rows. The companion `returnedCount`
  // is the total result-set size (used as `appCount` by the difficulty gate).
  topCompetitors?: AppRecord[];
  returnedCount?: number;
}

// Where a competitor candidate came from. iOS uses the "search the first
// keyword and take top-N" approach; Android uses gplay.similar() which is
// the algorithmic "more like this" Play Store endpoint. Surfaced so the
// UI/SDK can show "competitors via similar apps" instead of conflating
// the two methods.
export type CompetitorSource = "search" | "similar";

export interface CompetitorCandidate {
  appId: string;
  name: string;
  provenance: Provenance;
  source: CompetitorSource;
  // Phase 04 scoring needs the competitor's title/subtitle/description for
  // unique-token diffing. iOS records carry full AppRecord; Android records
  // carry AndroidAppRecord (the search-hit shape, lighter weight).
  record?: AppRecord;
  androidRecord?: AndroidAppRecord;
}

export interface ReportData {
  detectedApp: DetectedApp;
  detect: DetectResult;
  keywordRanks: KeywordRankDatum[];
  competitors: CompetitorCandidate[];
  dataProvenance: DataProvenance;
  providerErrors: CoverageProviderError[];
  // Phase 3 — per-keyword popularity + related-terms map (size matches
  // input.keywords). Empty array when no popularity collection ran (e.g.
  // ASA disabled and no related-terms provider available).
  keywordPopularity: KeywordPopularityInfo[];
  // Phase 3 — collected review bodies for the detected app. Used by the
  // orchestrator to derive suggestedKeywords[]. Source tracks which
  // provider produced them; coverage tells whether the walk was complete.
  reviewBodies: string[];
  reviewSource: "apple-rss" | "google-play" | "none";
  reviewCoverage: "complete" | "partial" | "unavailable" | "skipped";
}

const APPLE_PROVIDER = "apple-itunes";
const GOOGLE_PROVIDER = "google-play";

// Aggregates everything the orchestrator needs to build a paid diagnose
// report. Every source carries its own provenance. Transient provider
// failures degrade to `provenance: "degraded"` (NOT fixture) so the response
// honestly distinguishes "we couldn't reach Apple/Google" from "we made up
// this data" — see PLAN.md Phase 1 honest-floor policy.
export async function getFullReportData(
  input: ReportDataInput,
): Promise<ReportData> {
  const detect = await getDetectedApp({
    store: input.store,
    app: input.app,
    country: input.country,
    ...(input.allowFixtureFallback !== undefined
      ? { allowFixtureFallback: input.allowFixtureFallback }
      : {}),
  });

  const providerErrors: CoverageProviderError[] = [...detect.providerErrors];

  // Phase 3 — popularity, related terms, and reviews run in parallel with
  // keyword ranks + competitors. They contribute to the per-keyword
  // diagnosis (popularity/relatedTerms) and the report-level
  // suggestedKeywords[] (review frequency).
  const [keywordOutcome, competitorOutcome, popularityOutcome, reviewsOutcome] =
    await Promise.all([
      collectKeywordRanks(input, detect),
      collectCompetitors(input, detect),
      collectKeywordPopularity(input, detect),
      collectReviewBodies(input, detect),
    ]);

  providerErrors.push(...keywordOutcome.errors);
  providerErrors.push(...competitorOutcome.errors);
  providerErrors.push(...popularityOutcome.errors);
  providerErrors.push(...reviewsOutcome.errors);

  const dataProvenance: DataProvenance = {
    appMetadata: detect.provenance,
    keywordRank: worstProvenance(keywordOutcome.rows.map((r) => r.provenance)),
    competitors: worstProvenance(competitorOutcome.rows.map((c) => c.provenance)),
    recommendations: worstProvenance([
      detect.provenance,
      worstProvenance(keywordOutcome.rows.map((r) => r.provenance)),
      worstProvenance(competitorOutcome.rows.map((c) => c.provenance)),
    ]),
  };

  return {
    detectedApp: detect.detectedApp,
    detect,
    keywordRanks: keywordOutcome.rows,
    competitors: competitorOutcome.rows,
    dataProvenance,
    providerErrors,
    keywordPopularity: popularityOutcome.rows,
    reviewBodies: reviewsOutcome.bodies,
    reviewSource: reviewsOutcome.source,
    reviewCoverage: reviewsOutcome.coverage,
  };
}

interface KeywordRanksOutcome {
  rows: KeywordRankDatum[];
  errors: CoverageProviderError[];
}

async function collectKeywordRanks(
  input: ReportDataInput,
  detect: DetectResult,
): Promise<KeywordRanksOutcome> {
  if (input.keywords.length === 0) return { rows: [], errors: [] };

  if (input.store === "ios") {
    return collectIosKeywordRanks(input, detect);
  }
  return collectAndroidKeywordRanks(input, detect);
}

async function collectIosKeywordRanks(
  input: ReportDataInput,
  detect: DetectResult,
): Promise<KeywordRanksOutcome> {
  if (!detect.appRecord) {
    return {
      rows: input.keywords.map((keyword) => ({
        keyword,
        rankBucket: "not_found" as const,
        confidence: "low" as const,
        provenance: input.allowFixtureFallback ? ("fixture" as const) : ("degraded" as const),
        searchedDepth: 0,
      })),
      errors: [
        {
          provider: APPLE_PROVIDER,
          kind: "not_found",
          message:
            "App not detected; iOS keyword ranks require a successful app detection.",
        },
      ],
    };
  }

  const errors: CoverageProviderError[] = [];
  // Phase-4 hotfix: pass refinement so iTunes Search depth-200 dead-ends
  // upgrade to a refined co-occurrence search instead of silently returning
  // not_found. Without this, competitive single-token keywords (pickleball,
  // notes, timer) return not_found for any small app that ranks past 200 —
  // even when the app does exist in narrower searches. See plan §4 hotfix.
  const refinement = buildKeywordRefinement(detect.appRecord);
  const rows = await Promise.all(
    input.keywords.map(async (keyword): Promise<KeywordRankDatum> => {
      const outcome = await withCache<KeywordRankOutcome>(
        () =>
          sampleKeywordRank({
            keyword,
            country: input.country,
            appId: detect.appRecord!.id,
            depth: 200,
            identityConfidence: detect.identityConfidence,
            ...(refinement !== undefined ? { refinement } : {}),
          }),
        {
          key: cacheKey({
            namespace: "apple:keyword-rank",
            country: input.country,
            appId: detect.appRecord!.id,
            extra: {
              keyword: keyword.toLowerCase(),
              depth: 200,
              // Refinement participates in the cache key so a category
              // change (e.g. app re-categorized) doesn't serve stale rank.
              ...(refinement !== undefined ? { refinement } : {}),
            },
          }),
          ttlSeconds: CACHE_TTL.keywordRank,
          namespace: "apple:keyword-rank",
          audit: { provider: APPLE_PROVIDER, endpoint: "/search" },
        },
      );
      if ("error" in outcome) {
        const provErr = toProviderError({
          provider: APPLE_PROVIDER,
          endpoint: "/search",
          legacy: outcome,
        });
        errors.push({
          provider: APPLE_PROVIDER,
          kind: provErr.kind,
          message: provErr.message,
        });
        return {
          keyword,
          rankBucket: "not_found",
          confidence: "low",
          provenance: input.allowFixtureFallback ? "fixture" : "degraded",
          searchedDepth: 200,
        };
      }
      return outcome;
    }),
  );

  return { rows, errors };
}

async function collectAndroidKeywordRanks(
  input: ReportDataInput,
  detect: DetectResult,
): Promise<KeywordRanksOutcome> {
  if (!detect.androidRecord) {
    return {
      rows: input.keywords.map((keyword) => ({
        keyword,
        rankBucket: "not_found" as const,
        confidence: "low" as const,
        provenance: input.allowFixtureFallback ? ("fixture" as const) : ("degraded" as const),
        searchedDepth: 0,
      })),
      errors: [
        {
          provider: GOOGLE_PROVIDER,
          kind: "not_found",
          message:
            "App not detected; Android keyword ranks require a successful Play Store match.",
        },
      ],
    };
  }

  const errors: CoverageProviderError[] = [];
  const rows = await Promise.all(
    input.keywords.map(async (keyword): Promise<KeywordRankDatum> => {
      const outcome = await withCache<AndroidKeywordRankOutcome>(
        () =>
          sampleAndroidKeywordRank({
            keyword,
            country: input.country,
            packageName: detect.androidRecord!.packageName,
            depth: 200,
            identityConfidence: detect.identityConfidence,
          }),
        {
          key: cacheKey({
            namespace: "android:keyword-rank",
            country: input.country,
            appId: detect.androidRecord!.packageName,
            extra: { keyword: keyword.toLowerCase(), depth: 200 },
          }),
          ttlSeconds: CACHE_TTL.keywordRank,
          namespace: "android:keyword-rank",
          audit: { provider: GOOGLE_PROVIDER, endpoint: "/search" },
        },
      );
      if ("error" in outcome) {
        const kind = mapAndroidErrorKind(outcome.error);
        errors.push({
          provider: GOOGLE_PROVIDER,
          kind,
          message: `google-play /search: ${outcome.error}`,
        });
        return {
          keyword,
          rankBucket: "not_found",
          confidence: "low",
          provenance: input.allowFixtureFallback ? "fixture" : "degraded",
          searchedDepth: 200,
        };
      }
      return outcome;
    }),
  );

  return { rows, errors };
}

function mapAndroidErrorKind(
  legacy: "rate_limited" | "not_found" | "blocked" | "network_error",
): CoverageProviderError["kind"] {
  if (legacy === "blocked") return "upstream_unavailable";
  return legacy;
}

interface CompetitorsOutcome {
  rows: CompetitorCandidate[];
  errors: CoverageProviderError[];
}

async function collectCompetitors(
  input: ReportDataInput,
  detect: DetectResult,
): Promise<CompetitorsOutcome> {
  if (input.keywords.length === 0) return { rows: [], errors: [] };
  if (input.store === "ios") {
    return collectIosCompetitors(input, detect);
  }
  return collectAndroidCompetitors(input, detect);
}

async function collectIosCompetitors(
  input: ReportDataInput,
  detect: DetectResult,
): Promise<CompetitorsOutcome> {
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
      audit: { provider: APPLE_PROVIDER, endpoint: "/search" },
    },
  );

  if ("error" in results) {
    const provErr = toProviderError({
      provider: APPLE_PROVIDER,
      endpoint: "/search",
      legacy: results,
    });
    return {
      rows: [],
      errors: [
        {
          provider: APPLE_PROVIDER,
          kind: provErr.kind,
          message: provErr.message,
        },
      ],
    };
  }

  const rows: CompetitorCandidate[] = results
    .filter((r) => r.id !== detect.detectedApp.id)
    .slice(0, 5)
    .map((r) => ({
      appId: r.id,
      name: r.name,
      provenance: r.provenance,
      source: "search" as CompetitorSource,
      record: r,
    }));
  return { rows, errors: [] };
}

async function collectAndroidCompetitors(
  input: ReportDataInput,
  detect: DetectResult,
): Promise<CompetitorsOutcome> {
  // Android prefers gplay.similar() (algorithmic "more like this") when we
  // have a known packageName; falls back to gplay.search() over the first
  // keyword when we don't.
  if (detect.androidRecord) {
    const results = await withCache(
      () =>
        gplaySimilarApps({
          packageName: detect.androidRecord!.packageName,
          country: input.country,
        }),
      {
        key: cacheKey({
          namespace: "android:similar",
          country: input.country,
          appId: detect.androidRecord!.packageName,
        }),
        ttlSeconds: CACHE_TTL.androidPreview,
        namespace: "android:similar",
        audit: { provider: GOOGLE_PROVIDER, endpoint: "/similar" },
      },
    );
    if ("error" in results) {
      return {
        rows: [],
        errors: [
          {
            provider: GOOGLE_PROVIDER,
            kind: mapAndroidErrorKind(results.error),
            message: `google-play /similar: ${results.error}`,
          },
        ],
      };
    }
    const rows: CompetitorCandidate[] = results
      .filter((r) => r.packageName !== detect.androidRecord!.packageName)
      .slice(0, 5)
      .map((r) => ({
        appId: r.packageName,
        name: r.name,
        provenance: r.provenance,
        source: "similar" as CompetitorSource,
        androidRecord: r,
      }));
    return { rows, errors: [] };
  }

  // Fallback path — search first keyword.
  const firstKeyword = input.keywords[0]!;
  const results = await withCache(
    () =>
      searchAndroidApps({
        term: firstKeyword,
        country: input.country,
        limit: 20,
      }),
    {
      key: cacheKey({
        namespace: "android:competitor-search",
        country: input.country,
        extra: { keyword: firstKeyword.toLowerCase(), limit: 20 },
      }),
      ttlSeconds: CACHE_TTL.androidPreview,
      namespace: "android:competitor-search",
      audit: { provider: GOOGLE_PROVIDER, endpoint: "/search" },
    },
  );
  if ("error" in results) {
    return {
      rows: [],
      errors: [
        {
          provider: GOOGLE_PROVIDER,
          kind: mapAndroidErrorKind(results.error),
          message: `google-play /search: ${results.error}`,
        },
      ],
    };
  }
  const rows: CompetitorCandidate[] = results
    .filter((r) => r.packageName !== detect.detectedApp.id)
    .slice(0, 5)
    .map((r) => ({
      appId: r.packageName,
      name: r.name,
      provenance: r.provenance,
      source: "search" as CompetitorSource,
      androidRecord: r,
    }));
  return { rows, errors: [] };
}

interface PopularityOutcome2 {
  rows: KeywordPopularityInfo[];
  errors: CoverageProviderError[];
}

// Phase 3 — per-keyword popularity (Apple Search Ads) and related terms
// (gplay.suggest). Runs in parallel with rank collection. Each keyword
// gets its own popularity row even when both sources are degraded — the
// row is always size-of-keywords so KeywordDiagnosis can join on index.
async function collectKeywordPopularity(
  input: ReportDataInput,
  _detect: DetectResult,
): Promise<PopularityOutcome2> {
  if (input.keywords.length === 0) return { rows: [], errors: [] };

  const errors: CoverageProviderError[] = [];

  const rows = await Promise.all(
    input.keywords.map(async (keyword): Promise<KeywordPopularityInfo> => {
      // Run popularity + related-terms in parallel per keyword.
      const [popularity, related] = await Promise.all([
        getKeywordPopularity({ keyword, country: input.country }),
        // gplay.suggest is iOS-positioning-helpful even when input.store==="ios"
        // — Google's autocomplete reveals what users search for next.
        gplaySuggestKeywords({ term: keyword, country: input.country }).catch(
          () => ({ error: "network_error" as const }),
        ),
      ]);

      const info = mapPopularityOutcomeToInfo(keyword, popularity, errors);
      // gplay.suggest can return empty/whitespace entries (especially for
      // niche or short terms). DiagnosePaidResponse.parse requires
      // relatedTerms[*] to be non-empty (`z.string().min(1)`), so we
      // trim+filter at the data-layer boundary before the schema sees them.
      // Trim before filter, then slice — otherwise we could slice five
      // entries only to filter most of them out.
      const relatedTerms = !("error" in related)
        ? related
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
            .slice(0, 5)
        : [];
      return {
        ...info,
        relatedTerms,
      };
    }),
  );

  return { rows, errors };
}

function mapPopularityOutcomeToInfo(
  keyword: string,
  outcome: PopularityOutcome,
  errors: CoverageProviderError[],
): KeywordPopularityInfo {
  if (!("error" in outcome)) {
    return {
      keyword,
      popularityScore: outcome.score,
      popularitySource: outcome.source,
      popularityAsOf: outcome.asOf,
      relatedTerms: [], // populated by caller
    };
  }
  // Map ASA error variants to a single classified provider error. We do
  // NOT record an error for `disabled` — that's an expected configuration
  // state, not a runtime failure. Same for `not_found` — Apple legitimately
  // returns no record for niche keywords.
  if (outcome.error === "rate_limited") {
    errors.push({
      provider: "apple-search-ads",
      kind: "rate_limited",
      message: `apple-search-ads /keywords/recommendations: rate_limited (keyword: "${keyword}")`,
    });
  } else if (outcome.error === "auth_failed") {
    errors.push({
      provider: "apple-search-ads",
      kind: "upstream_unavailable",
      message: `apple-search-ads auth failed: ${outcome.reason}`,
    });
  } else if (outcome.error === "network_error") {
    errors.push({
      provider: "apple-search-ads",
      kind: "network_error",
      message: `apple-search-ads /keywords/recommendations: network_error (keyword: "${keyword}")`,
    });
  }
  return {
    keyword,
    popularityScore: null,
    popularitySource: "heuristic",
    popularityAsOf: null,
    relatedTerms: [],
  };
}

interface ReviewsCollectionOutcome {
  bodies: string[];
  source: "apple-rss" | "google-play" | "none";
  coverage: "complete" | "partial" | "unavailable" | "skipped";
  errors: CoverageProviderError[];
}

// Phase 3 — collect public reviews for the detected app. iOS uses Apple's
// customer reviews RSS (capped at ~500 reviews per app); Android uses
// gplay.reviews with sort=NEWEST. Returns review bodies for downstream
// keyword-frequency scoring; never blocks the report.
async function collectReviewBodies(
  input: ReportDataInput,
  detect: DetectResult,
): Promise<ReviewsCollectionOutcome> {
  if (input.store === "ios" && detect.appRecord) {
    const outcome = await fetchAppleReviewsRss({
      appId: detect.appRecord.id,
      country: input.country,
      // 2 pages is enough for the suggestedKeywords[] use case; we don't
      // need the full 500 for keyword frequency to surface signal.
      maxPages: 2,
    });
    if ("error" in outcome) {
      return {
        bodies: [],
        source: "apple-rss",
        coverage: "unavailable",
        errors: [
          {
            provider: "apple-reviews-rss",
            kind:
              outcome.error === "rate_limited"
                ? "rate_limited"
                : "network_error",
            message: `apple-reviews-rss: ${outcome.error}`,
          },
        ],
      };
    }
    return {
      bodies: outcome.reviews.map((r) => `${r.title}\n${r.body}`),
      source: "apple-rss",
      coverage: outcome.coverage,
      errors: [],
    };
  }

  if (input.store === "android" && detect.androidRecord) {
    const outcome = await fetchAndroidReviews({
      packageName: detect.androidRecord.packageName,
      country: input.country,
    });
    if ("error" in outcome) {
      return {
        bodies: [],
        source: "google-play",
        coverage: "unavailable",
        errors: [
          {
            provider: "google-play",
            kind:
              outcome.error === "rate_limited"
                ? "rate_limited"
                : outcome.error === "not_found"
                  ? "not_found"
                  : "network_error",
            message: `google-play /reviews: ${outcome.error}`,
          },
        ],
      };
    }
    return {
      bodies: outcome.reviews.map((r) => `${r.title}\n${r.body}`),
      source: "google-play",
      coverage: outcome.sampleSize > 0 ? "complete" : "unavailable",
      errors: [],
    };
  }

  return { bodies: [], source: "none", coverage: "skipped", errors: [] };
}

// Phase-4 hotfix helper. Picks a single co-occurrence token to refine
// iTunes Search when the primary 200-depth lookup misses the target app.
// Priority:
//   1. primaryCategory when set and not the "Unknown" fallback
//   2. First word of the app name
//   3. First token of the developer name
// Returns undefined when nothing usable is available — caller skips
// refinement entirely (matches Phase-2 behavior).
//
// Exported for the shallow-scan path and for tests.
export function buildKeywordRefinement(
  appRecord:
    | { primaryCategory?: string; name?: string; developer?: string }
    | null
    | undefined,
): string | undefined {
  if (!appRecord) return undefined;
  const cat = (appRecord.primaryCategory ?? "").trim();
  if (cat.length > 0 && cat.toLowerCase() !== "unknown") return cat;
  const firstNameWord = (appRecord.name ?? "")
    .trim()
    .split(/\s+/)
    .filter((s) => s.length > 0)[0];
  if (firstNameWord && firstNameWord.length >= 3) return firstNameWord;
  const firstDevToken = (appRecord.developer ?? "")
    .trim()
    .split(/\s+/)
    .filter((s) => s.length > 0)[0];
  if (firstDevToken && firstDevToken.length >= 3) return firstDevToken;
  return undefined;
}
