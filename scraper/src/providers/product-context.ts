import { load as loadHtml } from "cheerio";
import { Browserbase } from "@browserbasehq/sdk";
import { chromium } from "playwright-core";
import { env } from "../env.js";
import { withCache } from "../cache/wrapper.js";
import { cacheKey } from "../cache/keys.js";
import type { Provenance } from "../schemas/index.js";

// Phase B — Product-context provider.
//
// Given a developer's marketing site (sellerUrl, sourced from iTunes), this
// scrapes the homepage and 3-5 priority internal pages, then extracts noun
// phrases / audience tokens / topical keywords. The synthesis layer consumes
// the returned ProductProfile as a new OpportunityKeyword source weighted
// ABOVE any competitor tier — the app's own marketing copy is the most
// authoritative signal of what it actually does.
//
// Two-tier scrape strategy (Option C, no Firecrawl dependency):
//   1. Static path: `fetch(url)` + cheerio. Free. Works on ~70-80% of
//      indie founder sites (Carrd, Webflow SSR, Framer SSR, GitHub Pages,
//      Astro, Next.js SSR/SSG, most marketing sites). Variable cost: $0.
//   2. Browserbase fallback: when static returns thin content (<N visible
//      text characters or no extractable structure) AND a Browserbase key
//      is configured, render via remote Chromium → re-extract. Cost:
//      ~$0.0002-$0.0008 per fallback scrape, 10-30× cheaper than
//      Firecrawl. Gated on env BROWSERBASE_API_KEY + BROWSERBASE_PROJECT_ID.
//
// When BOTH paths fail (no key configured AND static returned thin content,
// or both errored), we return provenance:"degraded" with empty arrays. The
// orchestrator threads this through; the synthesis engine continues with
// the competitor + user-keyword opportunity pool alone.
//
// Cost discipline:
//   • 30-day per-URL Redis cache absorbs ~90% of repeat traffic.
//   • Hard cap: 5 pages per call (homepage + up to 4 internal).
//   • 15-second per-URL fetch timeout.
//   • Browserbase fallback only fires when static fails AND the env is set,
//     so the dormant case (no key) costs zero.

const PRODUCT_CONTEXT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const STATIC_FETCH_TIMEOUT_MS = 15_000;
const HEADLESS_TIMEOUT_MS = 30_000;
const STATIC_THIN_THRESHOLD_CHARS = 400; // <400 chars of extractable text → try headless
const MAX_INTERNAL_PAGES = 4;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Sniffy/1.0 (+https://gosniffy.vercel.app/bot) Chrome/130.0.0.0 Safari/537.36";
const PROVIDER = "product-context";

export interface ProductProfile {
  sourceUrls: string[];
  productOneLiner: string | null;
  featureTokens: string[];
  audienceTokens: string[];
  topicalKeywords: string[];
  provenance: Provenance;
}

// Thin shape the provider works in — the per-page extraction result.
// Decoupled from cheerio/playwright internals so the scoring tests can mock
// against a plain object without dragging in browser deps.
interface ScrapedPage {
  url: string;
  text: string; // visible body text (no script/style/nav noise)
  headings: string[]; // h1/h2 contents, ordered
  bullets: string[]; // li contents
  links: string[]; // absolute URLs found on the page
}

export interface FetchProductProfileInput {
  sellerUrl: string;
  // Test injection seam — when provided, used instead of the real
  // fetch/Browserbase path. Useful for orchestrator integration tests.
  scrape?: (url: string) => Promise<ScrapedPage | null>;
}

export async function fetchProductProfile(
  input: FetchProductProfileInput,
): Promise<ProductProfile> {
  const scrape = input.scrape ?? scrapeUrl;

  const homepage = await scrape(input.sellerUrl);
  if (!homepage) return emptyProfile();

  const internalUrls = pickPriorityPages({
    links: homepage.links,
    baseUrl: input.sellerUrl,
    max: MAX_INTERNAL_PAGES,
  });

  const additional = await Promise.all(internalUrls.map((u) => scrape(u)));
  const pages: ScrapedPage[] = [
    homepage,
    ...additional.filter((p): p is ScrapedPage => p !== null),
  ];

  return {
    sourceUrls: pages.map((p) => p.url),
    productOneLiner: pages[0]!.headings[0] ?? null,
    featureTokens: extractFeatureTokens(pages),
    audienceTokens: extractAudienceTokens(pages),
    topicalKeywords: extractTopicalKeywords(pages),
    provenance: "live",
  };
}

function emptyProfile(): ProductProfile {
  return {
    sourceUrls: [],
    productOneLiner: null,
    featureTokens: [],
    audienceTokens: [],
    topicalKeywords: [],
    provenance: "degraded",
  };
}

// --- Per-URL scraper (static → Browserbase fallback, cached) -------------

async function scrapeUrl(url: string): Promise<ScrapedPage | null> {
  try {
    return await withCache(
      () => scrapeUrlOnce(url),
      {
        key: cacheKey({
          namespace: `${PROVIDER}:scrape`,
          extra: { url },
        }),
        ttlSeconds: PRODUCT_CONTEXT_TTL_SECONDS,
        namespace: `${PROVIDER}:scrape`,
        // Cache validate: if the cached payload is malformed (manual edit,
        // schema drift), drop it and re-fetch. Cheap structural check.
        validate: (v: unknown): v is ScrapedPage =>
          typeof v === "object" &&
          v !== null &&
          typeof (v as ScrapedPage).text === "string" &&
          Array.isArray((v as ScrapedPage).links),
      },
    );
  } catch {
    return null;
  }
}

async function scrapeUrlOnce(url: string): Promise<ScrapedPage | null> {
  const staticPage = await scrapeStatic(url);
  if (staticPage && staticPage.text.length >= STATIC_THIN_THRESHOLD_CHARS) {
    return staticPage;
  }
  // Static returned nothing or thin content. Try Browserbase if configured;
  // otherwise return what we have (even if thin) — the extractors can still
  // pull a one-liner from the headings.
  const headlessPage = await scrapeHeadless(url);
  if (headlessPage) return headlessPage;
  return staticPage; // null if both failed
}

// Static scrape: simple `fetch` + cheerio. Free.
async function scrapeStatic(url: string): Promise<ScrapedPage | null> {
  let html: string;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), STATIC_FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return null;
    html = await res.text();
  } catch {
    return null;
  }
  return parseHtml(url, html);
}

