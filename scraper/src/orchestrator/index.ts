import {
  SCHEMA_VERSION,
  type AppIdentifier,
  type CompetitorTrailItem,
  type Confidence,
  type CountryCode,
  type CoverageProviderError,
  type DataProvenance,
  type DiagnosePaidResponse,
  type DiagnoseTier,
  type ExpertAnalysis,
  type KeywordDiagnosisItem,
  METADATA_SCORE_WEIGHTS,
  type MetadataScore,
  type Provenance,
  type RegressionItem,
  type RequestId,
  type SniffId,
  type Store,
  type SuggestedKeyword,
  type TargetAppSignals,
  type Trend,
} from "../schemas/index.js";
import { computeMomentum } from "../scoring/momentum.js";
import type { AppRecord } from "../providers/apple/types.js";
import {
  getFullReportData,
  type CompetitorCandidate,
  type ReportData,
} from "../data/report-data.js";
import {
  analyzeCompetitors,
  buildCandidatesFromCompetitors,
  computeKeywordDistribution,
  computeTrend,
  detectRegressions,
  diagnoseKeywords,
  reviewKeywordFrequency,
  scoreCandidates,
  scoreLocalization,
  scoreMetadataFull,
  type CandidateKeyword,
  type CompetitorAnalysis,
  type CompetitorRef,
  type KeywordDiagnosis,
  type LocalizationAnalysis as LocalizationAnalysisType,
  type MetadataScoringResult,
  type ScoredCandidate,
} from "../scoring/index.js";
import {
  buildTargetVectorText,
  cosineSimilarity,
  embedText,
  isRelevanceGateEnabled,
} from "../scoring/embeddings.js";
import { getKnowledgeForRecommendation } from "../scoring/aso-knowledge.js";
import { analyzeReviewSentiment } from "../scoring/review-sentiment.js";
import { lookupLocalized } from "../providers/apple/multi-storefront.js";
import {
  fetchProductProfile,
  type ProductProfile,
} from "../providers/product-context.js";
import { extractReviewLanguageTokens } from "../scoring/review-language.js";
import {
  buildCompetitorNotes,
  buildDescriptionDensityRecommendation,
  buildKeywordRecommendation,
  buildMetadataNotes,
  synthesizeReportOpenAi,
  synthesizeReportTemplate,
  type SynthesisInput,
  type SynthesisOutput,
} from "../synthesis/index.js";
import {
  buildLocalizationRecommendation,
  stitchLocalizedCopy,
  synthesizeLocalizedCopy,
} from "../synthesis/localized-copy.js";
import { worstProvenance } from "../data/coverage.js";
import {
  getRankSeries,
  recordRank,
  type RankSample,
} from "../cache/timeseries.js";
import { env } from "../env.js";
import { signWildcardForRequest } from "../lib/history-hmac.js";

// Phase 1 — Honest provenance:
//   recommendations.provenance is the WORST of its inputs. Previously this
//   was hard-coded "inferred" regardless of upstream data quality — agents
//   and founders saw "AI-derived from real data" even when keyword ranks
//   were fixture. After Phase 1, "inferred" means exactly "AI synthesized
//   over non-fixture, non-degraded inputs"; everything else propagates.

export type ReportPayload = Omit<
  DiagnosePaidResponse,
  "requestId" | "sniffId" | "receipt" | "packCredit"
>;

export interface GenerateReportInput {
  requestId: RequestId;
  sniffId: SniffId;
  store: Store;
  app: AppIdentifier;
  country: CountryCode;
  keywords: readonly string[];
  // When true, fixture fallback is allowed end-to-end (e.g. /sample).
  // /diagnose passes false — degraded beats fixture for paid responses.
  allowFixtureFallback?: boolean;
  // Sprint B — diagnose tier. When `quick`, the orchestrator skips the
  // OpenAI synthesis call and uses the deterministic template path. Quick
  // still produces a structurally complete DiagnosePaidResponse — the
  // savings come from skipping the LLM token spend, not from stripping
  // fields. `standard` and `expert` (and omitted/legacy) run the full AI
  // path. Expert-specific feature gating lands in a follow-up.
  tier?: DiagnoseTier;
}

// Lean handle to the detected app's listing identity, surfaced for
// downstream consumers (wallet/history index) that don't want to re-derive
// it from the full report payload.
export interface DetectedAppHandle {
  id: string;
  name: string;
  developer: string;
  iconUrl: string | null;
}

export interface GenerateReportResult {
  payload: ReportPayload;
  providerErrors: CoverageProviderError[];
  detectedApp: DetectedAppHandle;
}

export async function generateReport(
  input: GenerateReportInput,
): Promise<ReportPayload> {
  const { payload } = await generateReportWithMeta(input);
  return payload;
}

