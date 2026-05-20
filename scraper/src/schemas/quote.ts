import { z } from "zod";
import {
  Confidence,
  CountryCode,
  Coverage,
  Provenance,
  RankBucket,
  RequestId,
  SniffId,
  Store,
} from "./shared.js";

// Accept either a flat string (URL / numeric app ID / app name — auto-detected
// downstream in lib/app-identifier.ts) or the explicit tagged form. The flat
// form keeps the surface agent-friendly: callers can just paste an App Store
// URL without learning the tagged union.
export const AppIdentifier = z.union([
  z.string().min(1),
  z.object({ kind: z.literal("appId"), value: z.string().min(1) }),
  z.object({ kind: z.literal("url"), value: z.string().url() }),
  z.object({ kind: z.literal("name"), value: z.string().min(1) }),
]);
export type AppIdentifier = z.infer<typeof AppIdentifier>;

export const QuoteRequest = z.object({
  store: Store,
  app: AppIdentifier,
  country: CountryCode,
  keywords: z.array(z.string().min(1)).min(1).max(10),
});
export type QuoteRequest = z.infer<typeof QuoteRequest>;

export const DetectedApp = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  developer: z.string().min(1),
});
export type DetectedApp = z.infer<typeof DetectedApp>;

export const PricingBreakdownItem = z.object({
  label: z.string().min(1),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
});
export type PricingBreakdownItem = z.infer<typeof PricingBreakdownItem>;

export const Pricing = z.object({
  currency: z.string().min(1),
  network: z.string().min(1),
  estimatedTotal: z.string().regex(/^\d+(\.\d+)?$/),
  breakdown: z.array(PricingBreakdownItem).min(1),
});
export type Pricing = z.infer<typeof Pricing>;

export const RatingsSummary = z.object({
  average: z.number().min(0).max(5),
  count: z.number().int().nonnegative(),
});
export type RatingsSummary = z.infer<typeof RatingsSummary>;

export const PreviewKeyword = z.object({
  keyword: z.string().min(1),
  rankBucket: RankBucket,
  confidence: Confidence,
  provenance: Provenance,
});
export type PreviewKeyword = z.infer<typeof PreviewKeyword>;

// When app-identity detection is ambiguous (similarity below threshold), we
// surface the top candidates so the UI can ask "did you mean…?" before the
// user pays for /diagnose. Empty array when detection is high-confidence.
export const ShallowScanCandidate = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  developer: z.string().min(1),
  iconUrl: z.string().url().optional(),
  similarityScore: z.number().min(0).max(1),
});
export type ShallowScanCandidate = z.infer<typeof ShallowScanCandidate>;

export const ShallowScan = z.object({
  title: z.string(),
  subtitle: z.string(),
  primaryCategory: z.string(),
  ratingsSummary: RatingsSummary,
  previewKeyword: PreviewKeyword,
  detectionConfidence: Confidence.default("high"),
  candidates: z.array(ShallowScanCandidate).default([]),
  // Phase 5 — signals that localizationAnalysis is available behind the
  // paid /diagnose endpoint. Free /quote callers can show "Run paid
  // diagnose to see localization gaps" without leaking the actual gap.
  localizationAvailable: z.boolean().default(true),
});
export type ShallowScan = z.infer<typeof ShallowScan>;

export const QuoteResponse = z.object({
  requestId: RequestId,
  sniffId: SniffId,
  store: Store,
  country: CountryCode,
  detectedApp: DetectedApp,
  pricing: Pricing,
  coverage: Coverage,
  shallowScan: ShallowScan,
  next: z.object({
    paidEndpoint: z.string().min(1),
  }),
});
export type QuoteResponse = z.infer<typeof QuoteResponse>;