// Headless scrape via Browserbase. Only fires when BOTH env vars are set.
async function scrapeHeadless(url: string): Promise<ScrapedPage | null> {
  if (!env.BROWSERBASE_API_KEY || !env.BROWSERBASE_PROJECT_ID) return null;
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | null = null;
  try {
    const bb = new Browserbase({ apiKey: env.BROWSERBASE_API_KEY });
    const session = await bb.sessions.create({
      projectId: env.BROWSERBASE_PROJECT_ID,
    });
    browser = await chromium.connectOverCDP(session.connectUrl);
    const ctx = browser.contexts()[0] ?? (await browser.newContext());
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: HEADLESS_TIMEOUT_MS,
    });
    const html = await page.content();
    return parseHtml(url, html);
  } catch {
    return null;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* no-op */
      }
    }
  }
}

// Shared HTML → ScrapedPage parser. Same logic on both paths so the static
// vs headless distinction is transparent to extractors.
function parseHtml(url: string, html: string): ScrapedPage {
  const $ = loadHtml(html);
  // Drop noise BEFORE selecting visible content.
  $("script, style, noscript, header nav, footer, iframe").remove();
  const main = $("main, article, [role=main]").first();
  const root = main.length > 0 ? main : $("body");

  const text = collapseWhitespace(root.text());
  const headings: string[] = [];
  root.find("h1, h2").each((_, el) => {
    const t = $(el).text().trim();
    if (t.length > 0) headings.push(t);
  });
  const bullets: string[] = [];
  root.find("li").each((_, el) => {
    const t = $(el).text().trim();
    if (t.length > 0 && t.length <= 200) bullets.push(t);
  });
  const links = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const abs = new URL(href, url).toString();
      links.add(abs);
    } catch {
      // skip mailto:, tel:, javascript:, etc.
    }
  });

  return {
    url,
    text,
    headings,
    bullets,
    links: Array.from(links),
  };
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// --- Internal page selection ---------------------------------------------

