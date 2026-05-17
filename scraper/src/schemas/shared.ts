import { z } from "zod";

export const Provenance = z.enum(["live", "cached", "fixture", "inferred"]);
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

export const Coverage = z.object({
  appMetadata: Confidence,
  keywordRank: Confidence,
  competitorTrail: Confidence,
  reviews: Confidence,
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
]);
export type FacilitatorMode = z.infer<typeof FacilitatorMode>;

export const PaymentScheme = z.enum(["exact"]);
export type PaymentScheme = z.infer<typeof PaymentScheme>;
