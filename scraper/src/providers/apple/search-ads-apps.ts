import { env } from "../../env.js";
import { recordInvocation, responseHash } from "../../observability/audit.js";
import { recordResponseShape } from "../../observability/shape-hash.js";
import { withCache } from "../../cache/wrapper.js";
import { cacheKey } from "../../cache/keys.js";
import { CACHE_TTL } from "../../cache/ttl.js";
import { AsaAuthError, tryFetchAccessToken } from "../../lib/asa-jwt.js";

// Apple Ads — App-catalog search (`GET /api/v5/search/apps`).
//
// Unlike the keyword-popularity / keyword-recommendations endpoints — which
// don't exist in the public Campaign Management API and 404 (see the
// short-circuit in search-ads-popularity.ts) — this endpoint IS available
// campaign-free and returns Apple's authoritative ad catalog: the advertisable
// app for a prefix-matched query, with its canonical adamId + developerName.
//
// We use it as a trust layer, NOT as new discovery (the scraper already finds
// apps via the free iTunes Search API in providers/apple/itunes.ts):
//   - verify a name-detected app against Apple's catalog (adamId + developer
//     match) to raise identityConfidence — see data/detect.ts.
//
// Response shape (confirmed live 2026-06-03):
//   { "data": [ { "adamId": 570060128, "appName": "Duolingo: Language Lessons",
//     "developerName": "Duolingo", "countryOrRegionCodes": ["US", ...] } ],
//     "pagination": { "totalResults": 1, ... }, "error": null }

const PROVIDER = "apple-search-ads";
const ENDPOINT = "/search/apps";
const DEFAULT_LIMIT = 10;

export interface AsaApp {
  adamId: number;
  appName: string;
  developerName: string;
  countryOrRegionCodes: string[];
}

export type AsaAppSearchOutcome =
  | { kind: "success"; apps: AsaApp[]; asOf: string }
  | { kind: "disabled" }
  | { kind: "auth_failed"; reason: string }
  | { kind: "rate_limited" }
  | { kind: "network_error" }
  | { kind: "not_found" };

export interface AsaAppSearchInput {
  query: string;
  country: string; // ISO 3166-1 alpha-2 (used as a cache dimension)
  limit?: number;
}

export async function searchAdsApps(
  input: AsaAppSearchInput,
): Promise<AsaAppSearchOutcome> {
  if (!env.APPLE_SEARCH_ADS_ENABLED) return { kind: "disabled" };
  if (!env.APPLE_SEARCH_ADS_ORG_ID) {
    return { kind: "auth_failed", reason: "APPLE_SEARCH_ADS_ORG_ID not set" };
  }
  // Apple's prefix-matching algorithm requires a minimum of 3 characters.
  const query = input.query.trim();
  if (query.length < 3) return { kind: "not_found" };

  const limit = input.limit ?? DEFAULT_LIMIT;
  return withCache(
    () => searchAdsAppsLive({ ...input, query, limit }),
    {
      key: cacheKey({
        namespace: "asa:search-apps",
        country: input.country,
        extra: { query: query.toLowerCase(), limit },
      }),
      ttlSeconds: CACHE_TTL.appMetadata,
      namespace: "asa:search-apps",
    },
  );
}

