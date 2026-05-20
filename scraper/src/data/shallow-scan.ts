import {
  type AppIdentifier,
  type CountryCode,
  type CoverageProviderError,
  type ShallowScan,
  type Store,
} from "../schemas/index.js";
import { sampleQuote } from "./fixtures.js";
import { sampleKeywordRank } from "../providers/apple/keyword-rank.js";
import { withCache } from "../cache/wrapper.js";
import { cacheKey } from "../cache/keys.js";
import { CACHE_TTL } from "../cache/ttl.js";
import { getDetectedApp, type DetectResult } from "./detect.js";
import { toProviderError } from "../providers/_lib/errors.js";
import { buildKeywordRefinement } from "./report-data.js";

export interface ShallowScanInput {
  store: Store;
  app: AppIdentifier;
  country: CountryCode;
  keywords: readonly string[];
  // /sample passes true; /quote passes false so transient provider errors
  // surface as degraded preview keywords instead of fake fixture rows.
  allowFixtureFallback?: boolean;
}

export interface ShallowScanResult {
  shallowScan: ShallowScan;
  providerErrors: CoverageProviderError[];
}

const APPLE_PROVIDER = "apple-itunes";

// Build the /quote shallowScan block. Reuses a pre-fetched DetectResult when
// the caller has one (route does parallel fetch + dedup; cache layer also
// handles in-flight repeats).
//
// Phase 1 changes:
//   - Surfaces detection confidence + candidates[] when identity is ambiguous.
//   - Provider errors propagate through providerErrors[] for coverage.
//   - Transient errors degrade to provenance "degraded", not "fixture",
//     unless allowFixtureFallback is true (/sample only).
export async function getShallowScan(
  input: ShallowScanInput,
  prefetched?: DetectResult,
): Promise<ShallowScanResult> {
  const detect =
    prefetched ??
    (await getDetectedApp({
      store: input.store,
      app: input.app,
      country: input.country,
      ...(input.allowFixtureFallback !== undefined
        ? { allowFixtureFallback: input.allowFixtureFallback }
        : {}),
    }));

  const providerErrors: CoverageProviderError[] = [...detect.providerErrors];

  const firstKeyword = input.keywords[0];
  const baseTitle = detect.appRecord?.name ?? detect.detectedApp.name;
  const baseSubtitle =
    detect.appRecord?.subtitle ?? sampleQuote.shallowScan.subtitle;
  const baseCategory =
    detect.appRecord?.primaryCategory ?? sampleQuote.shallowScan.primaryCategory;
  const baseRatings =
    detect.appRecord?.ratingsSummary ?? sampleQuote.shallowScan.ratingsSummary;

  // Preview keyword only makes sense for iOS with a real appId we can search
  // for. Other paths: emit a degraded preview row (or fixture if allowed)
  // with the caller's keyword overlaid so the UI doesn't show stale data.
  if (!firstKeyword || input.store !== "ios" || !detect.appRecord) {
    const fallbackProvenance = input.allowFixtureFallback ? "fixture" : "degraded";
    return {
      shallowScan: {
        title: baseTitle,
        subtitle: baseSubtitle,
        primaryCategory: baseCategory,
        ratingsSummary: baseRatings,
        previewKeyword: {
          ...sampleQuote.shallowScan.previewKeyword,
          keyword: firstKeyword ?? sampleQuote.shallowScan.previewKeyword.keyword,
          provenance: fallbackProvenance,
        },
        detectionConfidence: detect.identityConfidence,
        candidates: detect.candidates,
        localizationAvailable: true,
      },
      providerErrors,
    };
  }

  // Phase-4 hotfix: refine the search when the app sits past iTunes' 200-result wall.
  const refinement = buildKeywordRefinement(detect.appRecord);
  const rank = await withCache(
    () =>
      sampleKeywordRank({
        keyword: firstKeyword,
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
        appId: detect.appRecord.id,
        extra: {
          keyword: firstKeyword.toLowerCase(),
          depth: 200,
          ...(refinement !== undefined ? { refinement } : {}),
        },
      }),
      ttlSeconds: CACHE_TTL.keywordRank,
      namespace: "apple:keyword-rank",
      audit: { provider: APPLE_PROVIDER, endpoint: "/search" },
    },
  );

  if ("error" in rank) {
    const provErr = toProviderError({
      provider: APPLE_PROVIDER,
      endpoint: "/search",
      legacy: rank,
    });
    providerErrors.push({
      provider: APPLE_PROVIDER,
      kind: provErr.kind,
      message: provErr.message,
    });
    return {
      shallowScan: {
        title: baseTitle,
        subtitle: baseSubtitle,
        primaryCategory: baseCategory,
        ratingsSummary: baseRatings,
        previewKeyword: {
          ...sampleQuote.shallowScan.previewKeyword,
          keyword: firstKeyword,
          provenance: input.allowFixtureFallback ? "fixture" : "degraded",
        },
        detectionConfidence: detect.identityConfidence,
        candidates: detect.candidates,
        localizationAvailable: true,
      },
      providerErrors,
    };
  }

  return {
    shallowScan: {
      title: baseTitle,
      subtitle: baseSubtitle,
      primaryCategory: baseCategory,
      ratingsSummary: baseRatings,
      previewKeyword: {
        keyword: rank.keyword,
        rankBucket: rank.rankBucket,
        confidence: rank.confidence,
        provenance: rank.provenance,
      },
      detectionConfidence: detect.identityConfidence,
      candidates: detect.candidates,
      localizationAvailable: true,
    },
    providerErrors,
  };
}
