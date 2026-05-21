import { recordInvocation, responseHash } from "../../observability/audit.js";
import { recordResponseShape } from "../../observability/shape-hash.js";
import type { Provenance } from "../../schemas/index.js";

// Apple App Store storefront-page scraper.
//
// iTunes Search /lookup does not return `subtitle`. The user-visible subtitle
// (e.g. "Scoring, drills & overlays" on https://apps.apple.com/us/app/id6762223327)
// is rendered server-side from the AMP API and embedded inline in the page
// inside a `<script id="shoebox-media-api-cache-apps" type="fastboot/shoebox">`
// JSON island. This module fetches that page and extracts the subtitle.
//
// Selector ladder (most structurally-stable first):
//   1. Shoebox JSON   → `d[0].attributes.subtitle` from any cached AMP entry
//   2. DOM fallback   → text of `<h2 class="…product-header__subtitle…">`
//
// On failure (network error, 4xx, parse miss) we return undefined subtitle
// rather than fabricate. The orchestrator labels that case provenance
// `degraded`, and the scoring layer swaps the "subtitle is empty" advisory
// for "subtitle source unavailable" so we never tell an app with a real
// subtitle that it is missing.

const APPS_APPLE_BASE = "https://apps.apple.com";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.5 Safari/605.1.15 ASOSniffy/0.1";
const PROVIDER = "apple-storefront-page";
const ENDPOINT = "/app/id";
const TIMEOUT_MS = 5000;

export interface FetchStorefrontPageInput {
  appId: string;
  country: string;
}

export type StorefrontPageSource = "serialized-data" | "shoebox" | "dom";

export interface StorefrontPageResult {
  subtitle?: string;
  source?: StorefrontPageSource;
  scrapedAt: string;
  // Always "live" when returned from the provider; rewritten to "cached" by
  // withCache on a cache hit. Lets downstream callers decide subtitle
  // provenance without re-querying the audit log.
  provenance: Provenance;
}

export type StorefrontPageError =
  | { error: "rate_limited" }
  | { error: "not_found" }
  | { error: "network_error" };

export async function fetchStorefrontPage(
  input: FetchStorefrontPageInput,
): Promise<StorefrontPageResult | StorefrontPageError> {
  const country = input.country.toLowerCase();
  const url = `${APPS_APPLE_BASE}/${country}/app/id${encodeURIComponent(input.appId)}`;
  const started = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
      redirect: "follow",
    });
  } catch {
    clearTimeout(timer);
    recordInvocation({
      provider: PROVIDER,
      endpoint: ENDPOINT,
      source: "live",
      latencyMs: Date.now() - started,
      bytesIn: 0,
      responseHash: "",
      errorKind: "network_error",
    });
    return { error: "network_error" };
  }
  clearTimeout(timer);

  if (res.status === 404) {
    recordInvocation({
      provider: PROVIDER,
      endpoint: ENDPOINT,
      source: "live",
      latencyMs: Date.now() - started,
      bytesIn: 0,
      responseHash: "",
      httpStatus: 404,
      errorKind: "not_found",
    });
    return { error: "not_found" };
  }
  if (res.status === 403 || res.status === 429) {
    recordInvocation({
      provider: PROVIDER,
      endpoint: ENDPOINT,
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
      endpoint: ENDPOINT,
      source: "live",
      latencyMs: Date.now() - started,
      bytesIn: 0,
      responseHash: "",
      httpStatus: res.status,
      errorKind: "network_error",
    });
    return { error: "network_error" };
  }

  const html = await res.text().catch(() => "");
  const latencyMs = Date.now() - started;

  const extracted = extractSubtitle(html);

  recordInvocation({
    provider: PROVIDER,
    endpoint: ENDPOINT,
    source: "live",
    latencyMs,
    bytesIn: html.length,
    responseHash: responseHash({
      subtitle: extracted.subtitle ?? null,
      source: extracted.source ?? null,
    }),
    httpStatus: res.status,
    ...(extracted.subtitle === undefined
      ? { errorKind: "schema_drift" as const }
      : {}),
  });

  // Drift probe — hash the per-app structured entry's shape, not the entire
  // serialized payload (which contains URLs / IDs that vary per request and
  // would otherwise look like drift on every call).
  const driftValue = extracted.serializedLockup ?? extracted.shoeboxAppEntry;
  if (driftValue !== undefined) {
    void recordResponseShape({
      provider: PROVIDER,
      endpoint: ENDPOINT,
      value: driftValue,
    });
  }

  return {
    scrapedAt: new Date().toISOString(),
    provenance: "live",
    ...(extracted.subtitle !== undefined ? { subtitle: extracted.subtitle } : {}),
    ...(extracted.source !== undefined ? { source: extracted.source } : {}),
  };
}

interface ExtractionInternal {
  subtitle?: string;
  source?: StorefrontPageSource;
  shoeboxAppEntry?: unknown;
  serializedLockup?: unknown;
}