const PRIORITY_PATTERNS = [
  /\/features?(?:[/?#]|$)/i,
  /\/about(?:[/?#]|$)/i,
  /\/pricing(?:[/?#]|$)/i,
  /\/how-it-works(?:[/?#]|$)/i,
  /\/product(?:[/?#]|$)/i,
];
const SKIP_PATTERNS = [
  /\/blog(?:[/?#]|$)/i,
  /\/docs?(?:[/?#]|$)/i,
  /\/privacy(?:[/?#]|$)/i,
  /\/terms(?:[/?#]|$)/i,
  /\/legal(?:[/?#]|$)/i,
  /\/jobs?(?:[/?#]|$)/i,
  /\/careers?(?:[/?#]|$)/i,
  /\/login(?:[/?#]|$)/i,
  /\/signup(?:[/?#]|$)/i,
  /\.pdf(?:[?#]|$)/i,
];

interface PickPriorityPagesInput {
  links: readonly string[];
  baseUrl: string;
  max: number;
}

export function pickPriorityPages(input: PickPriorityPagesInput): string[] {
  let baseOrigin: string;
  let baseHref: string;
  try {
    const u = new URL(input.baseUrl);
    baseOrigin = u.origin;
    baseHref = u.toString();
  } catch {
    return [];
  }

  const normalized: string[] = [];
  for (const raw of input.links) {
    if (typeof raw !== "string") continue;
    let abs: string;
    try {
      const u = new URL(raw, baseHref);
      u.hash = "";
      abs = u.toString();
    } catch {
      continue;
    }
    if (!abs.startsWith(baseOrigin)) continue;
    if (abs === baseHref || abs === `${baseHref}/`) continue;
    if (abs === baseOrigin || abs === `${baseOrigin}/`) continue;
    if (SKIP_PATTERNS.some((p) => p.test(abs))) continue;
    normalized.push(abs);
  }

  const freq = new Map<string, number>();
  for (const url of normalized) freq.set(url, (freq.get(url) ?? 0) + 1);

  const priority: string[] = [];
  const remaining = new Map<string, number>();
  for (const [url, count] of freq) {
    if (PRIORITY_PATTERNS.some((p) => p.test(url))) priority.push(url);
    else remaining.set(url, count);
  }
  priority.sort(
    (a, b) => (freq.get(b)! - freq.get(a)!) || a.localeCompare(b),
  );
  const restSorted = Array.from(remaining.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([url]) => url);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of [...priority, ...restSorted]) {
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= input.max) break;
  }
  return out;
}

// --- Token extractors -----------------------------------------------------

const TOPIC_STOPLIST: ReadonlySet<string> = new Set([
  // generic English
  "the", "and", "or", "of", "for", "in", "on", "to", "with", "by", "at",
  "is", "as", "an", "from", "this", "that", "these", "those",
  "we", "our", "your", "you", "us", "they", "their", "them",
  "it", "its", "be", "are", "was", "were", "been", "being",
  "have", "has", "had", "will", "can", "may", "should", "would", "could",
  "do", "does", "did", "done", "doing",
  "what", "which", "who", "when", "where", "why", "how",
  // generic marketing
  "app", "apps", "free", "trial", "pro", "premium", "lite", "best", "top",
  "new", "now", "today", "started", "getting", "great", "amazing", "awesome",
  "easy", "simple", "fast", "smart", "perfect", "powerful",
  "get", "use", "using", "make", "made", "help", "build", "built",
  "click", "learn", "more", "less", "much", "many", "any", "all", "some",
  "much", "more",
  // nav / boilerplate
  "home", "page", "site", "menu", "navigation", "header", "footer",
  "login", "signup", "sign", "log", "out", "contact", "support",
  "skip", "main", "content",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter((t) => t.length >= 4 && !TOPIC_STOPLIST.has(t));
}

export function extractFeatureTokens(pages: readonly ScrapedPage[]): string[] {
  // Bullets are where marketing sites cluster feature copy. Headings too.
  const tokens = new Map<string, number>();
  for (const p of pages) {
    for (const bullet of p.bullets) {
      for (const w of tokenize(bullet)) {
        tokens.set(w, (tokens.get(w) ?? 0) + 1);
      }
    }
    for (const heading of p.headings) {
      for (const w of tokenize(heading)) {
        // Headings get a 2× weight versus bullets because they're more
        // editorially intentional.
        tokens.set(w, (tokens.get(w) ?? 0) + 2);
      }
    }
  }
  return Array.from(tokens.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([t]) => t);
}

export function extractAudienceTokens(
  pages: readonly ScrapedPage[],
): string[] {
  // "for X" / "built for X" patterns in body text.
  const out = new Set<string>();
  const re = /\bfor\s+([a-z][a-z0-9\s-]{2,40}?)(?=[.,;\n!?]|$)/gi;
  for (const p of pages) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(p.text)) !== null) {
      const phrase = m[1]!.toLowerCase().trim();
      const words = phrase.split(/\s+/);
      if (words.length < 1 || words.length > 5) continue;
      const meaningful = words.filter(
        (w) => w.length >= 3 && !TOPIC_STOPLIST.has(w),
      );
      if (meaningful.length === 0) continue;
      out.add(phrase);
      if (out.size >= 8) break;
    }
    if (out.size >= 8) break;
  }
  return Array.from(out);
}

export function extractTopicalKeywords(
  pages: readonly ScrapedPage[],
): string[] {
  // Single-token frequency rank across all scraped body text.
  const freq = new Map<string, number>();
  for (const p of pages) {
    for (const t of tokenize(p.text)) {
      freq.set(t, (freq.get(t) ?? 0) + 1);
    }
  }
  return Array.from(freq.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 25)
    .map(([t]) => t);
}

// Re-export for unit testing.
export type { ScrapedPage };
