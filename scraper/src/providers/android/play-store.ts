// Android Google Play provider.
//
// Phase 1 was fixture-only. Phase 2 wires the real facundoolano/google-play-scraper
// behind audit + token-bucket + (optional) QuotaGuard proxy. Honest labels:
//   • provenance: "live" only when the scraper returned real data
//   • confidence: capped at "medium" — we're scraping public pages, not
//     querying an official API. PLAN.md §11 codifies the cap.
//   • Kill-switch env GOOGLE_PLAY_PROVIDER=disabled returns the legacy
//     synth path with provenance: "fixture" so the surface remains
//     drop-in for callers that don't yet branch on Phase-2 behavior.

import { env } from "../../env.js";
import { recordInvocation, responseHash } from "../../observability/audit.js";
import { recordResponseShape } from "../../observability/shape-hash.js";
import { acquireOrWait } from "../_lib/token-bucket.js";
import { withProxyForProvider } from "../_lib/proxy.js";
import {
  getGplay,
  type RawApp,
  type RawSearchHit,
} from "./_gplay.js";
import type {
  AndroidAppPreview,
  AndroidAppRecord,
  AndroidProviderError,
} from "./types.js";

const PROVIDER = "google-play";

export interface LookupAppPreviewInput {
  packageName: string;
  country: string;
  lang?: string;
}

export interface SearchAppsPreviewInput {
  term: string;
  country: string;
  lang?: string;
  limit?: number;
}

// Legacy entry points — kept for back-compat with detect.ts. Return the
// preview-shape (subset of AndroidAppRecord). Phase 2 callers should
// prefer `lookupApp` / `searchApps` directly.
export async function lookupAppPreview(
  input: LookupAppPreviewInput,
): Promise<AndroidAppPreview> {
  const record = await lookupApp(input);
  if ("error" in record) {
    return synthesizePreview({
      packageName: input.packageName,
      name: derivedNameFromPackage(input.packageName),
      developer: "Unknown Developer",
    });
  }
  return toPreview(record);
}

export async function searchAppsPreview(
  input: SearchAppsPreviewInput,
): Promise<AndroidAppPreview[]> {
  const results = await searchApps(input);
  if ("error" in results) {
    return [
      synthesizePreview({
        packageName: `com.preview.${slugify(input.term)}`,
        name: titleCase(input.term),
        developer: "Preview Developer",
      }),
    ];
  }
  return results.map(toPreview);
}

// Phase 2 primary entry points.

export async function lookupApp(
  input: LookupAppPreviewInput,
): Promise<AndroidAppRecord | AndroidProviderError> {
  if (env.GOOGLE_PLAY_PROVIDER === "disabled") {
    return { error: "blocked" };
  }
  const gate = await reserveSlot();
  if (!gate.ok) return gate.error;

  const started = Date.now();
  try {
    const raw = await withProxyForProvider(PROVIDER, () =>
      getGplay().app({
        appId: input.packageName,
        country: input.country.toLowerCase(),
        lang: input.lang ?? "en",
        throttle: 100,
      }),
    );
    const record = toAppRecord(raw);
    recordInvocation({
      provider: PROVIDER,
      endpoint: "/details",
      source: "live",
      latencyMs: Date.now() - started,
      bytesIn: estimateBytes(raw),
      responseHash: responseHash(raw),
    });
    void recordResponseShape({ provider: PROVIDER, endpoint: "/details", value: raw });
    return record;
  } catch (err) {
    return classifyAndAudit(err, "/details", started);
  }
}

export async function searchApps(
  input: SearchAppsPreviewInput,
): Promise<AndroidAppRecord[] | AndroidProviderError> {
  if (env.GOOGLE_PLAY_PROVIDER === "disabled") {
    return { error: "blocked" };
  }
  const num = clamp(input.limit ?? 50, 1, 250);
  const gate = await reserveSlot();
  if (!gate.ok) return gate.error;

  const started = Date.now();
  try {
    const raw = await withProxyForProvider(PROVIDER, () =>
      getGplay().search({
        term: input.term,
        country: input.country.toLowerCase(),
        lang: input.lang ?? "en",
        num,
        throttle: 100,
      }),
    );
    const records = raw.map(searchHitToRecord);
    recordInvocation({
      provider: PROVIDER,
      endpoint: "/search",
      source: "live",
      latencyMs: Date.now() - started,
      bytesIn: estimateBytes(raw),
      responseHash: responseHash(raw),
    });
    void recordResponseShape({ provider: PROVIDER, endpoint: "/search", value: raw });
    return records;
  } catch (err) {
    return classifyAndAudit(err, "/search", started);
  }
}

