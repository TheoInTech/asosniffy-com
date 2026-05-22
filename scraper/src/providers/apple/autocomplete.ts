import { recordInvocation, responseHash } from "../../observability/audit.js";
import { recordResponseShape } from "../../observability/shape-hash.js";
import { withCache } from "../../cache/wrapper.js";
import { cacheKey } from "../../cache/keys.js";
import { createHash } from "node:crypto";

// Phase 9 (Day 4) — Apple App Store search autocomplete (MZSearchHints).
//
// Real-user-query suggestions Apple serves to its own search field. The
// endpoint is undocumented but stable enough that ASO vendors have used
// it for years; we treat it as best-effort and never let a failure here
// break /diagnose.
//
// Hardcoded URL (no env override) keeps the SSRF surface zero — even if a
// user-controllable string ever flowed near the URL builder, the hostname
// can't be changed. Cache for 7 days (suggestions move slowly). Strict
// Zod-shaped parse with inferred fallback so a shape change at Apple
// doesn't 500 us.
//
// USER_AGENT is the same identifiable string used by the iTunes provider —
// Apple generally accepts requests with a UA that links back to a public
// project. We deliberately do NOT spoof iTunes/AppStore/Mobile-Safari UAs;
// spoofing gets caught faster than honest disclosure.

const APPLE_AUTOCOMPLETE_URL =
  "https://search.itunes.apple.com/WebObjects/MZSearchHints.woa/wa/hints";
const PROVIDER = "apple-autocomplete";
const USER_AGENT =
  "ASOSniffy/0.1 (+https://github.com/TheoInTech/asosniffy-com)";
const FETCH_TIMEOUT_MS = 4000;
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_SUGGESTIONS = 10;

export interface AppleAutocompleteInput {
  term: string;
  country: string; // ISO 3166-1 alpha-2 (e.g. "US")
}

export interface AppleAutocompleteHit {
  term: string;
  // Apple's hints API surfaces a "priority" int (lower = higher rank);
  // we surface it raw so consumers can rank within the result set.
  priority: number | null;
}

export type AppleAutocompleteOutcome =
  | { kind: "success"; hits: AppleAutocompleteHit[] }
  | { kind: "empty" }
  | { kind: "rate_limited" }
  | { kind: "network_error" }
  | { kind: "schema_drift" };

export async function fetchAppleAutocomplete(
  input: AppleAutocompleteInput,
): Promise<AppleAutocompleteOutcome> {
  const term = input.term.trim();
  if (term.length === 0) return { kind: "empty" };

  return withCache(
    () => fetchAppleAutocompleteLive(term, input.country),
    {
      key: cacheKey({
        namespace: "apple:autocomplete",
        country: input.country,
        extra: { sha: sha1(term.toLowerCase()) },
      }),
      ttlSeconds: CACHE_TTL_SECONDS,
      namespace: "apple:autocomplete",
    },
  );
}

async function fetchAppleAutocompleteLive(
  term: string,
  country: string,
): Promise<AppleAutocompleteOutcome> {
  const params = new URLSearchParams({
    clientApplication: "Software",
    term,
    // The API doesn't take a country query param, but routing through the
    // country-specific Accept-Language header nudges Apple's CDN toward
    // localized hints. Defensive — Apple may ignore it entirely.
  });
  const url = `${APPLE_AUTOCOMPLETE_URL}?${params.toString()}`;
  const acceptLanguage = `${country.toLowerCase()}-${country.toUpperCase()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        "Accept-Language": acceptLanguage,
      },
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    recordInvocation({
      provider: PROVIDER,
      endpoint: "/WebObjects/MZSearchHints.woa/wa/hints",
      source: "live",
      latencyMs: Date.now() - started,
      bytesIn: 0,
      responseHash: "",
      errorKind: "network_error",
    });
    return { kind: "network_error" };
  }
  clearTimeout(timer);

  if (res.status === 429 || res.status === 403) {
    recordInvocation({
      provider: PROVIDER,
      endpoint: "/WebObjects/MZSearchHints.woa/wa/hints",
      source: "live",
      latencyMs: Date.now() - started,
      bytesIn: 0,
      responseHash: "",
      httpStatus: res.status,
      errorKind: "rate_limited",
    });
    return { kind: "rate_limited" };
  }
  if (!res.ok) {
    recordInvocation({
      provider: PROVIDER,
      endpoint: "/WebObjects/MZSearchHints.woa/wa/hints",
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
    parsed = JSON.parse(text);
  } catch {
    recordInvocation({
      provider: PROVIDER,
      endpoint: "/WebObjects/MZSearchHints.woa/wa/hints",
      source: "live",
      latencyMs: Date.now() - started,
      bytesIn: text.length,
      responseHash: "",
      httpStatus: res.status,
      errorKind: "schema_drift",
    });
    return { kind: "schema_drift" };
  }

  const hits = extractAppleHits(parsed);
  recordInvocation({
    provider: PROVIDER,
    endpoint: "/WebObjects/MZSearchHints.woa/wa/hints",
    source: "live",
    latencyMs: Date.now() - started,
    bytesIn: text.length,
    responseHash: responseHash(parsed),
    httpStatus: res.status,
  });
  void recordResponseShape({
    provider: PROVIDER,
    endpoint: "/WebObjects/MZSearchHints.woa/wa/hints",
    value: parsed,
  });

  if (hits.length === 0) return { kind: "empty" };
  return { kind: "success", hits };
}

// Exposed for tests. Walks the documented (and several undocumented)
// nesting paths Apple has shipped over the years.
export function _internal_extractAppleHits_forTests(
  body: unknown,
): AppleAutocompleteHit[] {
  return extractAppleHits(body);
}

function extractAppleHits(body: unknown): AppleAutocompleteHit[] {
  if (!body || typeof body !== "object") return [];
  const root = body as Record<string, unknown>;
  // Canonical shape: { hints: [ { term: "...", priority: 0 }, ... ] }
  const hints = (root.hints ?? root.searchHints ?? []) as Array<
    Record<string, unknown>
  >;
  if (!Array.isArray(hints)) return [];
  const out: AppleAutocompleteHit[] = [];
  const seen = new Set<string>();
  for (const h of hints) {
    if (!h || typeof h !== "object") continue;
    const raw = (h.term ?? h.hint ?? h.kind) as unknown;
    if (typeof raw !== "string") continue;
    const term = raw.trim();
    if (term.length === 0) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const priority = typeof h.priority === "number" ? h.priority : null;
    out.push({ term, priority });
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}