// Extended version that returns provider-error metadata alongside the payload.
// Routes use this when they want to surface coverage.providerErrors[] in the
// response. The simple `generateReport` keeps the legacy single-payload return
// for any callers that don't care.
export async function generateReportWithMeta(
  input: GenerateReportInput,
): Promise<GenerateReportResult> {
  const data = await getFullReportData({
    store: input.store,
    app: input.app,
    country: input.country,
    keywords: input.keywords,
    ...(input.allowFixtureFallback !== undefined
      ? { allowFixtureFallback: input.allowFixtureFallback }
      : {}),
  });

  // ---------- Scoring (deterministic) ----------
  // `data.keywordRanks` lands before diagnosis composition, so we can feed it
  // straight into scoring for the keywordRankings subscore — no need to wait
  // for the assembled `KeywordDiagnosisItem[]` to exist.
  const metadataScoring = scoreMetadataFull({
    app: data.detect.appRecord,
    detectedApp: data.detectedApp,
    keywords: input.keywords,
    rankedKeywords: data.keywordRanks,
  });

  const keywordScoring = diagnoseKeywords({
    keywords: input.keywords,
    ranks: data.keywordRanks,
    app: data.detect.appRecord,
    popularity: data.keywordPopularity,
  });

  const candidateRecords = buildCandidateRecordsMap(data.competitors);
  const competitorScoring = analyzeCompetitors({
    target: data.detect.appRecord,
    targetKeywords: input.keywords,
    candidates: data.competitors,
    candidateRecords,
  });

  // ---------- Synthesis (AI with template fallback) ----------
  // Compute the worst-input provenance before synthesis. If inputs are
  // fixture/degraded, the synthesis layer downgrades to sample-disclaimer
  // copy and the orchestrator stamps the matching provenance.
  const inputProvenance = worstProvenance([
    data.dataProvenance.appMetadata,
    data.dataProvenance.keywordRank,
    data.dataProvenance.competitors,
  ]);

  // Phase 9 — Relevance gate. Score every external keyword candidate
  // (competitors + ASA recommendations + future autocomplete + reviews)
  // against the target app's category + intent before it can reach
  // synthesis. Day-1 form: no embeddings — gate composes category-match
  // and structural intent only. Day 5 will light up the cosine term.
  // The gate output flows into both synthesizeReportOpenAi (as
  // relevantKeywordPool) and the template (as scoredCandidates) — every
  // off-topic term is filtered at the chokepoint.
  const competitorContexts: CompetitorRef[] = competitorScoring.map((c) => {
    const record = candidateRecords.get(c.appId);
    return {
      appId: c.appId,
      name: c.name,
      primaryCategory: record?.primaryCategory,
    };
  });
  const competitorCandidates = buildCandidatesFromCompetitors(competitorScoring);
  const asaRecCandidates: CandidateKeyword[] = data.asaRecommendations.map(
    (rec) => ({
      keyword: rec.keyword,
      origin: "asa-rec" as const,
      popularity: rec.popularity,
    }),
  );
  const autocompleteCandidates: CandidateKeyword[] = data.autocompleteHits.map(
    (term) => ({
      keyword: term,
      origin: "autocomplete" as const,
    }),
  );
  const allCandidates: CandidateKeyword[] = [
    ...competitorCandidates,
    ...asaRecCandidates,
    ...autocompleteCandidates,
  ];

  // Phase 9 (Day 5) — semantic-similarity gating. Pre-compute target
  // and candidate embeddings, build a cosineByKeyword map, and pass
  // it into the gate. Falls through to Day-1 (category + intent only)
  // when the gate is disabled, embeddings fail, or OPENAI_API_KEY is
  // missing — never breaks /diagnose.
  const cosineByKeyword = await computeCosineMapSafely({
    enabled: isRelevanceGateEnabled(),
    appName: data.detectedApp.name,
    subtitle: data.detect.appRecord?.subtitle,
    description: data.detect.appRecord?.description,
    primaryKeywords: input.keywords,
    candidates: allCandidates,
  });

  const scoredCandidates: ScoredCandidate[] = scoreCandidates({
    candidates: allCandidates,
    appContext: {
      appName: data.detectedApp.name,
      primaryCategory:
        data.detect.appRecord?.primaryCategory ??
        data.detect.androidRecord?.primaryCategory,
      userKeywords: input.keywords,
    },
    competitorContexts,
    ...(cosineByKeyword !== null ? { cosineByKeyword } : {}),
  });

  // Phase B — Product-context provider. Only fetches when the feature
  // flag is on, the live AppRecord has a sellerUrl, and the input data is
  // genuinely live (no point scraping marketing sites on a fixture run).
  // The provider itself never throws — bad sellerUrl or network errors
  // return provenance:"degraded" with empty arrays, which the synthesis
  // layer treats as a no-op.
  let productProfile: ProductProfile | undefined;
  if (
    env.PRODUCT_CONTEXT_ENABLED &&
    data.detect.appRecord?.sellerUrl &&
    inputProvenance === "live"
  ) {
    productProfile = await fetchProductProfile({
      sellerUrl: data.detect.appRecord.sellerUrl,
    });
  }

  // Phase D — Review-language extraction. Customers' vocabulary that the
  // user's listing doesn't carry. reviewKeywordFrequency already runs for
  // the suggestedKeywords path; this is a lightweight filter on top of
  // its output, dedup'd against the user's title/subtitle/description/
  // keywords surface. Empty reviewBodies → empty result, no-op downstream.
  const reviewLanguage =
    inputProvenance !== "fixture" && inputProvenance !== "degraded"
      ? extractReviewLanguageTokens({
          reviewBodies: data.reviewBodies,
          appRecord: data.detect.appRecord,
          userKeywords: input.keywords,
        })
      : { languageTokens: [] };

  const synthesisInput: SynthesisInput = {
    scoring: {
      metadata: metadataScoring,
      keywords: keywordScoring,
      competitors: competitorScoring,
    },
    context: {
      detectedApp: data.detectedApp,
      appRecord: data.detect.appRecord,
      keywords: input.keywords,
    },
    inputProvenance,
    scoredCandidates,
    ...(productProfile ? { productProfile } : {}),
    ...(reviewLanguage.languageTokens.length > 0
      ? { reviewLanguageTokens: reviewLanguage.languageTokens }
      : {}),
  };

  // Sprint B — Quick tier short-circuits to the deterministic template path.
  // Skips the OpenAI request (no token cost, faster response) while still
  // returning a structurally complete report — recommendations + ready-to-
  // paste copy come from the same template engine that backs the existing
  // synthesis fallback. Standard / Expert (and omitted/legacy callers) run
  // the full AI synthesis.
  const synthesis: SynthesisOutput =
    input.tier === "quick"
      ? synthesizeReportTemplate(synthesisInput)
      : await synthesizeReportOpenAi(synthesisInput, {
          requestId: input.requestId,
        });

  // ---------- Phase 4: history-aware overlay ----------
  // Fetch rank-history series for every keyword in parallel. Compute trend
  // per keyword and detect regressions across the set. Then fire-and-forget
  // a persistence write for each non-fixture rank so the next /diagnose sees
  // today's data. Skipped on fixture-fallback paths so /sample doesn't
  // pollute history with synthetic data.
  const detectedAppId = data.detect.appRecord?.id ?? data.detect.androidRecord?.packageName;
  const historyEnabled =
    env.RANK_HISTORY_ENABLED &&
    !input.allowFixtureFallback &&
    detectedAppId !== undefined;

  const seriesByKeyword = historyEnabled
    ? await readSeriesForAllKeywords({
        store: input.store,
        country: input.country,
        appId: detectedAppId!,
        keywords: input.keywords,
      })
    : new Map<string, RankSample[]>();

  if (historyEnabled) {
    // Persist this run's samples after we read the historical series — the
    // current sample becomes part of NEXT call's history, not this call's.
    fireAndForgetPersist({
      store: input.store,
      country: input.country,
      appId: detectedAppId!,
      keywordRanks: data.keywordRanks,
    });
  }

  // ---------- Phase 5: localization gap analysis ----------
  // iOS only for now — gplay also exposes localized data (lang/country),
  // but the Android scoring path uses a different record shape and we
  // ship Android parity in a follow-up. LOCALIZATION_ENABLED gates the
  // whole feature; allowFixtureFallback skips it to keep /sample fast.
  let localizationAnalysis = await collectLocalization({
    enabled: env.LOCALIZATION_ENABLED && !input.allowFixtureFallback,
    store: input.store,
    requestCountry: input.country,
    appId: detectedAppId,
    targetCountries: env.LOCALIZATION_STOREFRONTS,
  });

  // ---------- Phase C: localized translated copy (OpenAI-gated) ----------
  // For each mismatched storefront, generate paste-ready translated copy
  // when OPENAI_API_KEY is set. Fallback when key/circuit unavailable: the
  // synthesis layer surfaces a "translate this listing" recommendation
  // card so the value is still visible to the buyer. Skipped entirely for
  // fixture/sample paths and when localization itself is degraded.
  if (
    localizationAnalysis &&
    localizationAnalysis.unlocalizedCount > 0 &&
    !input.allowFixtureFallback &&
    inputProvenance !== "fixture" &&
    inputProvenance !== "degraded"
  ) {
    const mismatched = localizationAnalysis.storefronts
      .filter((s) => s.localized === false)
      .map((s) => ({
        country: s.country,
        expectedLanguages: s.expectedLanguages,
      }));
    const translations = await synthesizeLocalizedCopy({
      appName: data.detectedApp.name,
      currentTitle:
        data.detect.appRecord?.name ?? data.detectedApp.name,
      currentSubtitle: data.detect.appRecord?.subtitle ?? "",
      primaryKeywords: input.keywords,
      targets: mismatched,
      requestId: input.requestId,
    });
    localizationAnalysis = stitchLocalizedCopy(
      localizationAnalysis,
      translations,
    );
  }

  // Phase 6 — target-app momentum block. iOS only (Android record lacks
  // releaseDate from gplay-scraper today). null when AppRecord wasn't
  // fetched or the listing is region-locked without a releaseDate.
  const targetAppSignals = assembleTargetAppSignals(data.detect.appRecord);

  // ---------- Phase C + H: post-synthesis recommendation cards ----------
  // When translation was deferred (no OpenAI key, or call failed), surface
  // a single "translate your listing" recommendation so the report still
  // tells the buyer what to do. When translation succeeded, the copy
  // itself is the value and no extra card is needed.
  // The description-density card (Phase H) fires when a user keyword is
  // under-target in the description — points the buyer at a concrete
  // copy edit grounded in the 2026 density rule.
  const recommendations = [...synthesis.recommendations];
  const localizationRec = buildLocalizationRecommendation(
    localizationAnalysis,
    recommendations.length + 1,
  );
  if (localizationRec && recommendations.length < 5) {
    recommendations.push(localizationRec);
  }
  const densityRec = buildDescriptionDensityRecommendation(
    metadataScoring.descriptionDensity,
    input.keywords,
    recommendations.length + 1,
  );
  if (densityRec && recommendations.length < 5) {
    recommendations.push(densityRec);
  }

  // ---------- Sprint B knowledge enrichment ----------
  // For each recommendation, pattern-match its action + rationale against the
  // curated ASO knowledge base and attach a primary-source citation when one
  // fits. Recommendations that don't match any topic stay clean
  // (knowledge: null) — better to drop the citation than fabricate one.
  // Runs equally for AI- and template-synthesized recommendations.
  const enrichedRecommendations = recommendations.map((rec) => {
    const entry = getKnowledgeForRecommendation({
      action: rec.action,
      rationale: rec.rationale,
    });
    if (!entry) return rec;
    return {
      ...rec,
      knowledge: {
        topic: entry.topic,
        summary: entry.summary,
        sourceName: entry.source.name,
        sourceUrl: entry.source.url,
        ...(entry.source.section !== undefined
          ? { sourceSection: entry.source.section }
          : {}),
      },
    };
  });

  // ---------- Sprint B Expert tier extras ----------
  // Quick / Standard / legacy callers all see expertAnalysis: undefined.
  // Expert adds review-sentiment mining + explicit ASA-coverage confirmation
  // on top of the same keywordDiagnosis the lower tiers already return. We
  // assemble keywordDiagnosis once here so the ASA-coverage count is
  // computed against the exact array that ships in the response.
  const keywordDiagnosisItems = assembleKeywordDiagnosis(
    keywordScoring,
    seriesByKeyword,
    data.keywordRanks,
  );
  let expertAnalysis: ExpertAnalysis | undefined;
  if (input.tier === "expert") {
    const keywordsWithLiveAsa = keywordDiagnosisItems.filter(
      (k) =>
        k.popularitySource === "apple-search-ads" && k.popularityScore !== null,
    ).length;
    expertAnalysis = {
      reviewSentiment: analyzeReviewSentiment({
        reviewBodies: data.reviewBodies,
        reviewCoverage: data.reviewCoverage,
      }),
      asaPopularityConfirmed:
        keywordsWithLiveAsa > 0 &&
        keywordsWithLiveAsa === keywordDiagnosisItems.length,
      asaCoverage: {
        keywordsWithLiveAsa,
        totalKeywords: keywordDiagnosisItems.length,
      },
    };
  }

  // ---------- Assembly ----------
  return {
    payload: {
      reportVersion: SCHEMA_VERSION,
      dataProvenance: assembleProvenance(data.dataProvenance, inputProvenance),
      summary: synthesis.summary,
      keywordDiagnosis: keywordDiagnosisItems,
      competitorTrail: assembleCompetitorTrail(
        competitorScoring,
        data.competitors,
      ),
      metadataScore: assembleMetadataScore(metadataScoring),
      // Phase G — cross-field keyword distribution matrix. Receives the
      // (post-Phase-F) readyToPaste recommended promo text / Android
      // short desc so the matrix reflects what the user would have if
      // they accepted Sniffy's paste-able copy.
      keywordDistribution: computeKeywordDistribution({
        keywords: input.keywords,
        fields: {
          title: data.detect.appRecord?.name ?? data.detectedApp.name,
          subtitle: data.detect.appRecord?.subtitle ?? "",
          keywordsField: input.keywords,
          description: data.detect.appRecord?.description ?? "",
          promotionalText:
            synthesis.readyToPaste.promotionalText?.recommended ?? "",
          androidShortDescription:
            synthesis.readyToPaste.androidShortDescription?.recommended ?? "",
        },
        diagnosis: keywordScoring,
      }),
      recommendations: enrichedRecommendations,
      readyToPaste: synthesis.readyToPaste,
      suggestedKeywords: buildSuggestedKeywords({
        reviewBodies: data.reviewBodies,
        reviewCoverage: data.reviewCoverage,
        appName: data.detectedApp.name,
        developer: data.detectedApp.developer,
        primaryCategory:
          data.detect.appRecord?.primaryCategory ??
          data.detect.androidRecord?.primaryCategory ??
          "",
        userKeywords: input.keywords,
        competitors: competitorScoring,
        scoredCandidates,
      }),
      regressions: detectRegressions({ seriesByKeyword }),
      historySignature: historyEnabled
        ? signWildcardForRequest({
            sniffId: input.sniffId,
            store: input.store,
            country: input.country,
            appId: detectedAppId!,
          })
        : "",
      localizationAnalysis,
      targetAppSignals,
      ...(expertAnalysis !== undefined ? { expertAnalysis } : {}),
    },
    providerErrors: data.providerErrors,
    detectedApp: {
      id:
        data.detect.appRecord?.id ??
        data.detect.androidRecord?.packageName ??
        data.detectedApp.id,
      name: data.detect.appRecord?.name ?? data.detectedApp.name,
      developer:
        data.detect.appRecord?.developer ??
        data.detect.androidRecord?.developer ??
        data.detectedApp.developer,
      iconUrl:
        data.detect.appRecord?.iconUrl ??
        data.detect.androidRecord?.iconUrl ??
        null,
    },
  };
}

