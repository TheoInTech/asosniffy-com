import type { AppRecord, AppleProviderError } from "./types.js";

const ITUNES_BASE = "https://itunes.apple.com";
const USER_AGENT = "ASOSniffy/0.1 (+https://github.com/TheoInTech/asosniffy-com)";

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
  const response = await safeFetch(url);
  if ("error" in response) return response;
  if (response.results.length === 0) return { error: "not_found" };
  return toAppRecord(response.results[0]!);
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
  const response = await safeFetch(url);
  if ("error" in response) return response;
  return response.results.map(toAppRecord);
}

async function safeFetch(url: string): Promise<ItunesEnvelope | AppleProviderError> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
  } catch {
    return { error: "network_error" };
  }
  if (res.status === 403 || res.status === 429) {
    return { error: "rate_limited" };
  }
  if (!res.ok) {
    return { error: "network_error" };
  }
  const body = (await res.json().catch(() => null)) as ItunesEnvelope | null;
  if (!body || !Array.isArray(body.results)) {
    return { error: "network_error" };
  }
  return body;
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
    provenance: "live",
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
