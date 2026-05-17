import {
  type AppIdentifier,
  type CountryCode,
  type ShallowScan,
  type Store,
} from "../schemas/index.js";
import { sampleQuote } from "./fixtures.js";
import { sampleKeywordRank } from "../providers/apple/keyword-rank.js";
import { withCache } from "../cache/wrapper.js";
import { cacheKey } from "../cache/keys.js";
import { CACHE_TTL } from "../cache/ttl.js";
import { getDetectedApp, type DetectResult } from "./detect.js";

export interface ShallowScanInput {
  store: Store;
  app: AppIdentifier;
  country: CountryCode;
  keywords: readonly string[];
}

// Build the /quote shallowScan block. Reuses a pre-fetched DetectResult when
// the caller has one (route does parallel fetch + dedup; cache layer also
// handles in-flight repeats).
export async function getShallowScan(
  input: ShallowScanInput,
  prefetched?: DetectResult,
): Promise<ShallowScan> {
  const detect = prefetched ?? (await getDetectedApp({
    store: input.store,
    app: input.app,
    country: input.country,
  }));

  const firstKeyword = input.keywords[0];
  const baseTitle = detect.appRecord?.name ?? detect.detectedApp.name;
  const baseSubtitle =
    detect.appRecord?.subtitle ?? sampleQuote.shallowScan.subtitle;
  const baseCategory =
    detect.appRecord?.primaryCategory ?? sampleQuote.shallowScan.primaryCategory;
  const baseRatings =
    detect.appRecord?.ratingsSummary ?? sampleQuote.shallowScan.ratingsSummary;

  // Preview keyword only makes sense for iOS with a real appId we can search
  // for. Android + fixture-fallback paths reuse the fixture preview keyword
  // (overlaid with the caller's keyword so it doesn't look stale).
  if (!firstKeyword || input.store !== "ios" || !detect.appRecord) {
    return {
      title: baseTitle,
      subtitle: baseSubtitle,
      primaryCategory: baseCategory,
      ratingsSummary: baseRatings,
      previewKeyword: {
        ...sampleQuote.shallowScan.previewKeyword,
        keyword: firstKeyword ?? sampleQuote.shallowScan.previewKeyword.keyword,
        provenance: "fixture",
      },
    };
  }

  const rank = await withCache(
    () =>
      sampleKeywordRank({
        keyword: firstKeyword,
        country: input.country,
        appId: detect.appRecord!.id,
        depth: 200,
      }),
    {
      key: cacheKey({
        namespace: "apple:keyword-rank",
        country: input.country,
        appId: detect.appRecord.id,
        extra: { keyword: firstKeyword.toLowerCase(), depth: 200 },
      }),
      ttlSeconds: CACHE_TTL.keywordRank,
      namespace: "apple:keyword-rank",
    },
  );

  if ("error" in rank) {
    return {
      title: baseTitle,
      subtitle: baseSubtitle,
      primaryCategory: baseCategory,
      ratingsSummary: baseRatings,
      previewKeyword: {
        ...sampleQuote.shallowScan.previewKeyword,
        keyword: firstKeyword,
        provenance: "fixture",
      },
    };
  }

  return {
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
  };
}