function buildCandidateRecordsMap(
  candidates: readonly CompetitorCandidate[],
): Map<string, AppRecord> {
  // Phase-2: competitor candidates can be iOS (record) or Android
  // (androidRecord). Scoring currently consumes AppRecord-shaped fields
  // only; for Android we synthesize a thin AppRecord adapter so the
  // scoring layer sees uniform input. The mapping is lossy on iOS-only
  // fields (subtitle, screenshots) but lets Android participate.
  const map = new Map<string, AppRecord>();
  for (const c of candidates) {
    if (c.record) {
      map.set(c.appId, c.record);
    } else if (c.androidRecord) {
      const a = c.androidRecord;
      map.set(c.appId, {
        id: a.packageName,
        name: a.name,
        developer: a.developer,
        primaryCategory: a.primaryCategory,
        description: a.description,
        ratingsSummary: a.ratingsSummary,
        screenshots: a.screenshots,
        currentVersion: "",
        provenance: a.provenance,
      });
    }
  }
  return map;
}

// Compose the final dataProvenance label for recommendations.
//
//   • All inputs live/cached  → recommendations = "inferred" (AI over real data)
//   • Any input degraded      → recommendations = "degraded" (AI over partial)
//   • Any input fixture       → recommendations = "fixture"  (sample copy)
//
// This replaces the Phase-0 lie where recommendations was always "inferred"
// regardless of upstream data quality.
function assembleProvenance(
  base: DataProvenance,
  inputProvenance: Provenance,
): DataProvenance {
  const recommendations: Provenance =
    inputProvenance === "fixture"
      ? "fixture"
      : inputProvenance === "degraded"
        ? "degraded"
        : "inferred";

  return {
    ...base,
    recommendations,
  };
}

