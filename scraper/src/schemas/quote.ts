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

// Sprint B — tier mirrors the DiagnoseTier enum on diagnose.ts so callers can
// preview the tiered price via /quote before committing the wallet step. Kept
// here (not in shared.ts) to avoid a forward import; the union is small and
// the diagnose schema validates against the same literal set.
export const QuoteTier = z.enum(["quick", "standard", "expert"]);
export type QuoteTier = z.infer<typeof QuoteTier>;

export const QuoteRequest = z.object({
  store: Store,
  app: AppIdentifier,
  country: CountryCode,
  keywords: z.array(z.string().min(1)).min(1).max(10),
  tier: QuoteTier.optional(),
});
export type QuoteRequest = z.infer<typeof QuoteRequest>;

export const DetectedApp = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  developer: z.string().min(1),
  // Apple Ads catalog verification (optional; only set when
  // APPLE_SEARCH_ADS_ENABLED and the detected adamId is confirmed present in
  // Apple's authoritative ad catalog via GET /api/v5/search/apps). Absent =
  // "not checked", not "failed". See providers/apple/search-ads-apps.ts.
  catalogVerified: z.boolean().optional(),
  // True when the catalog's developerName also matched the detected developer.
  catalogDeveloperMatch: z.boolean().optional(),
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
  // Sprint A — refresh-sniff discount is applied here as positive line items
  // (conceptually subtracted from the breakdown sum). Keeps the wire amount
  // regex unsigned and lets the UI render the savings line distinctly from
  // the work-line breakdown. estimatedTotal is the net after these apply.
  discounts: z.array(PricingBreakdownItem).default([]),
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

// Per-field character usage report. Surfaced free on /quote so founders can
// see at a glance whether they've left indexed-field space unused, without
// any of the scored/synthesized signals that live behind paid /diagnose.
// `note` carries store-specific context (e.g. "indexed for search", "hidden
// from users") so agents can explain the constraint without a separate lookup.
export const MetadataLength = z.object({
  field: z.string().min(1),
  used: z.number().int().nonnegative(),
  max: z.number().int().positive(),
  note: z.string().optional(),
});
export type MetadataLength = z.infer<typeof MetadataLength>;

// Identity-only competitor teaser surfaced on the free /quote. Carries the
// competitor's name and category — no overlap matrix, no metadata comparison,
// no rank deltas. Those stay paid. Optional because /quote does not always
// have competitor data without invoking the paid trail.
export const CompetitorPreview = z.object({
  name: z.string().min(1),
  primaryCategory: z.string().min(1),
});
export type CompetitorPreview = z.infer<typeof CompetitorPreview>;

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
  // Sprint A — free-tier expansion to strictly dominate competing free tiers.
  // metadataLengths is always populated from the detected app's visible
  // metadata. competitorPreview and suggestedKeywordCountBand are scaffolded
  // optional; populated by a follow-up wiring change that wraps the existing
  // competitor / keyword providers.
  metadataLengths: z.array(MetadataLength).default([]),
  competitorPreview: CompetitorPreview.optional(),
  suggestedKeywordCountBand: z
    .object({
      min: z.number().int().nonnegative(),
      max: z.number().int().nonnegative(),
    })
    .optional(),
});
export type ShallowScan = z.infer<typeof ShallowScan>;

// Anonymous, machine-readable savings comparison surfaced on every /quote.
// Numbers reference public pricing tiers of mainstream ASO subscription
// products; this object never names a specific competitor. Agents and the
// landing module both read from the same shape so the comparison voice is
// consistent across the SDK, CLI, MCP, and UI surfaces.
export const SavingsNote = z.object({
  message: z.string().min(1),
  estimatedSniffCost: z.string().regex(/^\d+(\.\d+)?$/),
  typicalSubscriptionMonthlyUSD: z.number().positive(),
  typicalSubscriptionAnnualUSD: z.number().positive(),
});
export type SavingsNote = z.infer<typeof SavingsNote>;

export const QuoteResponse = z.object({
  requestId: RequestId,
  sniffId: SniffId,
  store: Store,
  country: CountryCode,
  detectedApp: DetectedApp,
  pricing: Pricing,
  coverage: Coverage,
  shallowScan: ShallowScan,
  savingsNote: SavingsNote,
  next: z.object({
    paidEndpoint: z.string().min(1),
  }),
});
export type QuoteResponse = z.infer<typeof QuoteResponse>;
