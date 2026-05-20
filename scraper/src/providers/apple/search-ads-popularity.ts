import { env } from "../../env.js";
import { recordInvocation, responseHash } from "../../observability/audit.js";
import { recordResponseShape } from "../../observability/shape-hash.js";
import { withCache } from "../../cache/wrapper.js";
import { cacheKey } from "../../cache/keys.js";
import {
  AsaAuthError,
  tryFetchAccessToken,
} from "../../lib/asa-jwt.js";

// Apple Search Ads — Keyword Popularity.
//
// PLAN.md Phase 3 grounds the canonical iOS demand signal here. Apple's
// internal scale is 5–100; ASO tools (AppTweak, AppFollow, SplitMetrics)
// display it as 0–100 or 1–5 dots. We surface the raw integer plus a
// `popularityAsOf` date so consumers can see the platform-wide Sept 2025
// regression (~77% drop) for what it is rather than treat low scores as
// "no demand."
//
// Endpoint shape — to be confirmed against the live Apple Ads account
// when it's provisioned. The v5 keyword-recommendations endpoint takes a
// `searchTerms` array and returns `recommendedKeywords[].suggestedAmount`
// plus a `popularity` field. We bind through env so a post-merge URL
// change doesn't require a code deploy.

const PROVIDER = "apple-search-ads";

export interface PopularityScore {
  keyword: string;
  // 5 (rare/no demand) to 100 (most popular). 0 used when Apple returns
  // no record for the keyword (different from "rate-limited" — see error
  // arm below).
  score: number;
  source: "apple-search-ads";
  asOf: string; // ISO 8601 UTC date when the score was fetched
}

export type PopularityOutcome =
  | PopularityScore
  | { error: "disabled" }
  | { error: "auth_failed"; reason: string }
  | { error: "rate_limited" }
  | { error: "network_error" }
  | { error: "not_found" };

export interface KeywordPopularityInput {
  keyword: string;
  country: string; // ISO 3166-1 alpha-2
}

export async function getKeywordPopularity(
  input: KeywordPopularityInput,
): Promise<PopularityOutcome> {
  if (!env.APPLE_SEARCH_ADS_ENABLED) {
    return { error: "disabled" };
  }
  if (!env.APPLE_SEARCH_ADS_ORG_ID) {
    return { error: "auth_failed", reason: "APPLE_SEARCH_ADS_ORG_ID not set" };
  }

  return withCache(
    () => fetchPopularityLive(input),
    {
      key: cacheKey({
        namespace: "asa:popularity",
        country: input.country,
        extra: { keyword: input.keyword.toLowerCase() },
      }),
      ttlSeconds: env.ASA_POPULARITY_CACHE_TTL_DAYS * 24 * 60 * 60,
      namespace: "asa:popularity",
      // Note: audit attribution still happens in fetchPopularityLive via
      // recordInvocation; we don't pass `audit` here because withCache's
      // built-in audit assumes a single record-per-call which doesn't
      // capture the multi-stage (token + popularity) shape of this flow.
    },
  );
}