function assembleKeywordDiagnosis(
  scoring: readonly KeywordDiagnosis[],
  seriesByKeyword: ReadonlyMap<string, readonly RankSample[]>,
  currentRanks: ReadonlyArray<{
    keyword: string;
    rankBucket: KeywordDiagnosisItem["rankBucket"];
    confidence: Confidence;
    provenance: Provenance;
    searchedDepth: number;
  }>,
): KeywordDiagnosisItem[] {
  const currentByKeyword = new Map(
    currentRanks.map((r) => [r.keyword.toLowerCase(), r] as const),
  );
  return scoring.map((d) => {
    const trend = computeTrendForKeyword(
      seriesByKeyword.get(d.keyword.toLowerCase()),
      currentByKeyword.get(d.keyword.toLowerCase()),
    );
    return {
      keyword: d.keyword,
      rankBucket: d.rankBucket,
      intentScore: d.intentScore,
      confidence: d.confidence,
      provenance: d.provenance,
      recommendation: buildKeywordRecommendation(d),
      popularityScore: d.popularityScore,
      popularitySource: d.popularitySource,
      popularityAsOf: d.popularityAsOf,
      relatedTerms: d.relatedTerms,
      trend,
      difficulty: d.difficulty,
      minDifficulty: d.minDifficulty,
      difficultyIsFallback: d.difficultyIsFallback,
      matchKind: d.matchKind,
    };
  });
}

