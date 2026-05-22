import { z } from "zod";
import { DiagnosePaidResponse } from "./diagnose.js";
import { DetectedApp } from "./quote.js";
import { CountryCode, Store } from "./shared.js";

// Sprint C — public showcase. After a successful /diagnose settle, the
// orchestrator fire-and-forgets a redacted copy of the report into a Redis
// store keyed by (store, country, appId). The landing serves these at
// /insights/{store}/{country}/{appId} as SEO-friendly public pages. Every
// PII / correlation field (receipt, requestId, sniffId, packCredit, wallet,
// historySignature) is removed before the report ever touches the showcase
// store — so the only public surface is the same App Store-derived signals
// the source apps already advertise.
//
// Opt-out: the originating /diagnose request can pass header
// `X-Sniffy-No-Index: 1` to skip the showcase write. Default behavior is
// opt-out: showcase writes happen for every settled diagnose unless the
// caller explicitly says no.

// PII-stripped subset of DiagnosePaidResponse. Strategy: Zod .omit() the
// sensitive fields and re-derive the type. This keeps the showcase shape
// automatically in sync with DiagnosePaidResponse drift — when a new
// PII-bearing field lands on the paid response, the .omit() call here
// won't drop it and a sync-guard test will fail (see redact-for-showcase
// tests). Show-only metadata (store, country, showcasedAt) is added back.
export const PublicShowcaseReport = DiagnosePaidResponse.omit({
  requestId: true,
  sniffId: true,
  receipt: true,
  historySignature: true,
  packCredit: true,
}).extend({
  store: Store,
  country: CountryCode,
  appId: z.string().min(1),
  // detectedApp is on QuoteResponse but not on DiagnosePaidResponse; the
  // showcase needs it so the public detail page can show app name +
  // developer without re-fetching from Apple/Play. Icon URL is captured at
  // diagnose-time and may go stale — that's acceptable for an SEO page.
  detectedApp: DetectedApp.extend({
    iconUrl: z.string().url().nullable(),
  }),
  showcasedAt: z.string().datetime(),
});
export type PublicShowcaseReport = z.infer<typeof PublicShowcaseReport>;

// Minimal listing metadata for the index page. Cheap to render even for
// hundreds of entries; the full PublicShowcaseReport stays behind the
// per-app detail page.
export const ShowcaseEntry = z.object({
  store: Store,
  country: CountryCode,
  appId: z.string().min(1),
  appName: z.string().min(1),
  appDeveloper: z.string().min(1),
  iconUrl: z.string().url().nullable(),
  primaryCategory: z.string().nullable(),
  overallScore: z.number().min(0).max(100).nullable(),
  settledAt: z.string().datetime(),
});
export type ShowcaseEntry = z.infer<typeof ShowcaseEntry>;

export const InsightsListResponse = z.object({
  entries: z.array(ShowcaseEntry),
  // ISO of the freshest entry — caller can cache + revalidate against this.
  freshestAt: z.string().datetime().nullable(),
  // Echo of the filters the request applied (server may downgrade unknown
  // filters to a fallback; this field tells the caller what actually ran).
  filters: z.object({
    store: Store.nullable(),
    country: CountryCode.nullable(),
    limit: z.number().int().positive(),
  }),
});
export type InsightsListResponse = z.infer<typeof InsightsListResponse>;
