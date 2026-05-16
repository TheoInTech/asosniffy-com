import { z } from "zod";
import {
  CAIP2,
  Confidence,
  FacilitatorMode,
  PaymentScheme,
  Provenance,
  RankBucket,
  RequestId,
  SniffId,
} from "./shared.js";

export const DiagnoseRequest = z.object({
  sniffId: SniffId,
});
export type DiagnoseRequest = z.infer<typeof DiagnoseRequest>;

const EvmAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "EVM address (0x-prefixed 20-byte hex)");

const DecimalAmount = z.string().regex(/^\d+(\.\d+)?$/);
const AtomicAmount = z.string().regex(/^\d+$/, "atomic (integer wei) units");

const Eip712DomainHints = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
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
  // Accept the fixture marker `0xsample<hex>` alongside real `0x<hex>` hashes
  // so fixture-receipt mode produces a Receipt that still parses.
  transactionHash: z.string().regex(/^0x(?:sample)?[a-fA-F0-9]+$/),
  settledAt: z.string().datetime(),
});
export type Receipt = z.infer<typeof Receipt>;

export const DataProvenance = z.object({
  appMetadata: Provenance,
  keywordRank: Provenance,
  competitors: Provenance,
  recommendations: Provenance,
});
export type DataProvenance = z.infer<typeof DataProvenance>;

export const KeywordDiagnosisItem = z.object({
  keyword: z.string().min(1),
  rankBucket: RankBucket,
  intentScore: z.number().min(0).max(1),
  confidence: Confidence,
  provenance: Provenance,
  recommendation: z.string().min(1),
});
export type KeywordDiagnosisItem = z.infer<typeof KeywordDiagnosisItem>;

export const CompetitorTrailItem = z.object({
  appId: z.string().min(1),
  name: z.string().min(1),
  overlapKeywords: z.array(z.string().min(1)),
  notes: z.string(),
  provenance: Provenance,
});
export type CompetitorTrailItem = z.infer<typeof CompetitorTrailItem>;

export const MetadataSubscore = z.object({
  score: z.number().min(0).max(100),
  notes: z.string(),
});
export type MetadataSubscore = z.infer<typeof MetadataSubscore>;

export const MetadataScore = z.object({
  overall: z.number().min(0).max(100),
  title: MetadataSubscore,
  subtitle: MetadataSubscore,
  keywords: MetadataSubscore,
  screenshots: MetadataSubscore,
});
export type MetadataScore = z.infer<typeof MetadataScore>;

export const RecommendationItem = z.object({
  rank: z.number().int().positive(),
  action: z.string().min(1),
  impact: z.enum(["high", "medium", "low"]),
  effort: z.enum(["high", "medium", "low"]),
  rationale: z.string().min(1),
});
export type RecommendationItem = z.infer<typeof RecommendationItem>;

export const ReadyToPaste = z.object({
  title: z.string(),
  subtitle: z.string(),
  keywordsField: z.string(),
  shortDescription: z.string(),
});
export type ReadyToPaste = z.infer<typeof ReadyToPaste>;

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
  recommendations: z.array(RecommendationItem),
  readyToPaste: ReadyToPaste,
});
export type DiagnosePaidResponse = z.infer<typeof DiagnosePaidResponse>;