// Compute the target-app momentum block. Returns null when the detected
// app is Android-only (no releaseDate in our AndroidAppRecord) or when
// iTunes returned a record without releaseDate (region-locked listing).
function assembleTargetAppSignals(
  appRecord: AppRecord | null,
): TargetAppSignals | null {
  if (!appRecord || !appRecord.releaseDate) return null;
  const momentum = computeMomentum({
    userRatingCount: appRecord.ratingsSummary.count,
    releaseDate: appRecord.releaseDate,
    ...(appRecord.currentVersionReleaseDate !== undefined
      ? { currentVersionReleaseDate: appRecord.currentVersionReleaseDate }
      : {}),
  });
  if (momentum.ratingsPerDay === null) return null;
  return momentum as TargetAppSignals;
}

// Compose a series that includes today's sample so computeTrend has a
// "current" datapoint. Historical series don't include today's run yet —
// we persist AFTER reading so the next /diagnose picks it up.
function computeTrendForKeyword(
  historical: readonly RankSample[] | undefined,
  current:
    | {
        rankBucket: KeywordDiagnosisItem["rankBucket"];
        confidence: Confidence;
        provenance: Provenance;
        searchedDepth: number;
      }
    | undefined,
): Trend | null {
  if (!historical || historical.length === 0 || !current) return null;
  const synthetic: RankSample = {
    position: positionFromBucket(current.rankBucket),
    bucket: current.rankBucket,
    confidence: current.confidence,
    provenance: current.provenance,
    searchedDepth: current.searchedDepth,
    sampledAt: new Date().toISOString(),
  };
  return computeTrend({ series: [...historical, synthetic] });
}

