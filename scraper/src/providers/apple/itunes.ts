import { recordInvocation, responseHash } from "../../observability/audit.js";
import { recordResponseShape } from "../../observability/shape-hash.js";
import type { AppRecord, AppleProviderError } from "./types.js";

const ITUNES_BASE = "https://itunes.apple.com";
const USER_AGENT = "ASOSniffy/0.1 (+https://github.com/TheoInTech/asosniffy-com)";
const PROVIDER = "apple-itunes";

interface ItunesRawResult {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  primaryGenreName?: string;
  description?: string;
  screenshotUrls?: string[];
  ipadScreenshotUrls?: string[];
  averageUserRating?: number;
  userRatingCount?: number;
  version?: string;
  artworkUrl100?: string;
  bundleId?: string;
  // iTunes does not return subtitle via this API; we leave it undefined.
}

interface ItunesEnvelope {
  resultCount: number;
  results: ItunesRawResult[];
}

export interface LookupAppInput {
  id: string;
  country: string;
}

export interface SearchAppsInput {
  term: string;
  country: string;
  limit?: number;
}

export async function lookupApp(
  input: LookupAppInput,
): Promise<AppRecord | AppleProviderError> {
  const url = `${ITUNES_BASE}/lookup?id=${encodeURIComponent(input.id)}&country=${encodeURIComponent(input.country)}`;
  const response = await safeFetch(url, "/lookup");
  if ("error" in response) return response;
  if (response.body.results.length === 0) {
    recordInvocation({
      provider: PROVIDER,
      endpoint: "/lookup",
      source: "live",
      latencyMs: response.latencyMs,
      bytesIn: response.bytesIn,
      responseHash: responseHash(response.body),
      httpStatus: 200,
      errorKind: "not_found",
    });
    return { error: "not_found" };
  }
  recordInvocation({
    provider: PROVIDER,
    endpoint: "/lookup",
    source: "live",
    latencyMs: response.latencyMs,
    bytesIn: response.bytesIn,
    responseHash: responseHash(response.body),
    httpStatus: 200,
  });
  // Fire-and-forget schema-drift tracking. Doesn't block the response.
  void recordResponseShape({
    provider: PROVIDER,
    endpoint: "/lookup",
    value: response.body,
  });
  return toAppRecord(response.body.results[0]!);
}

export async function searchApps(
  input: SearchAppsInput,
): Promise<AppRecord[] | AppleProviderError> {
  const limit = clamp(input.limit ?? 50, 1, 200);
  const params = new URLSearchParams({
    term: input.term,
    entity: "software",
    country: input.country,
    limit: String(limit),
  });
  const url = `${ITUNES_BASE}/search?${params.toString()}`;
  const response = await safeFetch(url, "/search");
  if ("error" in response) return response;
  recordInvocation({
    provider: PROVIDER,
    endpoint: "/search",
    source: "live",
    latencyMs: response.latencyMs,
    bytesIn: response.bytesIn,
    responseHash: responseHash(response.body),
    httpStatus: 200,
  });
  void recordResponseShape({
    provider: PROVIDER,
    endpoint: "/search",
    value: response.body,
  });
  return response.body.results.map(toAppRecord);
}

interface SafeFetchSuccess {
  body: ItunesEnvelope;
  latencyMs: number;
  bytesIn: number;
}

async function safeFetch(
  url: string,
  endpoint: string,
): Promise<SafeFetchSuccess | AppleProviderError> {
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
  } catch {
    recordInvocation({
      provider: PROVIDER,
      endpoint,
      source: "live",
      latencyMs: Date.now() - started,
      bytesIn: 0,
      responseHash: "",
      errorKind: "network_error",
    });
    return { error: "network_error" };
  }
  if (res.status === 403 || res.status === 429) {
    recordInvocation({
      provider: PROVIDER,
      endpoint,
      source: "live",
      latencyMs: Date.now() - started,
      bytesIn: 0,
      responseHash: "",
      httpStatus: res.status,
      errorKind: "rate_limited",
    });
    return { error: "rate_limited" };
  }
  if (!res.ok) {
    recordInvocation({
      provider: PROVIDER,
      endpoint,
      source: "live",
      latencyMs: Date.now() - started,
      bytesIn: 0,
      responseHash: "",
      httpStatus: res.status,
      errorKind: "network_error",
    });
    return { error: "network_error" };
  }
  const text = await res.text().catch(() => "");
  let body: ItunesEnvelope | null = null;
  try {
    body = text ? (JSON.parse(text) as ItunesEnvelope) : null;
  } catch {
    body = null;
  }
  if (!body || !Array.isArray(body.results)) {
    recordInvocation({
      provider: PROVIDER,
      endpoint,
      source: "live",
      latencyMs: Date.now() - started,
      bytesIn: text.length,
      responseHash: "",
      httpStatus: res.status,
      errorKind: "schema_drift",
    });
    return { error: "network_error" };
  }
  return {
    body,
    latencyMs: Date.now() - started,
    bytesIn: text.length,
  };
}

function toAppRecord(raw: ItunesRawResult): AppRecord {
  return {
    id: raw.trackId !== undefined ? String(raw.trackId) : "",
    name: raw.trackName ?? "",
    developer: raw.artistName ?? "",
    primaryCategory: raw.primaryGenreName ?? "Unknown",
    description: raw.description ?? "",
    ratingsSummary: {
      average: raw.averageUserRating ?? 0,
      count: raw.userRatingCount ?? 0,
    },
    screenshots: raw.screenshotUrls ?? raw.ipadScreenshotUrls ?? [],
    currentVersion: raw.version ?? "",
    iconUrl: raw.artworkUrl100,
    bundleId: raw.bundleId,
    provenance: "live",
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
