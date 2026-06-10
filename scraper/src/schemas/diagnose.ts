import { z } from "zod";
import {
  BenchmarkRange,
  CAIP2,
  Confidence,
  CountryCode,
  FacilitatorMode,
  PaymentScheme,
  Provenance,
  RankBucket,
  RequestId,
  SniffId,
  Store,
} from "./shared.js";
import { AppIdentifier } from "./quote.js";

// Sprint B — tiered diagnose. Tier is an opt-in pricing surface; omitting it
// preserves the legacy hackathon price ($0.03 base) for existing SDK / CLI /
// MCP consumers. Tier mapping:
//   quick    — $0.05 base, rank buckets + 6-factor metadata score,
//              template-only synthesis (no AI call), no readyToPaste copy.
//   standard — $0.20 base, full AI synthesis with readyToPaste — closest to
//              the legacy default feature set.
//   expert   — $1.00 base, Standard + ASA popularity overlay confirmation,
//              broader sentiment + screenshot caption hooks (orchestrator
//              gates land in Sprint B follow-up; pricing ships first).
//
// Anonymous comparison framing (see also savingsNote on /quote): even Expert
// × 10 audits/year is $10 — still beats a typical ASO Pro Annual ($1,699)
// by ~169×.
export const DiagnoseTier = z.enum(["quick", "standard", "expert"]);
export type DiagnoseTier = z.infer<typeof DiagnoseTier>;

// Diagnose request carries the full context inline (sniffId references a prior
// quote for funnel analytics; store/app/country/keywords let the server run
// statelessly without a quote-lookup store). Keyword cap is 5 here, while
// /quote allows up to 10 — keeps paid runtime bounded.
export const DiagnoseRequest = z.object({
  sniffId: SniffId,
  store: Store,
  app: AppIdentifier,
  country: CountryCode,
  keywords: z.array(z.string().min(1)).min(1).max(5),
  tier: DiagnoseTier.optional(),
  // Wave 1 — paste-in calibration (optional, additive). Neither value is
  // publicly observable; both unlock report sections that otherwise return
  // honest nulls:
  //   currentKeywordsField — the app's ASC keyword field (max 100 chars,
  //     ASC-only). Lets the metadata-mechanics linter audit the full
  //     indexed token set instead of title+subtitle only.
  //   ascDailyImpressions — App Store Connect impressions/day (e.g.
  //     30-day impressions ÷ 30). Converts the zero-budget experiment
  //     planner from "missing data" to a real feasibility verdict.
  currentKeywordsField: z.string().max(100).optional(),
  ascDailyImpressions: z.number().positive().optional(),
});
export type DiagnoseRequest = z.infer<typeof DiagnoseRequest>;

const EvmAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "EVM address (0x-prefixed 20-byte hex)");

const DecimalAmount = z.string().regex(/^\d+(\.\d+)?$/);
const AtomicAmount = z.string().regex(/^\d+$/, "atomic (integer wei) units");

// Per x402 V2 `exact` scheme on EVM (specs/schemes/exact/scheme_exact_evm.md),
// `extra` carries the EIP-712 domain hints (name/version) and an
// `assetTransferMethod` discriminator so facilitators don't have to guess
// between EIP-3009 and Permit2. We only support EIP-3009 today.
const Eip712DomainHints = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  assetTransferMethod: z.literal("eip3009").optional(),
});

export const PaymentRequirement = z.object({
  x402Version: z.literal(2),
  scheme: PaymentScheme,
  network: CAIP2,
  facilitator: z.string().url(),
  amount: DecimalAmount,
  atomicAmount: AtomicAmount,
  decimals: z.number().int().min(0).max(36),
  asset: EvmAddress,
  payTo: EvmAddress,
  maxTimeoutSeconds: z.number().int().positive(),
  extra: Eip712DomainHints,
});
export type PaymentRequirement = z.infer<typeof PaymentRequirement>;

export const AcceptsItem = z.object({
  scheme: PaymentScheme,
  network: CAIP2,
  amount: AtomicAmount,
  asset: EvmAddress,
  payTo: EvmAddress,
  maxTimeoutSeconds: z.number().int().positive(),
  extra: Eip712DomainHints,
});
export type AcceptsItem = z.infer<typeof AcceptsItem>;

