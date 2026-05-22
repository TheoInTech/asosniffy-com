import { recordInvocation, responseHash } from "../../observability/audit.js";
import { recordResponseShape } from "../../observability/shape-hash.js";
import { withCache } from "../../cache/wrapper.js";
import { cacheKey } from "../../cache/keys.js";
import { getCacheClient } from "../../cache/redis.js";
import { createHash } from "node:crypto";

// Phase 9 (Day 4) — Google Play search autocomplete.
//
// Devsecops note: Google adversarially blocks scraper-style traffic from
// datacenter IP ranges (Railway egress is flagged). This module defaults
// every successful response to a confidence-degraded posture and
// circuit-trips after CIRCUIT_THRESHOLD consecutive blocks within
// CIRCUIT_WINDOW_MS, after which we skip the call entirely for the
// remainder of the window and let the upstream caller substitute its
// own keyword tokenization fallback.
//
// Response can be JSONP-wrapped — we strip a leading `)]}'` prefix
// defensively before JSON.parse.

const GOOGLE_AUTOCOMPLETE_URL =
  "https://market.android.com/suggest/SuggRequest";
const PROVIDER = "google-play-autocomplete";
const USER_AGENT =
  "ASOSniffy/0.1 (+https://github.com/TheoInTech/asosniffy-com)";
const FETCH_TIMEOUT_MS = 4000;
const CACHE_TTL_SECONDS = 14 * 24 * 60 * 60;
const MAX_SUGGESTIONS = 10;

const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_WINDOW_MS = 10 * 60 * 1000;
const CIRCUIT_KEY = "aso:circuit:google-autocomplete";

export interface AndroidAutocompleteInput {
  term: string;
  country: string;
}

export interface AndroidAutocompleteHit {
  term: string;
}

export type AndroidAutocompleteOutcome =
  | { kind: "success"; hits: AndroidAutocompleteHit[] }
  | { kind: "empty" }
  | { kind: "rate_limited" }
  | { kind: "network_error" }
  | { kind: "schema_drift" }
  | { kind: "circuit_open" };

export async function fetchAndroidAutocomplete(
  input: AndroidAutocompleteInput,
): Promise<AndroidAutocompleteOutcome> {
  const term = input.term.trim();
  if (term.length === 0) return { kind: "empty" };

  if (await isCircuitOpen()) {
    return { kind: "circuit_open" };
  }

  return withCache(
    () => fetchAndroidAutocompleteLive(term, input.country),
    {
      key: cacheKey({
        namespace: "android:autocomplete",
        country: input.country,
        extra: { sha: sha1(term.toLowerCase()) },
      }),
      ttlSeconds: CACHE_TTL_SECONDS,
      namespace: "android:autocomplete",
    },
  );
}

async function fetchAndroidAutocompleteLive(
  term: string,
  country: string,
): Promise<AndroidAutocompleteOutcome> {
  const params = new URLSearchParams({
    json: "1",
    query: term,
    hl: "en",
    gl: country.toLowerCase(),
  });
  const url = `${GOOGLE_AUTOCOMPLETE_URL}?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json,text/javascript",
      },
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    recordInvocation({
      provider: PROVIDER,
      endpoint: "/suggest/SuggRequest",
      source: "live",
      latencyMs: Date.now() - started,
      bytesIn: 0,
      responseHash: "",
      errorKind: "network_error",
    });
    await registerCircuitFailure();
    return { kind: "network_error" };
  }
  clearTimeout(timer);

  if (res.status === 429 || res.status === 403) {
    recordInvocation({
      provider: PROVIDER,
      endpoint: "/suggest/SuggRequest",
      source: "live",
      latencyMs: Date.now() - started,
      bytesIn: 0,
      responseHash: "",
      httpStatus: res.status,
      errorKind: "rate_limited",
    });
    await registerCircuitFailure();
    return { kind: "rate_limited" };
  }
  if (!res.ok) {
    recordInvocation({
      provider: PROVIDER,
      endpoint: "/suggest/SuggRequest",
      source: "live",
      latencyMs: Date.now() - started,
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
    parsed = parseGoogleSuggestBody(text);
  } catch {
    recordInvocation({
      provider: PROVIDER,
      endpoint: "/suggest/SuggRequest",
      source: "live",
      latencyMs: Date.now() - started,
      bytesIn: text.length,
      responseHash: "",
      httpStatus: res.status,
      errorKind: "schema_drift",
    });
    return { kind: "schema_drift" };
  }

  const hits = extractAndroidHits(parsed);
  recordInvocation({
    provider: PROVIDER,
    endpoint: "/suggest/SuggRequest",
    source: "live",
    latencyMs: Date.now() - started,
    bytesIn: text.length,
    responseHash: responseHash(parsed),
    httpStatus: res.status,
  });
  void recordResponseShape({
    provider: PROVIDER,
    endpoint: "/suggest/SuggRequest",
    value: parsed,
  });

  if (hits.length === 0) return { kind: "empty" };
  return { kind: "success", hits };
}

// Google sometimes ships a JSONP-style anti-XSSI prefix: `)]}'\n` or
// `while(1);`. Strip them defensively before JSON.parse.
export function parseGoogleSuggestBody(text: string): unknown {
  let body = text.trim();
  if (body.startsWith(")]}'\n")) body = body.slice(5);
  else if (body.startsWith(")]}'")) body = body.slice(4);
  else if (body.startsWith("while(1);")) body = body.slice(9);
  return JSON.parse(body);
}

export function _internal_extractAndroidHits_forTests(
  body: unknown,
): AndroidAutocompleteHit[] {
  return extractAndroidHits(body);
}

function extractAndroidHits(body: unknown): AndroidAutocompleteHit[] {
  if (!Array.isArray(body)) return [];
  const out: AndroidAutocompleteHit[] = [];
  const seen = new Set<string>();
  for (const item of body) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    // Google's suggest format varies — `s` (suggestion) and `t` (token)
    // are both observed.
    const raw = (obj.s ?? obj.t ?? obj.term) as unknown;
    if (typeof raw !== "string") continue;
    const term = raw.trim();
    if (term.length === 0) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ term });
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

async function isCircuitOpen(): Promise<boolean> {
  try {
    const cache = getCacheClient();
    const raw = await cache.get(CIRCUIT_KEY);
    if (raw === null) return false;
    const parsed = JSON.parse(raw) as {
      count: number;
      openedAt: number;
    };
    if (parsed.count < CIRCUIT_THRESHOLD) return false;
    const elapsed = Date.now() - parsed.openedAt;
    return elapsed < CIRCUIT_WINDOW_MS;
  } catch {
    return false;
  }
}

async function registerCircuitFailure(): Promise<void> {
  try {
    const cache = getCacheClient();
    const raw = await cache.get(CIRCUIT_KEY);
    let state: { count: number; openedAt: number };
    if (raw === null) {
      state = { count: 1, openedAt: Date.now() };
    } else {
      const parsed = JSON.parse(raw) as {
        count: number;
        openedAt: number;
      };
      const elapsed = Date.now() - parsed.openedAt;
      if (elapsed >= CIRCUIT_WINDOW_MS) {
        state = { count: 1, openedAt: Date.now() };
      } else {
        state = { count: parsed.count + 1, openedAt: parsed.openedAt };
      }
    }
    await cache.set(
      CIRCUIT_KEY,
      JSON.stringify(state),
      Math.ceil(CIRCUIT_WINDOW_MS / 1000),
    );
  } catch {
    // Circuit is best-effort observability — swallow Redis errors.
  }
}

function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}
