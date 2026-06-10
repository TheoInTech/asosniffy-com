import { env } from "../env.js";
import { withCache } from "../cache/wrapper.js";
import { cacheKey } from "../cache/keys.js";
import {
  assembleWebDiscoverability,
  parseAasa,
  parseAppSchema,
  parseAssetlinks,
  parseOg,
  parseRobotsForAiCrawlers,
  parseSmartAppBanner,
  type AiCrawlerDirectives,
  type AppSchemaFinding,
  type OgFinding,
  type SmartAppBannerFinding,
  type WebDiscoverability,
} from "../scoring/web-discoverability.js";
import type { Provenance } from "../schemas/index.js";

// Wave 2.2 — web-audit provider.
//
// Performs the 4 bounded fetches behind the webDiscoverability section (and
// the free-quote webPlumbing teaser): the marketing page HTML, the AASA file
// (/.well-known/apple-app-site-association with the spec'd root fallback),
// /.well-known/assetlinks.json, and /robots.txt. All parsing lives in
// scoring/web-discoverability.ts (pure, fixture-tested); this file owns
// network, cache, and safety only.
//
// Failure semantics (roadmap 2.2):
//   • A missing well-known file / robots.txt is a FINDING (absent), never
//     an error — that absence IS the audit result.
//   • Only a failed PAGE fetch nulls the whole audit (nothing to grade).
//   • The provider never throws; every failure path degrades to null so
//     quote/diagnose never block on a founder's marketing site.
//
// Cache: identity-INDEPENDENT artifacts are cached by (origin, ISO week),
// TTL 7 days, audit provider "web-audit". Bundle/package matching and
// ratingDrift are recomputed per request from the cached artifacts — a
// developer shipping several apps off one marketing domain must not inherit
// a sibling app's AASA match or rating drift from the cache. Provenance is
// "live" on a fresh audit; the cache wrapper rewrites it to "cached" on hit.
//
// SECURITY (SSRF defense in depth — the URL comes from the iTunes
// sellerUrl/marketingUrl, but we treat it as untrusted):
//   • http(s) only; localhost / *.localhost / 0.0.0.0 / IPv6 literals and
//     the RFC 1918 + link-local IPv4 ranges (127.*, 10.*, 192.168.*,
//     169.254.*, 172.16-31.*) are rejected.
//   • Redirects are followed manually (max 3 hops) and EVERY hop re-runs
//     the same guard.
//   • Bodies are read through a 512 KB cap with a 5 s per-fetch timeout.
//   • Logs/errors never include fetched content — hostname only.
//
// What this provider deliberately does NOT do: it makes no claims about
// rank or traffic impact, performs no DNS-level private-IP resolution
// checks (hostname heuristics only — documented gap), and emits no
// recommendations; the editorial stance for this section is hygiene facts
// only (no web-checkout / install-diversion advice — see the scoring
// module header and research-pseo-landing.md).

