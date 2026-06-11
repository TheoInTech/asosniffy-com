import { z } from "zod";

// Provenance taxonomy:
//   live      - fetched live this request from the source-of-truth provider
//   cached    - reused from a prior successful fetch (Upstash or in-memory)
//   degraded  - tried live, provider returned a classified error, no cached
//               data available; the row is intentionally empty (NOT a fake)
//   fixture   - demo/sample data; only allowed in /sample, never in /diagnose
//   inferred  - produced by deterministic scoring or AI synthesis over
//               non-fixture inputs (if any input is fixture or degraded, the
//               worst-case label propagates and this is NOT "inferred")
export const Provenance = z.enum([
  "live",
  "cached",
  "degraded",
  "fixture",
  "inferred",
]);
export type Provenance = z.infer<typeof Provenance>;

export const Confidence = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof Confidence>;

export const Store = z.enum(["ios", "android"]);
export type Store = z.infer<typeof Store>;

export const CountryCode = z
  .string()
  .regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2 uppercase country code");
export type CountryCode = z.infer<typeof CountryCode>;

export const CAIP2 = z
  .string()
  .regex(/^eip155:\d+$/, "CAIP-2 identifier, eip155:<chainId>");
export type CAIP2 = z.infer<typeof CAIP2>;

export const SniffId = z.string().regex(/^sniff_[A-Za-z0-9_-]+$/);
export type SniffId = z.infer<typeof SniffId>;

export const RequestId = z.string().regex(/^req_[A-Za-z0-9_-]+$/);
export type RequestId = z.infer<typeof RequestId>;

// `status` summarizes provider outcomes across the whole response:
//   ok            - all live or cached, full data
//   partial       - some live/cached, some degraded (provider error)
//   degraded      - no live data, all rows degraded; no fixture substitute
//   fixture_only  - allowed only in /sample
export const CoverageStatus = z.enum([
  "ok",
  "partial",
  "degraded",
  "fixture_only",
]);
export type CoverageStatus = z.infer<typeof CoverageStatus>;

export const CoverageProviderError = z.object({
  provider: z.string().min(1),
  kind: z.enum([
    "rate_limited",
    "schema_drift",
    "not_found",
    "upstream_unavailable",
    "network_error",
    "partial",
  ]),
  message: z.string().min(1),
  retryAfterSec: z.number().int().nonnegative().optional(),
});
export type CoverageProviderError = z.infer<typeof CoverageProviderError>;

export const Coverage = z.object({
  appMetadata: Confidence,
  keywordRank: Confidence,
  competitorTrail: Confidence,
  reviews: Confidence,
  status: CoverageStatus.default("ok"),
  providerErrors: z.array(CoverageProviderError).default([]),
});
export type Coverage = z.infer<typeof Coverage>;

export const RankBucket = z.enum([
  "1-10",
  "11-30",
  "31-50",
  "51-100",
  "100+",
  "not_found",
]);
export type RankBucket = z.infer<typeof RankBucket>;

export const FacilitatorMode = z.enum([
  "morph-official",
  "fixture-receipt",
  "self-hosted-fallback",
  // Sprint B — Sniff Pack credit spend. No on-chain settlement; the
  // associated Receipt carries amount="0.00", a synthetic 0xpack… tx hash,
  // and the DiagnosePaidResponse.packCredit block reports balance changes.
  "pack-credit",
]);
export type FacilitatorMode = z.infer<typeof FacilitatorMode>;

export const PaymentScheme = z.enum(["exact"]);
export type PaymentScheme = z.infer<typeof PaymentScheme>;

// Wave 1 — third-party benchmark range. Every numeric benchmark sourced from
// vendor research (rating-CVR curves, category baselines, impressions
// translations) ships as a range with explicit attribution, never a bare
// point — the roadmap's response to cross-source conflicts (see
// docs/research/2026-06-discoverability/roadmap.md Part 5). Values built
// from these carry `inferred` provenance.
export const BenchmarkRange = z.object({
  low: z.number(),
  high: z.number(),
  source: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
});
export type BenchmarkRange = z.infer<typeof BenchmarkRange>;

// Cost-aware pricing — the caller-opt-in premium capabilities (à-la-carte).
// Only these three are purchasable add-ons; aiSynthesis is bundled into the
// standard/expert base, not separately buyable. Lives in shared.js because
// both DiagnoseRequest and QuoteRequest reference it (quote can't import from
// diagnose — diagnose imports AppIdentifier from quote). Keys mirror
// PremiumFeature in payment/cogs.ts, the single source of truth for COGS +
// price.
export const Addons = z.object({
  aiVisibility: z.boolean().optional(),
  creativeVision: z.boolean().optional(),
  localizationCopy: z.boolean().optional(),
});
export type Addons = z.infer<typeof Addons>;