// Rough position-from-bucket midpoints — used only for trend math when
// the rank-history layer has resolution-collapsed older samples to buckets.
// Keep these in lockstep with bucketOfPosition.
function positionFromBucket(
  bucket: KeywordDiagnosisItem["rankBucket"],
): number {
  switch (bucket) {
    case "1-10":
      return 5;
    case "11-30":
      return 20;
    case "31-50":
      return 40;
    case "51-100":
      return 75;
    case "100+":
      return 150;
    case "not_found":
      return 0;
  }
}

interface BuildSuggestedInput {
  reviewBodies: readonly string[];
  reviewCoverage: "complete" | "partial" | "unavailable" | "skipped";
  appName: string;
  developer: string;
  primaryCategory: string;
  userKeywords: readonly string[];
  competitors: readonly CompetitorAnalysis[];
  // Phase 9 — gate output keyed by lowercase keyword; used to annotate
  // each suggested-keyword row with its relevance label so consumers
  // (UI, SDK, agents) can see why it surfaced and decide whether to
  // act on it.
  scoredCandidates?: readonly ScoredCandidate[];
}

// Phase 3 — build suggestedKeywords[]: terms the user *should* have
// submitted but didn't. Two sources, both labeled honestly:
//   review-frequency: tokens with high cross-review distribution that
//                     aren't already in user's keywords or the brand/category.
//                     Provenance: "inferred" (we computed frequency over live
//                     review text) — falls to "degraded" when coverage=unavailable.
//   competitor-overlap: tokens unique to a competitor's metadata that the
//                       target app doesn't carry. Provenance: matches the
//                       competitor record's provenance.
function buildSuggestedKeywords(
  input: BuildSuggestedInput,
): SuggestedKeyword[] {
  const userSet = new Set(
    input.userKeywords.flatMap((k) =>
      k.toLowerCase().split(/\s+/).filter((t) => t.length > 0),
    ),
  );
  const suggested: SuggestedKeyword[] = [];

  // Phase 9 — index gate scores by lowercased keyword so each suggestion
  // row can carry its relevance label. We surface (don't filter) off-topic
  // suggestions so the UI can show them with a visible "off-topic" tag.
  // Filtering happens at readyToPaste; suggestedKeywords stays an honest
  // catalog of what each source proposed.
  const gateIndex = new Map<string, ScoredCandidate>();
  if (input.scoredCandidates) {
    for (const c of input.scoredCandidates) {
      gateIndex.set(c.keyword.toLowerCase().trim(), c);
    }
  }

  // 1) Review-frequency terms.
  if (input.reviewCoverage !== "skipped" && input.reviewBodies.length > 0) {
    const top = reviewKeywordFrequency({
      reviewBodies: input.reviewBodies,
      brandTokens: [input.appName, input.developer],
      categoryTokens: input.primaryCategory ? [input.primaryCategory] : [],
      topN: 20,
    });
    const reviewProvenance: Provenance =
      input.reviewCoverage === "unavailable" ? "degraded" : "inferred";
    const reviewConfidence: Confidence =
      input.reviewCoverage === "complete" ? "medium" : "low";
    for (const item of top) {
      if (userSet.has(item.token)) continue;
      // Require the token to have appeared in at least 2 distinct reviews
      // before we surface it — drops one-off mentions and reviewer-specific
      // vocabulary.
      if (item.reviewCount < 2) continue;
      suggested.push({
        keyword: item.token,
        reason: "review-frequency",
        confidence: reviewConfidence,
        provenance: reviewProvenance,
        reviewCount: item.reviewCount,
        relevanceScore: null,
        relevanceLabel: null,
        relevanceSource: null,
        categoryMatch: null,
        origin: "review",
        popularity: null,
      });
      if (suggested.length >= 8) break;
    }
  }

  // 2) Competitor-overlap terms — keywords competitors carry that we don't.
  for (const competitor of input.competitors) {
    for (const term of competitor.uniqueToCompetitor.slice(0, 3)) {
      const lower = term.toLowerCase().trim();
      if (lower.length < 3) continue;
      if (userSet.has(lower)) continue;
      if (suggested.some((s) => s.keyword === lower)) continue;
      const gate = gateIndex.get(lower);
      suggested.push({
        keyword: lower,
        reason: "competitor-overlap",
        confidence: "medium",
        provenance: competitor.provenance,
        relevanceScore: gate ? gate.relevanceScore : null,
        relevanceLabel: gate ? gate.relevanceLabel : null,
        relevanceSource: gate ? "category+intent" : null,
        categoryMatch: gate ? gate.categoryMatch : null,
        origin: "competitor",
        popularity: gate ? gate.popularity : null,
      });
      if (suggested.length >= 12) break;
    }
    if (suggested.length >= 12) break;
  }

  return suggested;
}