export interface SimilarAppsInput {
  packageName: string;
  country: string;
  lang?: string;
}

export async function similarApps(
  input: SimilarAppsInput,
): Promise<AndroidAppRecord[] | AndroidProviderError> {
  if (env.GOOGLE_PLAY_PROVIDER === "disabled") {
    return { error: "blocked" };
  }
  const gate = await reserveSlot();
  if (!gate.ok) return gate.error;

  const started = Date.now();
  try {
    const raw = await withProxyForProvider(PROVIDER, () =>
      getGplay().similar({
        appId: input.packageName,
        country: input.country.toLowerCase(),
        lang: input.lang ?? "en",
        throttle: 100,
      }),
    );
    const records = raw.map(searchHitToRecord);
    recordInvocation({
      provider: PROVIDER,
      endpoint: "/similar",
      source: "live",
      latencyMs: Date.now() - started,
      bytesIn: estimateBytes(raw),
      responseHash: responseHash(raw),
    });
    void recordResponseShape({ provider: PROVIDER, endpoint: "/similar", value: raw });
    return records;
  } catch (err) {
    return classifyAndAudit(err, "/similar", started);
  }
}

export interface SuggestKeywordsInput {
  term: string;
  country: string;
  lang?: string;
}

export async function suggestKeywords(
  input: SuggestKeywordsInput,
): Promise<string[] | AndroidProviderError> {
  if (env.GOOGLE_PLAY_PROVIDER === "disabled") {
    return { error: "blocked" };
  }
  const gate = await reserveSlot();
  if (!gate.ok) return gate.error;

  const started = Date.now();
  try {
    const suggestions = await withProxyForProvider(PROVIDER, () =>
      getGplay().suggest({
        term: input.term,
        country: input.country.toLowerCase(),
        lang: input.lang ?? "en",
        throttle: 100,
      }),
    );
    recordInvocation({
      provider: PROVIDER,
      endpoint: "/suggest",
      source: "live",
      latencyMs: Date.now() - started,
      bytesIn: estimateBytes(suggestions),
      responseHash: responseHash(suggestions),
    });
    void recordResponseShape({ provider: PROVIDER, endpoint: "/suggest", value: suggestions });
    return suggestions;
  } catch (err) {
    return classifyAndAudit(err, "/suggest", started);
  }
}

export interface FetchAndroidReviewsInput {
  packageName: string;
  country: string;
  lang?: string;
  num?: number; // up to 500 per gplay default cap
}

export interface AndroidReview {
  id: string;
  author: string;
  rating: number;
  title: string;
  body: string;
  updatedAt: string;
}

export type AndroidReviewsOutcome =
  | { reviews: AndroidReview[]; sampleSize: number }
  | AndroidProviderError;

export async function fetchAndroidReviews(
  input: FetchAndroidReviewsInput,
): Promise<AndroidReviewsOutcome> {
  if (env.GOOGLE_PLAY_PROVIDER === "disabled") {
    return { error: "blocked" };
  }
  const gate = await reserveSlot();
  if (!gate.ok) return gate.error;

  const started = Date.now();
  try {
    const raw = await withProxyForProvider(PROVIDER, () =>
      getGplay().reviews({
        appId: input.packageName,
        country: input.country.toLowerCase(),
        lang: input.lang ?? "en",
        sort: 1, // NEWEST
        num: Math.min(input.num ?? 500, 500),
        throttle: 100,
      }),
    );
    const flat = Array.isArray(raw) ? raw : raw.data;
    const reviews: AndroidReview[] = flat.map((r) => ({
      id: r.id ?? "",
      author: r.userName ?? "Unknown",
      rating: typeof r.score === "number" ? r.score : 0,
      title: r.title ?? "",
      body: r.text ?? "",
      updatedAt: r.date ?? "",
    }));
    recordInvocation({
      provider: PROVIDER,
      endpoint: "/reviews",
      source: "live",
      latencyMs: Date.now() - started,
      bytesIn: estimateBytes(raw),
      responseHash: responseHash(raw),
    });
    void recordResponseShape({ provider: PROVIDER, endpoint: "/reviews", value: raw });
    return { reviews, sampleSize: reviews.length };
  } catch (err) {
    return classifyAndAudit(err, "/reviews", started);
  }
}