export const DiagnoseResource = z.object({
  url: z.string().min(1),
  description: z.string().optional(),
  mimeType: z.string().optional(),
});
export type DiagnoseResource = z.infer<typeof DiagnoseResource>;

export const DiagnoseUnpaidResponse = z.object({
  x402Version: z.literal(2),
  error: z.literal("payment_required"),
  sniffId: SniffId,
  resource: DiagnoseResource,
  payment: PaymentRequirement,
  accepts: z.array(AcceptsItem).min(1),
});
export type DiagnoseUnpaidResponse = z.infer<typeof DiagnoseUnpaidResponse>;

export const Receipt = z.object({
  network: CAIP2,
  facilitator: z.string().min(1),
  facilitatorMode: FacilitatorMode,
  amount: DecimalAmount,
  atomicAmount: AtomicAmount,
  asset: EvmAddress,
  // Accept the fixture marker `0xsample<hex>` and the pack-credit marker
  // `0xpack<hex>` alongside real `0x<hex>` hashes so non-onchain receipts
  // (fixture-receipt mode, pack-credit spend) still parse.
  transactionHash: z.string().regex(/^0x(?:sample|pack)?[a-fA-F0-9]+$/),
  settledAt: z.string().datetime(),
  // Payer wallet address recovered from the facilitator settle response.
  // Lowercased. Optional because fixture-receipt mode has no real payer.
  payer: EvmAddress.optional(),
});
export type Receipt = z.infer<typeof Receipt>;

export const DataProvenance = z.object({
  appMetadata: Provenance,
  keywordRank: Provenance,
  competitors: Provenance,
  recommendations: Provenance,
});
export type DataProvenance = z.infer<typeof DataProvenance>;

// Phase 4 — per-keyword trend signal. `null` represents an honest cold
// start (we never claim a trend from a single point). See scoring/trend.ts.
export const Trend = z.object({
  window: z.enum(["7d", "30d"]),
  deltaPositions: z.number().int().nullable(),
  previousBucket: RankBucket.nullable(),
  samplesCount: z.number().int().nonnegative(),
});
export type Trend = z.infer<typeof Trend>;

// Keyword-match granularity — where/how the user's listing surfaces the
// keyword. Ported from semihcihan/App-Store-Optimization-CLI (MIT) so the
// difficulty formula and our metadata scorer agree on match weight.
export const KeywordMatchKind = z.enum([
  "titleExactPhrase",
  "titleAllWords",
  "subtitleExactPhrase",
  "subtitleAllWords",
  "combinedPhrase",
  "none",
]);
export type KeywordMatchKind = z.infer<typeof KeywordMatchKind>;