function assembleCompetitorTrail(
  scoring: readonly CompetitorAnalysis[],
  candidates: readonly CompetitorCandidate[],
): CompetitorTrailItem[] {
  const sourceByAppId = new Map(
    candidates.map((c) => [c.appId, c.source] as const),
  );
  return scoring.map((c) => ({
    appId: c.appId,
    name: c.name,
    overlapKeywords: c.overlapKeywords,
    notes: buildCompetitorNotes(c),
    provenance: c.provenance,
    source: sourceByAppId.get(c.appId) ?? "search",
    // Phase A — surface the tier + search position on the wire so the UI
    // and SDK consumers can render a leader/peer/shoulder badge. Both
    // optional in CompetitorAnalysis (legacy callers/fixtures may omit);
    // null on the response signals "tier unknown" rather than "no tier."
    tier: c.tier ?? null,
    searchPosition: c.searchPosition ?? null,
  }));
}

function assembleMetadataScore(
  scoring: MetadataScoringResult,
): MetadataScore {
  const notes = buildMetadataNotes(scoring);
  return {
    overall: scoring.overall,
    weights: METADATA_SCORE_WEIGHTS,
    title: { score: scoring.title.score, notes: notes.title },
    subtitle: { score: scoring.subtitle.score, notes: notes.subtitle },
    keywords: { score: scoring.keywordsField.score, notes: notes.keywordsField },
    // Schema field name preserved for SDK compatibility; populated with
    // description-density score per Phase 04 decision. Sniffy doesn't extract
    // screenshot caption text — note this honestly when the user asks.
    screenshots: { score: scoring.description.score, notes: notes.description },
    ratingsAndReviews: {
      score: scoring.ratingsAndReviews.score,
      notes: scoring.ratingsAndReviews.reasons[0] ?? "",
    },
    keywordRankings: {
      score: scoring.keywordRankings.score,
      notes: scoring.keywordRankings.reasons[0] ?? "",
    },
    descriptionDensity: scoring.descriptionDensity,
  };
}