// ---------- internals ----------

async function reserveSlot(): Promise<
  { ok: true } | { ok: false; error: AndroidProviderError }
> {
  const acquired = await acquireOrWait({
    provider: PROVIDER,
    perMinuteBudget: env.GOOGLE_PLAY_RATE_LIMIT_PER_MIN,
    maxWaitMs: 0, // fail-fast: degraded > queued
  });
  if (!acquired.ok) {
    return { ok: false, error: { error: "rate_limited" } };
  }
  return { ok: true };
}

function classifyAndAudit(
  err: unknown,
  endpoint: string,
  started: number,
): AndroidProviderError {
  const status = (err as { status?: number }).status;
  const message = (err as Error)?.message ?? String(err);
  let kind: AndroidProviderError["error"] = "network_error";
  if (status === 404 || /not\s*found|App not found/i.test(message)) {
    kind = "not_found";
  } else if (status === 429 || status === 503) {
    kind = "rate_limited";
  } else if (status && status >= 400 && status < 500) {
    kind = "blocked";
  }
  recordInvocation({
    provider: PROVIDER,
    endpoint,
    source: "live",
    latencyMs: Date.now() - started,
    bytesIn: 0,
    responseHash: "",
    httpStatus: status,
    errorKind: kind,
  });
  return { error: kind };
}

function toAppRecord(raw: RawApp): AndroidAppRecord {
  const record: AndroidAppRecord = {
    packageName: raw.appId,
    name: raw.title ?? "",
    developer: raw.developer ?? "",
    primaryCategory: raw.genre ?? raw.categories?.[0]?.name ?? "Unknown",
    description: raw.description ?? "",
    ratingsSummary: {
      average: typeof raw.score === "number" ? raw.score : 0,
      count: typeof raw.ratings === "number" ? raw.ratings : 0,
    },
    screenshots: raw.screenshots ?? [],
    free: raw.free !== false,
    confidence: "medium",
    provenance: "live",
  };
  if (raw.icon !== undefined) record.iconUrl = raw.icon;
  if (raw.installs !== undefined) record.installsText = raw.installs;
  if (raw.scoreText !== undefined) record.scoreText = raw.scoreText;
  if (raw.url !== undefined) record.url = raw.url;
  return record;
}

function searchHitToRecord(raw: RawSearchHit): AndroidAppRecord {
  const record: AndroidAppRecord = {
    packageName: raw.appId,
    name: raw.title ?? "",
    developer: raw.developer ?? "",
    // Search hits don't carry genre — caller (detect/disambiguation) will
    // hydrate with a follow-up app() call if needed.
    primaryCategory: "Unknown",
    description: raw.summary ?? "",
    ratingsSummary: {
      average: typeof raw.score === "number" ? raw.score : 0,
      count: 0,
    },
    screenshots: [],
    free: raw.free !== false,
    confidence: "medium",
    provenance: "live",
  };
  if (raw.icon !== undefined) record.iconUrl = raw.icon;
  if (raw.scoreText !== undefined) record.scoreText = raw.scoreText;
  if (raw.url !== undefined) record.url = raw.url;
  return record;
}

function toPreview(record: AndroidAppRecord): AndroidAppPreview {
  const preview: AndroidAppPreview = {
    packageName: record.packageName,
    name: record.name,
    developer: record.developer,
    primaryCategory: record.primaryCategory,
    ratingsSummary: record.ratingsSummary,
    confidence: record.confidence,
    provenance: record.provenance,
  };
  if (record.iconUrl !== undefined) preview.iconUrl = record.iconUrl;
  return preview;
}

function synthesizePreview(input: {
  packageName: string;
  name: string;
  developer: string;
}): AndroidAppPreview {
  return {
    packageName: input.packageName,
    name: input.name,
    developer: input.developer,
    primaryCategory: "Productivity",
    ratingsSummary: { average: 4.3, count: 1024 },
    confidence: "low",
    provenance: "fixture",
  };
}

function derivedNameFromPackage(packageName: string): string {
  const tail = packageName.split(".").pop() ?? packageName;
  return titleCase(tail.replace(/[-_]/g, " "));
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "app"
  );
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function estimateBytes(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}