export const KeywordDiagnosisItem = z.object({
  keyword: z.string().min(1),
  rankBucket: RankBucket,
  intentScore: z.number().min(0).max(1),
  confidence: Confidence,
  provenance: Provenance,
  recommendation: z.string().min(1),
  // Phase 3 — Apple Search Ads popularity score. 5..100 when live, null
  // when the popularity provider was disabled, degraded, or returned
  // not-found for this keyword. Source tells the consumer whether the
  // value came from Apple's canonical signal or our heuristic fallback.
  popularityScore: z.number().int().min(0).max(100).nullable().default(null),
  // Wave 1 — "observable-signals" is the documented headline methodology
  // (obs-1): a deterministic blend of public iTunes signals (result depth,
  // leader strength, title-match density, market depth, specificity,
  // exact-phrase, autocomplete). It replaces the unlabeled "heuristic"
  // fallback whenever enough inputs exist; "heuristic" remains for the
  // legacy intent-only estimate; "apple-search-ads" stays a labeled overlay
  // when the flag-gated ASA provider returns live data.
  popularitySource: z
    .enum(["apple-search-ads", "observable-signals", "heuristic"])
    .default("heuristic"),
  popularityAsOf: z.string().datetime().nullable().default(null),
  // Wave 1 — app-relative opportunity signals (roadmap 1.3). All nullable
  // with honest gates: chance needs the target app's own competitive score
  // plus >=3 scored competitors; kei needs both popularity and chance;
  // impressions needs a popularity score (SplitMetrics/Phiture 2019
  // exponential, shipped as a labeled range with staleness caveat).
  chance: z.number().int().min(1).max(100).nullable().default(null),
  kei: z.number().int().min(1).max(100).nullable().default(null),
  estMaxDailyImpressions: BenchmarkRange.nullable().default(null),
  // Related terms — gplay.suggest() autocompletions for the keyword.
  // Capped at 5 to keep response weight bounded.
  relatedTerms: z.array(z.string().min(1)).max(5).default([]),
  // Phase 4 — trend over the rank-history series. `null` until at least
  // two paid diagnose calls land in the same (app, country, keyword) tuple.
  trend: Trend.nullable().default(null),
  // Phase 6 — keyword difficulty derived from the top-5 competitors in the
  // same iTunes search response. 1..100 scaled. `null` +
  // `difficultyIsFallback: true` when the top-five gate trips (niche
  // keyword, rate-limit, etc.); we never fabricate the number.
  difficulty: z.number().int().min(1).max(100).nullable().default(null),
  minDifficulty: z.number().int().min(1).max(100).nullable().default(null),
  difficultyIsFallback: z.boolean().default(false),
  // How this keyword surfaces on the target listing — exact phrase in the
  // title, separated tokens, etc. Feeds the synthesis prose so the
  // recommendation can call out the cheapest single fix.
  matchKind: KeywordMatchKind.default("none"),
});
export type KeywordDiagnosisItem = z.infer<typeof KeywordDiagnosisItem>;

// Phase 6 — target-app momentum block. Surfaces the same ratings-per-day
// signal the difficulty formula uses to score competitors, applied to the
// target app so founders see their own trajectory. `null` for region-locked
// listings without a releaseDate, or when AppRecord couldn't be fetched.
export const TargetAppSignals = z.object({
  ratingsPerDay: z.number().nullable(),
  momentumLabel: z.enum(["growing", "steady", "declining"]).nullable(),
  daysSinceFirstRelease: z.number().int().positive().nullable(),
  daysSinceLastRelease: z.number().int().nonnegative().nullable(),
});
export type TargetAppSignals = z.infer<typeof TargetAppSignals>;

// Phase 4 — rank-regression alerts. Keywords whose current position dropped
// ≥10 positions vs their 7-day rolling median.
export const RegressionItem = z.object({
  keyword: z.string().min(1),
  previousBucket: RankBucket,
  currentBucket: RankBucket,
  deltaPositions: z.number().int(),
  samplesCount: z.number().int().nonnegative(),
});
export type RegressionItem = z.infer<typeof RegressionItem>;

// Paste-ready translated copy for a mismatched storefront. Additive in the
// schema — old SDK consumers see this as `null` when the translation layer
// is disabled / fails / hasn't run. `source: "openai"` means the strings
// are LLM-translated; `source: "deferred"` means we surfaced a "translate
// this listing" recommendation instead and the strings are nulled out.
export const LocalizationRecommendedCopy = z.object({
  title: z.string().nullable(),
  subtitle: z.string().nullable(),
  shortDescription: z.string().nullable(),
  source: z.enum(["openai", "deferred"]),
});
export type LocalizationRecommendedCopy = z.infer<
  typeof LocalizationRecommendedCopy
>;

// Phase 5 — per-storefront localization gap detail.
export const LocalizationStorefront = z.object({
  country: CountryCode,
  title: z.string(),
  primaryCategory: z.string(),
  descriptionLength: z.number().int().nonnegative(),
  descriptionLanguage: z.string().nullable(),
  expectedLanguages: z.array(z.string()),
  localized: z.boolean().nullable(),
  gapScore: z.number().int().min(0).max(100),
  error: z.string().nullable(),
  // Additive: translated copy for mismatched storefronts when OpenAI is
  // configured. Default null preserves backward compatibility with
  // existing SDK consumers and cached fixtures.
  recommendedCopy: LocalizationRecommendedCopy.nullable().default(null),
});
export type LocalizationStorefront = z.infer<typeof LocalizationStorefront>;