// Fetch the rank-history series for every keyword in parallel. Returns a
// Map keyed by lowercase keyword for stable lookup by the assembler.
async function readSeriesForAllKeywords(input: {
  store: Store;
  country: CountryCode;
  appId: string;
  keywords: readonly string[];
}): Promise<Map<string, RankSample[]>> {
  const entries = await Promise.all(
    input.keywords.map(async (keyword) => {
      try {
        const series = await getRankSeries({
          store: input.store,
          country: input.country,
          appId: input.appId,
          keyword,
        });
        return [keyword.toLowerCase(), series] as const;
      } catch {
        return [keyword.toLowerCase(), [] as RankSample[]] as const;
      }
    }),
  );
  return new Map(entries);
}

// Fire-and-forget persistence. Each keyword's current sample lands in its
// ZSet for next call's trend. We don't await so a Redis hiccup never 500s
// a paid /diagnose. Errors swallowed inside recordRank itself.
function fireAndForgetPersist(input: {
  store: Store;
  country: CountryCode;
  appId: string;
  keywordRanks: ReadonlyArray<{
    keyword: string;
    rankBucket: KeywordDiagnosisItem["rankBucket"];
    confidence: Confidence;
    provenance: Provenance;
    searchedDepth: number;
  }>;
}): void {
  for (const rank of input.keywordRanks) {
    // Don't persist fixture or degraded rows — they're not honest data
    // points for a trend (Phase-1 honest-floor policy).
    if (rank.provenance === "fixture" || rank.provenance === "degraded") {
      continue;
    }
    void recordRank({
      store: input.store,
      country: input.country,
      appId: input.appId,
      keyword: rank.keyword,
      position: positionFromBucket(rank.rankBucket),
      bucket: rank.rankBucket,
      confidence: rank.confidence,
      provenance: rank.provenance,
      searchedDepth: rank.searchedDepth,
    });
  }
}

// Phase 5 — fetch localized metadata across the configured storefronts
// and score the localization gap. Always includes the request's country
// in the list so the analysis covers the storefront the user cares about
// AS WELL AS the broader market. Errors per-storefront stay isolated.
async function collectLocalization(input: {
  enabled: boolean;
  store: Store;
  requestCountry: CountryCode;
  appId: string | undefined;
  targetCountries: readonly string[];
}): Promise<LocalizationAnalysisType | null> {
  if (!input.enabled) return null;
  if (input.store !== "ios") return null; // Android parity is a follow-up.
  if (!input.appId) return null;

  // De-dupe + always include the request country so the report covers the
  // storefront the user is actively asking about.
  const countries = Array.from(
    new Set(
      [input.requestCountry, ...input.targetCountries].map((c) =>
        c.toUpperCase(),
      ),
    ),
  );

  const { storefronts } = await lookupLocalized(input.appId, countries);
  const storefrontMap = new Map(Object.entries(storefronts));
  return scoreLocalization({ storefronts: storefrontMap });
}

// Phase 9 (Day 5) — pre-compute cosine similarities for the relevance
// gate. Returns null on any failure path so the orchestrator falls back
// to the Day-1 gate formula (category + intent only). Never throws.
async function computeCosineMapSafely(input: {
  enabled: boolean;
  appName: string;
  subtitle: string | undefined;
  description: string | undefined;
  primaryKeywords: readonly string[];
  candidates: readonly CandidateKeyword[];
}): Promise<Map<string, number> | null> {
  if (!input.enabled) return null;
  if (input.candidates.length === 0) return null;
  try {
    const targetText = buildTargetVectorText({
      appName: input.appName,
      ...(input.subtitle !== undefined ? { subtitle: input.subtitle } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      primaryKeywords: input.primaryKeywords,
    });
    const target = await embedText(targetText);
    const uniqueKeywords = Array.from(
      new Set(
        input.candidates
          .map((c) => c.keyword.toLowerCase().trim())
          .filter((k) => k.length > 0),
      ),
    );
    const out = new Map<string, number>();
    // Sequential to leverage the per-keyword Redis cache without
    // bursting OpenAI rate limits. For a typical /diagnose the
    // candidate pool is small (~10-30 terms) and embeddings are
    // cached for 30 days, so subsequent calls are mostly free.
    for (const keyword of uniqueKeywords) {
      try {
        const cand = await embedText(keyword);
        out.set(keyword, cosineSimilarity(target.vector, cand.vector));
      } catch {
        // Per-keyword failure: skip this keyword, keep going. The
        // gate's per-candidate path falls back to Day-1 formula when
        // cosineByKeyword has no entry for the keyword.
      }
    }
    return out;
  } catch {
    return null;
  }
}

// Re-export ReportData for downstream tests/utilities.
export type { ReportData };
export type { SynthesisOutput };