const PROVIDER = "web-audit";
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;
const FETCH_TIMEOUT_MS = 5_000;
const MAX_BODY_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Sniffy/1.0 (+https://gosniffy.vercel.app/bot) Chrome/130.0.0.0 Safari/537.36";

export interface WebAuditInput {
  url: string;
  bundleId: string | null;
  packageName: string | null;
  storeRating: number | null;
}

export interface WebAuditOpts {
  enabled?: boolean;
  // DI seam for tests (same convention as llm-mention's injected client and
  // product-context's injected scrape) — all four fetches go through this.
  fetchImpl?: typeof fetch;
}

// Identity-independent artifacts — everything derivable from the domain
// alone. AASA/assetlinks are stored as raw text (null = absent) so the
// per-app bundle/package matching happens OUTSIDE the cache.
interface WebAuditArtifacts {
  finalUrl: string;
  smartAppBanner: SmartAppBannerFinding;
  appSchema: AppSchemaFinding;
  openGraph: OgFinding;
  robotsTxtPresent: boolean;
  aiCrawlers: AiCrawlerDirectives;
  aasaText: string | null;
  assetlinksText: string | null;
  checkedAt: string;
  provenance: Provenance;
}

export async function fetchWebDiscoverability(
  input: WebAuditInput,
  opts?: WebAuditOpts,
): Promise<WebDiscoverability | null> {
  const enabled = opts?.enabled ?? env.WEB_AUDIT_ENABLED;
  if (!enabled) return null;

  const target = validateAuditUrl(input.url);
  if (target === null) return null;
  const fetchImpl = opts?.fetchImpl ?? fetch;

  try {
    const artifacts = await withCache<WebAuditArtifacts | { error: string }>(
      () => auditOnce(target, fetchImpl),
      {
        key: cacheKey({
          namespace: PROVIDER,
          extra: { origin: target.origin, week: isoWeekKey(new Date()) },
        }),
        ttlSeconds: SEVEN_DAYS_SECONDS,
        namespace: PROVIDER,
        audit: { provider: PROVIDER, endpoint: "/audit" },
        validate: isWebAuditArtifacts,
      },
    );
    if ("error" in artifacts) return null;

    return assembleWebDiscoverability({
      url: artifacts.finalUrl,
      smartAppBanner: artifacts.smartAppBanner,
      appSchema: artifacts.appSchema,
      universalLinks:
        artifacts.aasaText === null
          ? { present: false }
          : parseAasa(artifacts.aasaText, input.bundleId),
      androidAppLinks:
        artifacts.assetlinksText === null
          ? { present: false }
          : parseAssetlinks(artifacts.assetlinksText, input.packageName),
      robotsTxtPresent: artifacts.robotsTxtPresent,
      aiCrawlers: artifacts.aiCrawlers,
      openGraph: artifacts.openGraph,
      storeRating: input.storeRating,
      checkedAt: artifacts.checkedAt,
      provenance: artifacts.provenance,
    });
  } catch {
    // never-throw discipline: cache/transport surprises degrade to null.
    return null;
  }
}

// --- One full audit (cache miss path) ----------------------------------------

async function auditOnce(
  target: URL,
  fetchImpl: typeof fetch,
): Promise<WebAuditArtifacts | { error: string }> {
  const page = await fetchBounded(target.toString(), fetchImpl, {
    requireHtml: true,
  });
  if (page === null) {
    logEvent("web_audit_page_failed", target.hostname);
    return { error: "page_fetch_failed" };
  }

  // Well-known fetches run against the FINAL page origin (marketing URLs
  // commonly redirect apex ↔ www; the post-redirect host is the one whose
  // association files matter for the pages a visitor actually lands on).
  const origin = new URL(page.finalUrl).origin;
  const [aasa, assetlinks, robots] = await Promise.all([
    fetchAasaText(origin, fetchImpl),
    fetchBounded(`${origin}/.well-known/assetlinks.json`, fetchImpl),
    fetchBounded(`${origin}/robots.txt`, fetchImpl),
  ]);

  logEvent("web_audit", target.hostname, {
    aasaPresent: aasa !== null,
    assetlinksPresent: assetlinks !== null,
    robotsPresent: robots !== null,
  });

  return {
    finalUrl: page.finalUrl,
    smartAppBanner: parseSmartAppBanner(page.text),
    appSchema: parseAppSchema(page.text),
    openGraph: parseOg(page.text),
    robotsTxtPresent: robots !== null,
    aiCrawlers:
      robots !== null
        ? parseRobotsForAiCrawlers(robots.text)
        : { gptBot: "allowed", perplexityBot: "allowed", googleExtended: "allowed" },
    aasaText: aasa?.text ?? null,
    assetlinksText: assetlinks?.text ?? null,
    checkedAt: new Date().toISOString(),
    provenance: "live",
  };
}

// AASA spec allows both /.well-known/apple-app-site-association and the
// root /apple-app-site-association; check both before declaring absence.
async function fetchAasaText(
  origin: string,
  fetchImpl: typeof fetch,
): Promise<{ text: string } | null> {
  const wellKnown = await fetchBounded(
    `${origin}/.well-known/apple-app-site-association`,
    fetchImpl,
  );
  if (wellKnown !== null) return wellKnown;
  return fetchBounded(`${origin}/apple-app-site-association`, fetchImpl);
}

// --- Bounded, SSRF-guarded fetch ----------------------------------------------

interface BoundedFetchResult {
  text: string;
  finalUrl: string;
}

async function fetchBounded(
  url: string,
  fetchImpl: typeof fetch,
  opts?: { requireHtml?: boolean },
): Promise<BoundedFetchResult | null> {
  let current = validateAuditUrl(url);
  if (current === null) return null;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetchImpl(current.toString(), {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: opts?.requireHtml ? "text/html,application/xhtml+xml" : "*/*",
        },
        redirect: "manual",
        signal: ac.signal,
      });
    } catch {
      clearTimeout(timer);
      return null;
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      clearTimeout(timer);
      const location = res.headers.get("location");
      if (location === null) return null;
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return null;
      }
      // Re-run the SSRF guard on EVERY hop — a public marketing domain
      // redirecting into link-local/private space is the classic bypass.
      const validated = validateAuditUrl(next.toString());
      if (validated === null) return null;
      current = validated;
      continue;
    }

    if (!res.ok) {
      clearTimeout(timer);
      return null;
    }
    if (opts?.requireHtml) {
      const contentType = res.headers.get("content-type") ?? "";
      // Lenient when the header is missing entirely; strict when it names a
      // non-HTML type.
      if (contentType.length > 0 && !contentType.includes("html")) {
        clearTimeout(timer);
        return null;
      }
    }
    const text = await readBoundedText(res, MAX_BODY_BYTES);
    clearTimeout(timer);
    if (text === null) return null;
    return { text, finalUrl: current.toString() };
  }
  return null; // redirect chain exceeded the cap
}