export const LocalizationAnalysis = z.object({
  storefronts: z.array(LocalizationStorefront),
  titleVariants: z.array(z.string()),
  overallGapScore: z.number().int().min(0).max(100).nullable(),
  unlocalizedCount: z.number().int().nonnegative(),
  detectionMinChars: z.number().int().positive(),
});
export type LocalizationAnalysis = z.infer<typeof LocalizationAnalysis>;

// Phase 9 — Relevance gate annotations. Surface per-candidate-keyword
// labels so consumers (SDK, UI, agents) can see WHY a term was suggested
// and where it came from.
export const RelevanceLabelSchema = z.enum([
  "on-topic",
  "adjacent",
  "off-topic",
]);
export type RelevanceLabelSchema = z.infer<typeof RelevanceLabelSchema>;

export const CandidateOriginSchema = z.enum([
  "user",
  "competitor",
  "autocomplete",
  "asa-rec",
  "review",
]);
export type CandidateOriginSchema = z.infer<typeof CandidateOriginSchema>;

// Suggested keywords — Phase 3. Terms the user *should* have submitted
// but didn't, derived from review-frequency analysis + competitor-overlap.
// Always live behind a paid /diagnose response. Phase 9 additions are
// .nullable().default(null) for SDK backward compatibility — older
// consumers see the field as null rather than a missing-key error.
export const SuggestedKeyword = z.object({
  keyword: z.string().min(1),
  reason: z.enum(["review-frequency", "competitor-overlap"]),
  confidence: Confidence,
  provenance: Provenance,
  // Optional supporting count for review-frequency: how many distinct
  // reviews this token appeared in. Helps the UI decide which to surface
  // prominently.
  reviewCount: z.number().int().nonnegative().optional(),
  // Phase 9 — relevance gate annotations. Null defaults preserve back-
  // compat with pre-phase-9 fixtures and SDK consumers.
  relevanceScore: z.number().min(0).max(1).nullable().default(null),
  relevanceLabel: RelevanceLabelSchema.nullable().default(null),
  relevanceSource: z.string().nullable().default(null),
  categoryMatch: z.boolean().nullable().default(null),
  origin: CandidateOriginSchema.nullable().default(null),
  popularity: z.number().nullable().default(null),
});
export type SuggestedKeyword = z.infer<typeof SuggestedKeyword>;

export const CompetitorTrailItem = z.object({
  appId: z.string().min(1),
  name: z.string().min(1),
  overlapKeywords: z.array(z.string().min(1)),
  notes: z.string(),
  provenance: Provenance,
  // Where the competitor candidate originated. iOS uses search-over-first-keyword;
  // Android uses gplay.similar() (algorithmic "more like this"). Defaults to
  // "search" for back-compat — historical fixtures don't carry the field.
  source: z.enum(["search", "similar"]).default("search"),
  // Phase A — competitor tier (positions 1-5 leader / 6-10 peer / 11-15
  // shoulder) and 1-indexed search position. Optional + default null for
  // back-compat with pre-Phase-A fixtures and legacy SDK consumers; the
  // synthesis layer already weights opportunity-pool tokens by tier
  // internally, and exposing tier here lets the UI render a leader/peer/
  // shoulder badge alongside each competitor.
  tier: z.enum(["leader", "peer", "shoulder"]).nullable().default(null),
  searchPosition: z.number().int().positive().nullable().default(null),
});
export type CompetitorTrailItem = z.infer<typeof CompetitorTrailItem>;

export const MetadataSubscore = z.object({
  score: z.number().min(0).max(100),
  notes: z.string(),
});
export type MetadataSubscore = z.infer<typeof MetadataSubscore>;

// Phase G — per-keyword cross-field distribution. The matrix that answers
// "where does this keyword appear across my listing?" for every user
// keyword, plus actionable next-move suggestions per row.
export const KeywordPresence = z.enum(["exact", "tokens", "duplicate", "absent"]);
export type KeywordPresence = z.infer<typeof KeywordPresence>;

export const KeywordDistributionLocations = z.object({
  title: KeywordPresence,
  subtitle: KeywordPresence,
  keywordsField: KeywordPresence,
  description: KeywordPresence,
  promotionalText: KeywordPresence,
  androidShortDescription: KeywordPresence,
});
export type KeywordDistributionLocations = z.infer<typeof KeywordDistributionLocations>;

