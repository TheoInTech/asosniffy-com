import { env } from "../env.js";

// Per-namespace TTLs (seconds). Read once at module init; env-overridable via
// CACHE_TTL_* vars (see src/env.ts).
export const CACHE_TTL = {
  appMetadata: env.CACHE_TTL_APP_METADATA,
  keywordRank: env.CACHE_TTL_KEYWORD_RANK,
  androidPreview: env.CACHE_TTL_ANDROID_PREVIEW,
  fullReport: env.CACHE_TTL_FULL_REPORT,
} as const;

export type CacheNamespace = keyof typeof CACHE_TTL;
