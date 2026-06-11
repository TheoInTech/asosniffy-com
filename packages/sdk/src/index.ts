export {
  SCHEMA_VERSION,
  Provenance,
  Confidence,
  Store,
  CountryCode,
  CAIP2,
  SniffId,
  RequestId,
  Coverage,
  RankBucket,
  AppIdentifier,
  QuoteRequest,
  QuoteResponse,
  DetectedApp,
  Pricing,
  PricingBreakdownItem,
  RatingsSummary,
  PreviewKeyword,
  ShallowScan,
  DiagnoseRequest,
  DiagnoseUnpaidResponse,
  DiagnosePaidResponse,
  PaymentRequirement,
  Receipt,
  DataProvenance,
  KeywordDiagnosisItem,
  CompetitorTrailItem,
  MetadataScore,
  MetadataSubscore,
  RecommendationItem,
  ReadyToPaste,
  ReadyToPasteField,
  ReadyToPasteSource,
  SampleResponse,
  KeywordMatchKind,
  TargetAppSignals,
} from "@sniffy/scraper/schemas";

export { PaymentRequiredError } from "./errors.js";
export { createSniffy } from "./client.js";
export type {
  CreateSniffyOptions,
  DiagnoseOptions,
  SignerLike,
  SniffyClient,
} from "./client.js";
// Trust-the-server response handling: the SDK never throws away or strips a
// server response on schema skew (the buyer may have paid for it). Supply a
// custom sink via createSniffy({ onSchemaWarning }) to capture skew warnings.
export {
  parseTrusted,
  defaultSchemaWarningSink,
  type SchemaWarning,
  type SchemaWarningSink,
} from "./parse.js";