export const KeywordDistributionRow = z.object({
  keyword: z.string().min(1),
  locations: KeywordDistributionLocations,
  moves: z.array(z.string()).default([]),
});
export type KeywordDistributionRow = z.infer<typeof KeywordDistributionRow>;

// Phase H — per-keyword density of exact-phrase mentions in the description.
// 1 mention per ~250 chars is the target (per 2026 ASO references).
// `polarity === "under"` is the actionable case — surfaced as a "Lift
// mentions of X in description from N to M" recommendation card.
export const DescriptionDensityRow = z.object({
  keyword: z.string().min(1),
  count: z.number().int().nonnegative(),
  charsPerMention: z.number().int().positive().nullable(),
  target: z.number().int().nonnegative(),
  polarity: z.enum(["under", "at", "over"]),
});
export type DescriptionDensityRow = z.infer<typeof DescriptionDensityRow>;

// Weighted 6-factor Score Card. Weights sum to 100; `overall` is the
// weighted sum of subscores. Each weight is a `z.literal()` so any future
// reweighting is a deliberate schema bump that surfaces in every consumer.
// Sniffy doesn't extract screenshot caption text — the `screenshots`
// subscore is a description-density heuristic preserved under the original
// name for SDK back-compat; the human-readable `notes` field calls that out.
export const MetadataScoreWeights = z.object({
  title: z.literal(20),
  subtitle: z.literal(15),
  keywords: z.literal(20),
  screenshots: z.literal(10),
  ratingsAndReviews: z.literal(15),
  keywordRankings: z.literal(20),
});
export type MetadataScoreWeights = z.infer<typeof MetadataScoreWeights>;

export const METADATA_SCORE_WEIGHTS: MetadataScoreWeights = {
  title: 20,
  subtitle: 15,
  keywords: 20,
  screenshots: 10,
  ratingsAndReviews: 15,
  keywordRankings: 20,
};

export const MetadataScore = z.object({
  overall: z.number().min(0).max(100),
  weights: MetadataScoreWeights.default(METADATA_SCORE_WEIGHTS),
  title: MetadataSubscore,
  subtitle: MetadataSubscore,
  keywords: MetadataSubscore,
  screenshots: MetadataSubscore,
  // Score derived from app.ratingsSummary (average × count tiers). Reflects
  // social proof / rating health, which Apple's algorithm treats as a
  // ranking signal alongside metadata. `score: 0, notes: ...` when ratings
  // are unavailable — never fabricated.
  ratingsAndReviews: MetadataSubscore.default({
    score: 0,
    notes: "Ratings data unavailable.",
  }),
  // Score derived from coverage of submitted keywords in top10/top50/top100
  // rank buckets. Computed post-diagnose so the rubric reflects actual
  // ranks. `score: 0, notes: ...` when diagnosis was unavailable.
  keywordRankings: MetadataSubscore.default({
    score: 0,
    notes: "Keyword ranking data unavailable.",
  }),
  // Additive: populated for non-fixture diagnose runs. Empty array for
  // legacy/fixture paths so old SDK consumers see a safe default.
  descriptionDensity: z.array(DescriptionDensityRow).default([]),
});
export type MetadataScore = z.infer<typeof MetadataScore>;

// Sprint B — knowledge citation. Attached to recommendations during the
// orchestrator's enrichment pass when a synthesis output matches a curated
// topic from scoring/aso-knowledge.ts. Sources are always primary docs
// (Apple HIG, Apple Search Ads, App Store Connect Help, Play Store policy);
// never third-party blog or tool vendor wording. Null/omitted on
// recommendations that don't pattern-match any topic — better to drop the
// citation than invent one.
export const KnowledgeCitation = z.object({
  topic: z.string().min(1),
  summary: z.string().min(1),
  sourceName: z.string().min(1),
  sourceUrl: z.string().url(),
  sourceSection: z.string().optional(),
});
export type KnowledgeCitation = z.infer<typeof KnowledgeCitation>;

