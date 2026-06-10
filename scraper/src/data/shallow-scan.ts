import {
  type AppIdentifier,
  type CountryCode,
  type CoverageProviderError,
  type MetadataLength,
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
import { computeConversionIndex } from "../scoring/conversion-index.js";
import { probeAiMention } from "../providers/llm-mention.js";

// Sprint A — character-usage caps for the free-tier metadata-length report.
// iOS title/subtitle are indexed and capped at 30 chars each. Android title
// is 30; short description (the iOS subtitle analogue) is 80. The keyword
// field on iOS is 100 chars but hidden from public scraping — Sniffy never
// has used-bytes for it, so we omit that row rather than guess.
const IOS_TITLE_MAX = 30;
const IOS_SUBTITLE_MAX = 30;
const ANDROID_TITLE_MAX = 30;
const ANDROID_SHORT_DESCRIPTION_MAX = 80;

// Count by Apple's metric: code points (Unicode characters), not UTF-16 code
// units. `string.length` counts the latter, which double-counts emoji and
// some scripts. Array.from + [...str] both spread by code point. Aligns with
// what an indie founder sees in App Store Connect's character counter.
function codePointLength(value: string): number {
  return [...value].length;
}

function buildMetadataLengths(input: {
  store: Store;
  title: string;
  subtitle: string;
}): MetadataLength[] {
  if (input.store === "ios") {
    return [
      {
        field: "title",
        used: codePointLength(input.title),
        max: IOS_TITLE_MAX,
        note: "indexed for search",
      },
      {
        field: "subtitle",
        used: codePointLength(input.subtitle),
        max: IOS_SUBTITLE_MAX,
        note: "indexed for search; should not repeat title keywords",
      },
    ];
  }
  // Android: the short-description field is shipped via shallowScan.subtitle
  // because the public detect path normalizes it that way. Surface it under
  // the Android-correct label so consumers don't confuse it with iOS subtitle.
  return [
    {
      field: "title",
      used: codePointLength(input.title),
      max: ANDROID_TITLE_MAX,
      note: "indexed for search",
    },
    {
      field: "shortDescription",
      used: codePointLength(input.subtitle),
      max: ANDROID_SHORT_DESCRIPTION_MAX,
      note: "indexed; weighted lower than title",
    },
  ];
}

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
  const metadataLengths = buildMetadataLengths({
    store: input.store,
    title: baseTitle,
    subtitle: baseSubtitle,
  });

  // Wave 1 teasers (roadmap 1.5) — computed once, included on every return
  // path below. The rating verdict is the band + one-line note only; the
  // economics behind it stay in the paid conversionAudit. The AI-mention
  // probe is flag-gated, cache-backed (7d), and never blocks the quote —
  // start it now so it overlaps the rank fetch on the happy path.
  const ratingBandVerdict = buildRatingBandVerdict({
    average: baseRatings.average,
    count: baseRatings.count,
    store: input.store,
  });
  const aiMentionPromise: Promise<ShallowScan["aiMention"]> =
    firstKeyword && detect.appRecord
      ? probeAiMention({
          appId: detect.appRecord.id,
          appName: detect.appRecord.name,
          keyword: firstKeyword,
          store: input.store,
          country: input.country,
        })
      : Promise.resolve(null);

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
        metadataLengths,
        ratingBandVerdict,
        aiMention: await aiMentionPromise,
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
        metadataLengths,
        ratingBandVerdict,
        aiMention: await aiMentionPromise,
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
      metadataLengths,
      ratingBandVerdict,
      aiMention: await aiMentionPromise,
    },
    providerErrors,
  };
}

// Wave 1 (roadmap 1.5) — rating-band teaser. Reuses the conversion-index
// band logic (community-tested 3.5/4.0/4.5 thresholds) but surfaces ONLY
// band + note: the multiplier curve, category baselines, and estimated
// index stay paid-only in conversionAudit. Null when the listing is
// unrated (iTunes returns 0 for unrated apps).
function buildRatingBandVerdict(input: {
  average: number;
  count: number;
  store: Store;
}): ShallowScan["ratingBandVerdict"] {
  const result = computeConversionIndex({
    averageUserRating: input.average > 0 ? input.average : null,
    userRatingCount: input.count > 0 ? input.count : null,
    primaryCategory: null,
    store: input.store,
  });
  if (result.ratingBand === null || result.bandNote === null) return null;
  return { band: result.ratingBand, note: result.bandNote };
}
