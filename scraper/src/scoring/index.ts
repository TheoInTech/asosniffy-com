export {
  intentScore,
  intentBucket,
  popularityWeightedIntent,
} from "./intent.js";
export {
  reviewKeywordFrequency,
  type KeywordFrequencyItem,
  type KeywordFrequencyInput,
} from "./review-keywords.js";
export {
  computeTrend,
  type Trend,
  type TrendWindow,
  type ComputeTrendInput,
} from "./trend.js";
export {
  detectRegressions,
  type RegressionItem,
  type DetectRegressionsInput,
} from "./regressions.js";
export {
  scoreLocalization,
  type LocalizationAnalysis,
  type LocalizationStorefrontDetail,
  type ScoreLocalizationInput,
} from "./localization.js";
export {
  bucketOfPosition,
  deriveKeywordConfidence,
  identityConfidenceFromScore,
  provenanceForProviderStatus,
  type KeywordConfidenceInputs,
  type ProviderStatus,
} from "./confidence.js";
export {
  scoreMetadata,
  scoreMetadataFull,
  scoreRatingsAndReviews,
  scoreKeywordRankings,
  composeOverall,
  computeDescriptionDensity,
  METADATA_WEIGHTS,
  APPLE_CAPS,
  type MetadataScoringResult,
  type MetadataSubscoreInternal,
  type DescriptionDensityRow,
  type ScoreMetadataInput,
  type RankedKeywordInput,
} from "./metadata.js";
export {
  diagnoseKeywords,
  type KeywordDiagnosis,
  type KeywordAction,
  type DiagnoseKeywordsInput,
  type KeywordPopularityInfo,
} from "./keyword-diagnosis.js";
export {
  analyzeCompetitors,
  type CompetitorAnalysis,
  type AnalyzeCompetitorsInput,
} from "./competitors.js";
export {
  computeKeywordDistribution,
  type KeywordPresence,
  type KeywordDistributionLocations,
  type KeywordDistributionRow,
  type ComputeKeywordDistributionInput,
} from "./keyword-distribution.js";
export {
  scoreCandidates,
  buildCandidatesFromCompetitors,
  isOnTopicOrAdjacent,
  type CandidateOrigin,
  type RelevanceLabel,
  type CandidateKeyword,
  type AppContext,
  type CompetitorRef,
  type ScoreCandidatesInput,
  type ScoredCandidate,
} from "./relevance.js";