export const RecommendationItem = z.object({
  rank: z.number().int().positive(),
  action: z.string().min(1),
  impact: z.enum(["high", "medium", "low"]),
  effort: z.enum(["high", "medium", "low"]),
  rationale: z.string().min(1),
  // Optional — attached by the orchestrator's knowledge-enrichment pass when
  // the recommendation's action+rationale matches a curated topic. Omitted
  // when no topic matches (better to drop the citation than fabricate one).
  // Pre-Sprint-B SDK consumers see `knowledge: undefined`; cached fixtures
  // parse unchanged.
  knowledge: KnowledgeCitation.optional(),
});
export type RecommendationItem = z.infer<typeof RecommendationItem>;

// Per-field structure used by `readyToPaste`. `recommended === null` is the
// honest "no change" signal — the field is already optimal and the UI should
// surface a NO CHANGE state rather than echoing `current` back. Agents
// consuming the SDK branch on this to avoid rewriting a listing into itself.
export const ReadyToPasteField = z.object({
  current: z.string(),
  recommended: z.string().nullable(),
  changeReason: z.string().nullable(),
  charCount: z.number().int().nonnegative(),
  charLimit: z.number().int().positive(),
});
export type ReadyToPasteField = z.infer<typeof ReadyToPasteField>;

// `source` distinguishes deterministic ranked-rewrite from the AI path so the
// founder (and tests) can see which engine produced the recommendation.
// `template-fallback` is reserved for the legacy stock-copy path — present
// only as a defensive value; the deterministic rewriter has replaced it.
export const ReadyToPasteSource = z.enum([
  "ai",
  "deterministic",
  "template-fallback",
]);
export type ReadyToPasteSource = z.infer<typeof ReadyToPasteSource>;

export const ReadyToPaste = z.object({
  title: ReadyToPasteField,
  subtitle: ReadyToPasteField,
  keywordsField: ReadyToPasteField,
  // Apple App Store promotional text — 170 chars, sits above the description
  // on the iOS listing page, and (per Apple) can be refreshed without a new
  // App Review submission. Modeled as a separate paste-able slot from
  // `shortDescription` because the previous 240-char `shortDescription`
  // doesn't map to any real Apple field. Defaults to null so older SDK
  // consumers don't break.
  promotionalText: ReadyToPasteField.nullable().default(null),
  // Google Play short description — 80 chars, IS indexed for Play search,
  // distinct from iOS promotional text. Defaults to null.
  androidShortDescription: ReadyToPasteField.nullable().default(null),
  // Legacy 240-char slot — kept for back-compat with existing SDK / CLI /
  // MCP consumers. Deterministic synthesis still emits it. The two new
  // sibling fields are the platform-correct replacements; downstream
  // consumers should prefer those when present.
  shortDescription: ReadyToPasteField,
  source: ReadyToPasteSource,
});
export type ReadyToPaste = z.infer<typeof ReadyToPaste>;

// Sprint B — Expert tier review sentiment block. Heuristic-only (no LLM
// call) so the analysis is fully deterministic + auditable; same review
// bodies feed the existing suggestedKeywords[reason="review-frequency"]
// pipeline. Returns null when review coverage is too thin to be meaningful
// (current threshold: 5 reviews) — the route surfaces a null block rather
// than fabricating sentiment over a handful of reviews.
export const ReviewSentiment = z.object({
  positivePercent: z.number().min(0).max(100),
  neutralPercent: z.number().min(0).max(100),
  negativePercent: z.number().min(0).max(100),
  totalReviewsAnalyzed: z.number().int().nonnegative(),
  topComplaintThemes: z
    .array(
      z.object({
        theme: z.string().min(1),
        sampleCount: z.number().int().positive(),
      }),
    )
    .max(5),
});
export type ReviewSentiment = z.infer<typeof ReviewSentiment>;

// Sprint B — Expert tier block. asaPopularityConfirmed is true when every
// keyword in keywordDiagnosis got a non-null ASA popularityScore from the
// live Apple Search Ads provider (not the heuristic fallback). When
// asaPopularityConfirmed is false, asaCoverage breaks down how many
// keywords actually had live ASA so consumers can show "5 of 7 keywords
// covered" rather than a binary yes/no.
export const ExpertAnalysis = z.object({
  reviewSentiment: ReviewSentiment.nullable(),
  asaPopularityConfirmed: z.boolean(),
  asaCoverage: z.object({
    keywordsWithLiveAsa: z.number().int().nonnegative(),
    totalKeywords: z.number().int().nonnegative(),
  }),
});
export type ExpertAnalysis = z.infer<typeof ExpertAnalysis>;