async function searchAdsAppsLive(
  input: Required<AsaAppSearchInput>,
): Promise<AsaAppSearchOutcome> {
  const started = Date.now();
  let token: Awaited<ReturnType<typeof tryFetchAccessToken>>;
  try {
    token = await tryFetchAccessToken();
  } catch (err) {
    const message =
      err instanceof AsaAuthError ? err.message : (err as Error).message;
    recordInvocation({
      provider: PROVIDER,
      endpoint: "/oauth2/token",
      source: "live",
      latencyMs: Date.now() - started,
      bytesIn: 0,
      responseHash: "",
      errorKind: "auth_failed",
    });
    return { kind: "auth_failed", reason: message };
  }
  if (!token) return { kind: "disabled" };

  const url =
    `${env.APPLE_SEARCH_ADS_BASE_URL}${ENDPOINT}` +
    `?query=${encodeURIComponent(input.query)}&limit=${input.limit}`;

  const before = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token.token}`,
        "X-AP-Context": `orgId=${env.APPLE_SEARCH_ADS_ORG_ID ?? ""}`,
        Accept: "application/json",
      },
    });
  } catch {
    recordInvocation({
      provider: PROVIDER,
      endpoint: ENDPOINT,
      source: "live",
      latencyMs: Date.now() - before,
      bytesIn: 0,
      responseHash: "",
      errorKind: "network_error",
    });
    return { kind: "network_error" };
  }

  if (res.status === 401 || res.status === 403) {
    recordInvocation({
      provider: PROVIDER,
      endpoint: ENDPOINT,
      source: "live",
      latencyMs: Date.now() - before,
      bytesIn: 0,
      responseHash: "",
      httpStatus: res.status,
      errorKind: "auth_failed",
    });
    return { kind: "auth_failed", reason: `HTTP ${res.status}` };
  }
  if (res.status === 429) {
    recordInvocation({
      provider: PROVIDER,
      endpoint: ENDPOINT,
      source: "live",
      latencyMs: Date.now() - before,
      bytesIn: 0,
      responseHash: "",
      httpStatus: 429,
      errorKind: "rate_limited",
    });
    return { kind: "rate_limited" };
  }
  if (res.status === 404) {
    recordInvocation({
      provider: PROVIDER,
      endpoint: ENDPOINT,
      source: "live",
      latencyMs: Date.now() - before,
      bytesIn: 0,
      responseHash: "",
      httpStatus: 404,
      errorKind: "not_found",
    });
    return { kind: "not_found" };
  }
  if (!res.ok) {
    recordInvocation({
      provider: PROVIDER,
      endpoint: ENDPOINT,
      source: "live",
      latencyMs: Date.now() - before,
      bytesIn: 0,
      responseHash: "",
      httpStatus: res.status,
      errorKind: "network_error",
    });
    return { kind: "network_error" };
  }

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    recordInvocation({
      provider: PROVIDER,
      endpoint: ENDPOINT,
      source: "live",
      latencyMs: Date.now() - before,
      bytesIn: text.length,
      responseHash: "",
      httpStatus: res.status,
      errorKind: "schema_drift",
    });
    return { kind: "network_error" };
  }

  const apps = extractApps(parsed);
  recordInvocation({
    provider: PROVIDER,
    endpoint: ENDPOINT,
    source: "live",
    latencyMs: Date.now() - before,
    bytesIn: text.length,
    responseHash: responseHash(parsed),
    httpStatus: res.status,
  });
  void recordResponseShape({ provider: PROVIDER, endpoint: ENDPOINT, value: parsed });

  if (apps.length === 0) return { kind: "not_found" };
  return { kind: "success", apps, asOf: new Date().toISOString() };
}

// Apple's response: { data: [ { adamId, appName, developerName,
//   countryOrRegionCodes: [...] } ], pagination, error }. We never throw on
// missing fields — a malformed row is skipped, not faked.
export function _internal_extractApps_forTests(body: unknown): AsaApp[] {
  return extractApps(body);
}

function extractApps(body: unknown): AsaApp[] {
  if (!body || typeof body !== "object") return [];
  const root = body as Record<string, unknown>;
  const arr = (Array.isArray(root.data) ? root.data : []) as Array<
    Record<string, unknown>
  >;
  const out: AsaApp[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const adamId = pickNumber(item.adamId);
    const appName = pickString(item.appName);
    const developerName = pickString(item.developerName);
    if (adamId === null || appName === null) continue;
    out.push({
      adamId,
      appName,
      developerName: developerName ?? "",
      countryOrRegionCodes: Array.isArray(item.countryOrRegionCodes)
        ? item.countryOrRegionCodes.filter(
            (c): c is string => typeof c === "string",
          )
        : [],
    });
  }
  return out;
}

function pickNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pickString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}