// Reads at most maxBytes from the body. Oversized AASA/assetlinks files
// therefore parse as invalid JSON past the cap — documented tradeoff; real
// association files are kilobytes.
async function readBoundedText(res: Response, maxBytes: number): Promise<string | null> {
  try {
    const body = res.body;
    if (body === null) {
      const text = await res.text();
      return text.length > maxBytes ? text.slice(0, maxBytes) : text;
    }
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
    try {
      await reader.cancel();
    } catch {
      /* no-op */
    }
    const merged = new Uint8Array(Math.min(total, maxBytes));
    let offset = 0;
    for (const chunk of chunks) {
      const remaining = merged.length - offset;
      if (remaining <= 0) break;
      merged.set(remaining >= chunk.byteLength ? chunk : chunk.subarray(0, remaining), offset);
      offset += Math.min(chunk.byteLength, remaining);
    }
    return new TextDecoder("utf-8", { fatal: false }).decode(merged);
  } catch {
    return null;
  }
}

// --- SSRF guard ------------------------------------------------------------------

// Hostname-pattern guard (no DNS resolution): http(s) only, and none of the
// loopback / private / link-local ranges the roadmap lists (plus 172.16/12,
// 0.0.0.0 and IPv6 literals as extra defense). Exported for direct testing.
export function validateAuditUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (host.length === 0) return null;
  if (host === "localhost" || host.endsWith(".localhost")) return null;
  // IPv6 literals (URL.hostname keeps the brackets) — reject wholesale.
  if (host.includes(":") || host.startsWith("[")) return null;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4 !== null) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 0 || a === 10 || a === 127) return null;
    if (a === 169 && b === 254) return null;
    if (a === 172 && b >= 16 && b <= 31) return null;
    if (a === 192 && b === 168) return null;
  }
  return url;
}

// --- Cache plumbing ----------------------------------------------------------------

function isWebAuditArtifacts(value: unknown): value is WebAuditArtifacts {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<WebAuditArtifacts>;
  return (
    typeof v.finalUrl === "string" &&
    typeof v.checkedAt === "string" &&
    typeof v.robotsTxtPresent === "boolean" &&
    typeof v.smartAppBanner === "object" &&
    v.smartAppBanner !== null &&
    typeof v.appSchema === "object" &&
    v.appSchema !== null &&
    typeof v.aiCrawlers === "object" &&
    v.aiCrawlers !== null &&
    (typeof v.aasaText === "string" || v.aasaText === null) &&
    (typeof v.assetlinksText === "string" || v.assetlinksText === null)
  );
}

// ISO-8601 week key (e.g. "2026-W24") — the (origin, week) cache
// discriminator from the roadmap. Uses the ISO week-year so the Jan-1
// boundary buckets correctly.
function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// --- Telemetry (hostname only — never fetched content) ------------------------------

function logEvent(
  event: string,
  hostname: string,
  extra?: Record<string, boolean>,
): void {
  if (process.env.ENABLE_REQUEST_LOG === "false") return;
  process.stdout.write(
    `${JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      event,
      hostname,
      ...extra,
    })}\n`,
  );
}