// Wave 1 (roadmap 1.4) — deterministic iOS metadata mechanics lint.
// Simulation of documented indexing rules over public metadata (title,
// subtitle) plus the optional paste-in keyword field; NOT a live
// measurement, hence provenance "inferred". Every finding distinguishes
// apple-documented rules from community-tested lore (verification-verdicts
// framing). reviewSafety flags generated/paste-in metadata that risks App
// Review or Play policy enforcement — run on readyToPaste output before it
// ships to the user.
export const MechanicsFinding = z.object({
  kind: z.enum([
    "cross-field-duplicate",
    "plural-duplicate",
    "camelcase-hidden-split",
    "auto-indexed-word",
    "keyword-field-format",
  ]),
  field: z.enum(["title", "subtitle", "keywordsField"]),
  token: z.string().min(1),
  detail: z.string().min(1),
  charsWasted: z.number().int().min(0),
  ruleProvenance: z.enum(["apple-documented", "community-tested"]),
});
export type MechanicsFinding = z.infer<typeof MechanicsFinding>;

export const ReviewRiskFlag = z.object({
  field: z.string().min(1),
  term: z.string().min(1),
  rule: z.string().min(1),
  severity: z.enum(["warning", "likely-violation"]),
  store: Store,
});
export type ReviewRiskFlag = z.infer<typeof ReviewRiskFlag>;

export const MetadataMechanics = z.object({
  totalCharsWasted: z.number().int().min(0),
  findings: z.array(MechanicsFinding),
  distinctIndexedTokens: z.number().int().min(0),
  phrasePermutations: z.number().int().min(0),
  phrasePermutationsIfFixed: z.number().int().min(0),
  notes: z.array(z.string()),
  // True when the linter saw the real ASC keyword field (paste-in
  // calibration); false means title+subtitle only.
  keywordsFieldProvided: z.boolean(),
  reviewSafety: z.array(ReviewRiskFlag),
  provenance: z.literal("inferred"),
});
export type MetadataMechanics = z.infer<typeof MetadataMechanics>;

// Wave 1 (roadmap 1.2) — deterministic core of the conversion audit. The
// multiplicative gate on every discovery surface: rating economics
// (third-party curve, shipped as attributed ranges), the per-territory iOS
// rating-reset lever, and the zero-budget experiment feasibility plan.
// The creative/vision pass (captions, screenshot stack vs top-10) lands
// behind VISION_CREATIVE_ENABLED in a later wave — this block is the
// always-on deterministic floor. Provenance "inferred" throughout: these
// are estimates from public signals + vendor benchmarks, not measurements.
export const ConversionRatingEconomics = z.object({
  ratingMultiplier: BenchmarkRange.nullable(),
  ratingBand: z
    .enum(["below-suppression", "below-credibility", "credible", "top-cluster"])
    .nullable(),
  bandNote: z.string().nullable(),
  categoryCvrBaseline: BenchmarkRange.nullable(),
  estimatedConversionIndex: BenchmarkRange.nullable(),
  thinVolume: z.boolean(),
});
export type ConversionRatingEconomics = z.infer<typeof ConversionRatingEconomics>;

export const RatingResetAdvice = z.object({
  stance: z.enum(["consider", "avoid", "insufficient-data"]),
  rationale: z.string().min(1),
  mechanics: z.string().min(1),
});
export type RatingResetAdvice = z.infer<typeof RatingResetAdvice>;

export const ExperimentPlan = z.object({
  feasible: z.boolean().nullable(),
  daysToSignificance: z
    .object({ low: z.number(), high: z.number() })
    .nullable(),
  assumptions: z.array(z.string()),
  recommendation: z.string().min(1),
  suggestedFirstTest: z.enum(["screenshots", "icon", "video"]).nullable(),
  platformPath: z.string().min(1),
});
export type ExperimentPlan = z.infer<typeof ExperimentPlan>;