async function fetchPopularityLive(
  input: KeywordPopularityInput,
): Promise<PopularityOutcome> {
  const started = Date.now();
  let token: Awaited<ReturnType<typeof tryFetchAccessToken>>;
  try {
    token = await tryFetchAccessToken();
  } catch (err) {
    const message = err instanceof AsaAuthError ? err.message : (err as Error).message;
    recordInvocation({
      provider: PROVIDER,
      endpoint: "/oauth2/token",
      source: "live",
      latencyMs: Date.now() - started,
      bytesIn: 0,
      responseHash: "",
      errorKind: "auth_failed",
    });
    return { error: "auth_failed", reason: message };
  }
  if (!token) {
    return { error: "disabled" };
  }

  const url = `${env.APPLE_SEARCH_ADS_BASE_URL}/keywords/recommendations`;
  const requestBody = {
    storefronts: [input.country.toUpperCase()],
    searchTerms: [{ value: input.keyword }],
    // Limit shape to a single keyword per request — keeps the popularity
    // adapter atomic at the call-site level so each cache row is single-keyword.
    pageSize: 1,
  };

  const before = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.token}`,
        "X-AP-Context": `orgId=${env.APPLE_SEARCH_ADS_ORG_ID ?? ""}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestBody),
    });
  } catch {
    recordInvocation({
      provider: PROVIDER,
      endpoint: "/keywords/recommendations",
      source: "live",
      latencyMs: Date.now() - before,
      bytesIn: 0,
      responseHash: "",
      errorKind: "network_error",
    });
    return { error: "network_error" };
  }

  if (res.status === 401 || res.status === 403) {
    recordInvocation({
      provider: PROVIDER,
      endpoint: "/keywords/recommendations",
      source: "live",
      latencyMs: Date.now() - before,
      bytesIn: 0,
      responseHash: "",
      httpStatus: res.status,
      errorKind: "auth_failed",
    });
    return { error: "auth_failed", reason: `HTTP ${res.status}` };
  }
  if (res.status === 429) {
    recordInvocation({
      provider: PROVIDER,
      endpoint: "/keywords/recommendations",
      source: "live",
      latencyMs: Date.now() - before,
      bytesIn: 0,
      responseHash: "",
      httpStatus: 429,
      errorKind: "rate_limited",
    });
    return { error: "rate_limited" };
  }
  if (res.status === 404) {
    recordInvocation({
      provider: PROVIDER,
      endpoint: "/keywords/recommendations",
      source: "live",
      latencyMs: Date.now() - before,
      bytesIn: 0,
      responseHash: "",
      httpStatus: 404,
      errorKind: "not_found",
    });
    return { error: "not_found" };
  }
  if (!res.ok) {
    recordInvocation({
      provider: PROVIDER,
      endpoint: "/keywords/recommendations",
      source: "live",
      latencyMs: Date.now() - before,
      bytesIn: 0,
      responseHash: "",
      httpStatus: res.status,
      errorKind: "network_error",
    });
    return { error: "network_error" };
  }

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    recordInvocation({
      provider: PROVIDER,
      endpoint: "/keywords/recommendations",
      source: "live",
      latencyMs: Date.now() - before,
      bytesIn: text.length,
      responseHash: "",
      httpStatus: res.status,
      errorKind: "schema_drift",
    });
    return { error: "network_error" };
  }

  const score = extractPopularity(parsed);
  recordInvocation({
    provider: PROVIDER,
    endpoint: "/keywords/recommendations",
    source: "live",
    latencyMs: Date.now() - before,
    bytesIn: text.length,
    responseHash: responseHash(parsed),
    httpStatus: res.status,
  });
  void recordResponseShape({
    provider: PROVIDER,
    endpoint: "/keywords/recommendations",
    value: parsed,
  });

  if (score === null) {
    return { error: "not_found" };
  }
  return {
    keyword: input.keyword,
    score,
    source: "apple-search-ads",
    asOf: new Date().toISOString(),
  };
}

// Apple's response shape varies across API versions and migration windows.
// We tolerate multiple known nesting paths:
//   data.popularity                            (legacy v4 single-keyword)
//   data.recommendations[0].popularity         (v5 batch)
//   data.searchTermPopularities[0].popularity  (variant)
// Exposed for tests. Internal helper — do not consume from outside the
// search-ads-popularity module in production code.
export function _internal_extractPopularity_forTests(
  body: unknown,
): number | null {
  return extractPopularity(body);
}

function extractPopularity(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const data = (root.data ?? root) as Record<string, unknown>;

  if (typeof data.popularity === "number") return clampPopularity(data.popularity);

  const arr = (data.recommendations ?? data.searchTermPopularities ?? []) as Array<
    Record<string, unknown>
  >;
  if (Array.isArray(arr) && arr.length > 0) {
    const first = arr[0] ?? {};
    if (typeof first.popularity === "number") {
      return clampPopularity(first.popularity);
    }
    if (typeof first.score === "number") {
      return clampPopularity(first.score);
    }
  }
  return null;
}

function clampPopularity(n: number): number {
  if (Number.isNaN(n)) return 5;
  return Math.min(100, Math.max(5, Math.round(n)));
}