// Exported for test purposes. Pure: no IO, no audit.
export function extractSubtitle(html: string): ExtractionInternal {
  // 1) Svelte-era serialized-server-data path. Apple's current apps.apple.com
  //    embeds the AMP lockup as `<script type="application/json"
  //    id="serialized-server-data">...</script>`. Walk to a `lockup` object
  //    with a `subtitle` string — that's the canonical App Store subtitle.
  const serialized = parseSerializedServerData(html);
  if (serialized) {
    const hit = findSerializedSubtitle(serialized);
    if (hit) {
      return {
        subtitle: hit.subtitle,
        source: "serialized-data",
        serializedLockup: hit.entry,
      };
    }
  }

  // 2) Pre-Svelte shoebox path. Older mirrored pages and some regional
  //    storefronts still ship the AMP cache as fastboot/shoebox JSON.
  const shoebox = parseShoebox(html);
  if (shoebox) {
    const hit = findShoeboxSubtitle(shoebox);
    if (hit) {
      return {
        subtitle: hit.subtitle,
        source: "shoebox",
        shoeboxAppEntry: hit.entry,
      };
    }
  }

  // 3) DOM fallback — covers both the new Svelte `<p class="subtitle ...">`
  //    and the legacy `<h2 class="product-header__subtitle">`.
  const fromDom = matchDomSubtitle(html);
  if (fromDom !== undefined) {
    return { subtitle: fromDom, source: "dom" };
  }

  return {};
}

interface SerializedHit {
  subtitle: string;
  entry: unknown;
}

function parseSerializedServerData(html: string): unknown | null {
  const re = /<script[^>]+id=["']serialized-server-data["'][^>]*>([\s\S]*?)<\/script>/i;
  const m = re.exec(html);
  if (!m || !m[1]) return null;
  try {
    return JSON.parse(m[1].trim());
  } catch {
    return null;
  }
}

function findSerializedSubtitle(root: unknown): SerializedHit | null {
  // Walk for any object that LOOKS like an Apple "lockup" — has both `title`
  // and `subtitle` strings — and surface the subtitle. Falls back to a plain
  // `subtitle` field if no lockup is found.
  let plainSubtitle: SerializedHit | null = null;
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (Array.isArray(node)) {
      for (const child of node) stack.push(child);
      continue;
    }
    if (!isRecord(node)) continue;
    const subtitle = node["subtitle"];
    if (typeof subtitle === "string" && subtitle.length > 0) {
      const title = node["title"];
      if (typeof title === "string" && title.length > 0) {
        // Confirmed lockup-shaped node → highest confidence; return immediately.
        return { subtitle, entry: node };
      }
      // Hold the first plain subtitle in case no lockup is found.
      if (!plainSubtitle) plainSubtitle = { subtitle, entry: node };
    }
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") stack.push(value);
    }
  }
  return plainSubtitle;
}

function parseShoebox(html: string): Record<string, unknown> | null {
  const re = /<script[^>]+id=["']shoebox-media-api-cache-apps["'][^>]*>([\s\S]*?)<\/script>/i;
  const m = re.exec(html);
  if (!m || !m[1]) return null;
  const text = m[1].trim();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

interface ShoeboxHit {
  subtitle: string;
  entry: unknown;
}

function findShoeboxSubtitle(
  shoebox: Record<string, unknown>,
): ShoeboxHit | null {
  // Outer keys are AMP API URLs; values are stringified AMP responses
  // shaped `{ d: [ { attributes: { subtitle, name, ... } } ] }`.
  for (const value of Object.values(shoebox)) {
    let payload: unknown = value;
    if (typeof value === "string") {
      try {
        payload = JSON.parse(value);
      } catch {
        continue;
      }
    }
    const hit = readSubtitleFromAmpResponse(payload);
    if (hit) return hit;
  }
  return null;
}

function readSubtitleFromAmpResponse(payload: unknown): ShoeboxHit | null {
  if (!isRecord(payload)) return null;
  const data = payload["d"];
  if (!Array.isArray(data)) return null;
  for (const entry of data) {
    if (!isRecord(entry)) continue;
    const attrs = entry["attributes"];
    if (!isRecord(attrs)) continue;
    const subtitle = attrs["subtitle"];
    if (typeof subtitle === "string" && subtitle.length > 0) {
      return { subtitle, entry };
    }
  }
  return null;
}

function matchDomSubtitle(html: string): string | undefined {
  // New Svelte-era pattern: `<p class="subtitle svelte-...">…</p>`. The
  // svelte- suffix is generated per Apple build so we match the bare
  // `subtitle` class token. Old `<h2 class="product-header__subtitle">` is
  // still tried as a second pass for legacy storefronts.
  const candidates: RegExp[] = [
    /<p[^>]*class=["'](?:[^"']*\s)?subtitle(?:\s[^"']*)?["'][^>]*>([\s\S]*?)<\/p>/i,
    /<h2[^>]*class=["'][^"']*product-header__subtitle[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i,
  ];
  for (const re of candidates) {
    const m = re.exec(html);
    if (m && m[1]) {
      const text = decodeHtmlEntities(stripTags(m[1])).trim();
      if (text.length > 0) return text;
    }
  }
  return undefined;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#x27;": "'",
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeHtmlEntities(s: string): string {
  return s.replace(
    /&(amp|lt|gt|quot|#x27|#39|apos|nbsp);/g,
    (m) => HTML_ENTITIES[m] ?? m,
  );
}