export const ConversionAudit = z.object({
  ratingEconomics: ConversionRatingEconomics,
  ratingReset: RatingResetAdvice.nullable(),
  experimentPlan: ExperimentPlan,
  provenance: z.literal("inferred"),
});
export type ConversionAudit = z.infer<typeof ConversionAudit>;

export const DiagnosePaidResponse = z.object({
  requestId: RequestId,
  sniffId: SniffId,
  reportVersion: z.string().min(1),
  receipt: Receipt,
  dataProvenance: DataProvenance,
  summary: z.string().min(1),
  keywordDiagnosis: z.array(KeywordDiagnosisItem),
  competitorTrail: z.array(CompetitorTrailItem),
  metadataScore: MetadataScore,
  // Phase G — cross-field keyword distribution matrix. One row per user
  // keyword with its presence across all 6 metadata fields plus action-
  // able "next move" prose. Default empty so older fixtures + clients
  // not yet aware of the matrix surface still parse cleanly.
  keywordDistribution: z.array(KeywordDistributionRow).default([]),
  recommendations: z.array(RecommendationItem),
  readyToPaste: ReadyToPaste,
  // Phase 3 — review-derived suggestions + competitor-derived overlap terms.
  // Optional default empty so older fixtures parse without modification.
  suggestedKeywords: z.array(SuggestedKeyword).default([]),
  // Phase 4 — rank-regression alerts surfaced when current rank dropped
  // ≥10 positions vs the 7-day rolling median for any tracked keyword.
  // Default empty so cold-start callers (first /diagnose, no history yet)
  // and older fixtures both parse cleanly.
  regressions: z.array(RegressionItem).default([]),
  // Phase 4 — HMAC the SDK uses to fetch /api/v1/aso/history.
  // Default empty string so fixtures + tests that don't exercise history
  // parse cleanly; production callers always receive a real signature
  // (the orchestrator mints one per response when RANK_HISTORY_ENABLED).
  historySignature: z.string().default(""),
  // Phase 5 — multi-storefront localization gap analysis. `null` when
  // LOCALIZATION_ENABLED=false or the underlying multi-storefront fetch
  // produced no usable storefronts. Default null preserves cold-start
  // compatibility with existing fixtures + tests.
  localizationAnalysis: LocalizationAnalysis.nullable().default(null),
  // Phase 6 — target-app momentum block (ratings-per-day + trajectory).
  // `null` for region-locked listings without releaseDate or when AppRecord
  // couldn't be fetched. Default null keeps every existing fixture parsing.
  targetAppSignals: TargetAppSignals.nullable().default(null),
  // Wave 1 — deterministic iOS metadata mechanics lint (roadmap 1.4).
  // `null` for android-store runs (the simulated rules are iOS indexing
  // mechanics) and when no AppRecord was fetched. Default null keeps every
  // existing fixture + cached report parsing.
  metadataMechanics: MetadataMechanics.nullable().default(null),
  // Wave 1 — deterministic conversion audit (roadmap 1.2). `null` when no
  // ratings data could be fetched. Default null preserves fixture compat.
  conversionAudit: ConversionAudit.nullable().default(null),
  // Sprint B — Sniff Pack credit spend block. Populated when /diagnose ran
  // against an authenticated SIWE wallet with a positive Pack balance. The
  // associated Receipt has facilitatorMode="pack-credit" and amount="0.00"
  // — no on-chain settlement. Null/omitted for x402-paid runs and legacy
  // callers preserves backward compatibility with cached fixtures.
  packCredit: z
    .object({
      wallet: EvmAddress,
      creditsConsumed: z.number().int().positive(),
      balanceRemaining: z.number().int().nonnegative(),
    })
    .nullable()
    .default(null),
  // Sprint B — Expert-tier extras. Populated only when DiagnoseRequest.tier
  // === "expert". The block adds review-sentiment mining over the same
  // review bodies the suggestedKeywords path already consumes, plus an
  // explicit confirmation that ASA popularity ran live for every keyword.
  // Lower tiers (and pre-Expert SDK consumers) see expertAnalysis: undefined.
  expertAnalysis: ExpertAnalysis.optional(),
});
export type DiagnosePaidResponse = z.infer<typeof DiagnosePaidResponse>;
