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

export const AppIdentifier = z.union([
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

export const ShallowScan = z.object({
  title: z.string(),
  subtitle: z.string(),
  primaryCategory: z.string(),
  ratingsSummary: RatingsSummary,
  previewKeyword: PreviewKeyword,
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
