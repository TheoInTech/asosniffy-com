import { load as loadHtml } from "cheerio";
import type { Provenance } from "../schemas/index.js";

// Wave 2.2 (discoverability roadmap §5) — web discoverability audit,
// pure parser layer.
//
// Given already-fetched artifacts (page HTML, AASA / assetlinks JSON text,
// robots.txt text) plus the store identity Sniffy already holds (bundleId,
// packageName, store rating), these parsers grade the app-specific web
// plumbing no generic SEO crawler checks. No I/O, no clock, no network —
// the provider (providers/web-audit.ts) owns all fetching.
//
// Rule sources (each finding maps to a documented spec — see
// docs/research/2026-06-discoverability/research-pseo-landing.md):
//   • SoftwareApplication JSON-LD required fields — Google Search Central:
//     required are `name`, `offers.price` (0 for free apps), and one of
//     `aggregateRating` or `review`; MobileApplication/WebApplication
//     subtypes supported; a VideoGame-ONLY @type gets no rich result and
//     must be co-typed.
//     https://developers.google.com/search/docs/appearance/structured-data/software-app
//   • Smart App Banner — Apple App Search guide: <meta
//     name="apple-itunes-app" content="app-id=…, app-argument=…">; the
//     per-page app-argument is what lets the banner deep-link (and Apple
//     index) page-specific content. Archived doc (2016) — mechanics still
//     current, flagged in the research file.
//     https://developer.apple.com/library/archive/documentation/General/Conceptual/AppSearch/WebContent.html
//   • AASA (universal links) — Apple associated domains: served at
//     /.well-known/apple-app-site-association (root fallback allowed);
//     applinks.details entries carry appID/appIDs of the form
//     "TEAMID.bundleId" (team ID has no dots).
//     https://developer.apple.com/documentation/xcode/supporting-associated-domains
//   • assetlinks.json (Android App Links) — statement array with
//     relation "delegate_permission/common.handle_all_urls" and target
//     {namespace: "android_app", package_name}.
//     https://developer.android.com/training/app-links/verify-android-applinks
//   • robots.txt — RFC 9309 user-agent groups, deliberately simplified:
//     a group blocks an agent iff it contains `Disallow: /`; a specific
//     agent group overrides the `*` group; default is allowed. AI crawler
//     tokens: GPTBot (OpenAI), PerplexityBot (Perplexity),
//     Google-Extended (Gemini training opt-out).
//
// Honesty gates / what this module deliberately does NOT claim:
//   • Facts only — presence/absence/match booleans. No rank-impact claims,
//     no traffic estimates, no fabricated values: unknown inputs (bundleId,
//     packageName, store rating) yield null fields, never guesses.
//   • AASA/assetlinks "valid" is a STRUCTURAL check (parses + has the
//     applinks.details / statement-array shape). It does not verify path
//     components, certificate fingerprints, or Apple-CDN delivery.
//   • The robots verdict reflects only a full-site `Disallow: /` in the
//     matched group; partial path blocks report "allowed" by design.
//   • Editorial stance (roadmap 2.2 [V-corrected], critique contradiction
//     #3): outputs are hygiene FACTS. Downstream prose must NOT recommend
//     web-checkout funnels or diverting install traffic to the web —
//     RevenueCat's own data shows web funnels can cannibalize store rank
//     signal (research-pseo-landing.md).

// --- Finding shapes ---------------------------------------------------------

export interface SmartAppBannerFinding {
  present: boolean;
  appId: string | null;
  hasAppArgument: boolean;
}

export interface AppSchemaFinding {
  present: boolean;
  type: string | null;
  missingRequiredFields: string[];
  aggregateRatingValue: number | null;
}

export type AasaFinding =
  | { present: false }
  | { present: true; valid: boolean; bundleIdListed: boolean | null };

export type AssetlinksFinding =
  | { present: false }
  | { present: true; valid: boolean; packageListed: boolean | null };

export type CrawlerDirective = "allowed" | "blocked";

export interface AiCrawlerDirectives {
  gptBot: CrawlerDirective;
  perplexityBot: CrawlerDirective;
  googleExtended: CrawlerDirective;
}

export interface OgFinding {
  title: boolean;
  description: boolean;
  image: boolean;
}

export interface RatingDrift {
  schemaValue: number;
  storeValue: number;
  drift: number;
}

export interface WebDiscoverability {
  url: string;
  smartAppBanner: SmartAppBannerFinding;
  appSchema: AppSchemaFinding;
  universalLinks: AasaFinding;
  androidAppLinks: AssetlinksFinding;
  aiCrawlerAccess: AiCrawlerDirectives & { robotsTxtPresent: boolean };
  openGraph: OgFinding;
  ratingDrift: RatingDrift | null;
  checkedAt: string;
  provenance: Provenance;
}

// --- Smart App Banner --------------------------------------------------------

// <meta name="apple-itunes-app" content="app-id=ID[, affiliate-data=…][, app-argument=URL]>
// `present` reports the tag itself; a tag without a parseable app-id is
// still present (the founder TRIED) but appId stays null.
export function parseSmartAppBanner(html: string): SmartAppBannerFinding {
  const $ = loadHtml(html);
  let content: string | null = null;
  $("meta[name]").each((_, el) => {
    if (content !== null) return;
    const name = ($(el).attr("name") ?? "").trim().toLowerCase();
    if (name === "apple-itunes-app") content = $(el).attr("content") ?? "";
  });
  if (content === null) return { present: false, appId: null, hasAppArgument: false };

  let appId: string | null = null;
  let hasAppArgument = false;
  for (const rawPart of (content as string).split(",")) {
    const part = rawPart.trim();
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    const value = part.slice(eq + 1).trim();
    if (key === "app-id" && value.length > 0) appId = value;
    if (key === "app-argument" && value.length > 0) hasAppArgument = true;
  }
  return { present: true, appId, hasAppArgument };
}

// --- SoftwareApplication JSON-LD ----------------------------------------------

// Types Google grants the software-app rich result to. A node typed ONLY
// VideoGame is excluded per the Google doc ("must be co-typed").
const APP_SCHEMA_TYPES: ReadonlySet<string> = new Set([
  "SoftwareApplication",
  "MobileApplication",
  "WebApplication",
]);

export function parseAppSchema(html: string): AppSchemaFinding {
  const $ = loadHtml(html);
  const nodes: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return; // malformed block → contributes nothing (absent, not a crash)
    }
    for (const candidate of flattenLdNodes(parsed)) nodes.push(candidate);
  });

  for (const node of nodes) {
    const types = ldTypes(node);
    const appType = types.find((t) => APP_SCHEMA_TYPES.has(t));
    if (appType === undefined) continue;

    const missing: string[] = [];
    if (typeof node.name !== "string" || node.name.trim().length === 0) {
      missing.push("name");
    }
    if (!hasOffersPrice(node.offers)) missing.push("offers.price");
    const aggregate = asRecord(node.aggregateRating);
    if (aggregate === null && node.review === undefined) {
      missing.push("aggregateRating or review");
    }

    const ratingValue =
      aggregate === null ? null : coerceFiniteNumber(aggregate.ratingValue);

    return {
      present: true,
      type: appType,
      missingRequiredFields: missing,
      aggregateRatingValue: ratingValue,
    };
  }
  return { present: false, type: null, missingRequiredFields: [], aggregateRatingValue: null };
}

// JSON-LD blocks may be a single node, an array, or wrap nodes in @graph.
// One level of @graph is enough for real-world marketing pages.
function flattenLdNodes(parsed: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const roots = Array.isArray(parsed) ? parsed : [parsed];
  for (const root of roots) {
    const record = asRecord(root);
    if (record === null) continue;
    out.push(record);
    if (Array.isArray(record["@graph"])) {
      for (const child of record["@graph"]) {
        const childRecord = asRecord(child);
        if (childRecord !== null) out.push(childRecord);
      }
    }
  }
  return out;
}

function ldTypes(node: Record<string, unknown>): string[] {
  const t = node["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((v): v is string => typeof v === "string");
  return [];
}

// offers.price is required even for free apps (price: 0) — so the check is
// "the price KEY exists", not truthiness. offers may be an object or array.
function hasOffersPrice(offers: unknown): boolean {
  const list = Array.isArray(offers) ? offers : [offers];
  return list.some((o) => {
    const record = asRecord(o);
    return record !== null && record.price !== undefined;
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function coerceFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// --- AASA (apple-app-site-association) -----------------------------------------

// Called only when the file WAS fetched — `present` is always true here;
// the absent case is assembled by the provider. appID entries are
// "TEAMID.bundleId" where the team ID contains no dots, so a candidate
// matches iff it ends with ".<bundleId>" AND the remaining prefix is
// dot-free (guards against foo.com.example.app matching com.example.app).
export function parseAasa(
  jsonText: string,
  bundleId: string | null,
): Extract<AasaFinding, { present: true }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { present: true, valid: false, bundleIdListed: null };
  }
  const root = asRecord(parsed);
  const applinks = root === null ? null : asRecord(root.applinks);
  const details = applinks === null ? null : applinks.details;
  if (!Array.isArray(details)) {
    // Parses but lacks the applinks.details shape universal links require.
    // We cannot honestly say anything about bundle listing → null.
    return { present: true, valid: false, bundleIdListed: null };
  }

  if (bundleId === null) return { present: true, valid: true, bundleIdListed: null };

  const candidates: string[] = [];
  for (const entry of details) {
    const record = asRecord(entry);
    if (record === null) continue;
    if (typeof record.appID === "string") candidates.push(record.appID);
    if (Array.isArray(record.appIDs)) {
      for (const id of record.appIDs) {
        if (typeof id === "string") candidates.push(id);
      }
    }
  }
  const listed = candidates.some((candidate) => {
    if (!candidate.endsWith(`.${bundleId}`)) return false;
    const teamId = candidate.slice(0, candidate.length - bundleId.length - 1);
    return teamId.length > 0 && !teamId.includes(".");
  });
  return { present: true, valid: true, bundleIdListed: listed };
}

// --- assetlinks.json --------------------------------------------------------

export function parseAssetlinks(
  jsonText: string,
  packageName: string | null,
): Extract<AssetlinksFinding, { present: true }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { present: true, valid: false, packageListed: null };
  }
  if (!Array.isArray(parsed)) {
    return { present: true, valid: false, packageListed: null };
  }
  const targets = parsed
    .map((s) => {
      const statement = asRecord(s);
      return statement === null ? null : asRecord(statement.target);
    })
    .filter((t): t is Record<string, unknown> => t !== null);
  if (targets.length === 0) {
    return { present: true, valid: false, packageListed: null };
  }
  if (packageName === null) return { present: true, valid: true, packageListed: null };
  const listed = targets.some(
    (t) => t.namespace === "android_app" && t.package_name === packageName,
  );
  return { present: true, valid: true, packageListed: listed };
}

// --- robots.txt — AI crawler access -------------------------------------------

const AI_AGENT_TOKENS: Readonly<Record<keyof AiCrawlerDirectives, string>> = {
  gptBot: "gptbot",
  perplexityBot: "perplexitybot",
  googleExtended: "google-extended",
};

interface RobotsGroup {
  agents: string[]; // lowercased user-agent tokens
  disallowAll: boolean; // group contains `Disallow: /`
}

// Simplified RFC 9309 group parsing: consecutive User-agent lines open a
// group; rule lines (allow/disallow/crawl-delay) attach to it; a User-agent
// line after rules starts a new group. Blocked iff the matched group
// contains `Disallow: /`. Specific-agent groups override `*`. Anything we
// cannot parse defaults to allowed — we never claim a block we didn't see.
export function parseRobotsForAiCrawlers(robotsTxt: string): AiCrawlerDirectives {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let inAgentRun = false;

  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (line.length === 0) continue;
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === "user-agent") {
      if (!inAgentRun || current === null) {
        current = { agents: [], disallowAll: false };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      inAgentRun = true;
    } else if (field === "disallow" || field === "allow" || field === "crawl-delay") {
      if (current !== null && field === "disallow" && value === "/") {
        current.disallowAll = true;
      }
      inAgentRun = false;
    }
    // Non-group fields (sitemap, host, …) are ignored entirely.
  }

  const verdictFor = (token: string): CrawlerDirective => {
    const specific = groups.filter((g) => g.agents.includes(token));
    if (specific.length > 0) {
      return specific.some((g) => g.disallowAll) ? "blocked" : "allowed";
    }
    const wildcard = groups.filter((g) => g.agents.includes("*"));
    if (wildcard.length > 0) {
      return wildcard.some((g) => g.disallowAll) ? "blocked" : "allowed";
    }
    return "allowed";
  };

  return {
    gptBot: verdictFor(AI_AGENT_TOKENS.gptBot),
    perplexityBot: verdictFor(AI_AGENT_TOKENS.perplexityBot),
    googleExtended: verdictFor(AI_AGENT_TOKENS.googleExtended),
  };
}

// --- Open Graph ----------------------------------------------------------------

export function parseOg(html: string): OgFinding {
  const $ = loadHtml(html);
  const found = { title: false, description: false, image: false };
  $("meta").each((_, el) => {
    const key = ($(el).attr("property") ?? $(el).attr("name") ?? "")
      .trim()
      .toLowerCase();
    const content = ($(el).attr("content") ?? "").trim();
    if (content.length === 0) return;
    if (key === "og:title") found.title = true;
    if (key === "og:description") found.description = true;
    if (key === "og:image") found.image = true;
  });
  return found;
}

// --- Assembly -------------------------------------------------------------------

export interface AssembleWebDiscoverabilityInput {
  url: string;
  smartAppBanner: SmartAppBannerFinding;
  appSchema: AppSchemaFinding;
  universalLinks: AasaFinding;
  androidAppLinks: AssetlinksFinding;
  robotsTxtPresent: boolean;
  aiCrawlers: AiCrawlerDirectives;
  openGraph: OgFinding;
  storeRating: number | null;
  checkedAt: string;
  provenance: Provenance;
}

// ratingDrift compares the rating the page CLAIMS (JSON-LD aggregateRating)
// against the store rating Sniffy fetched — both values shown, drift =
// schema − store (negative ⇒ the page understates, positive ⇒ the page
// overstates / is stale). Null whenever either side is unknown: we never
// fabricate a drift from one number.
export function assembleWebDiscoverability(
  input: AssembleWebDiscoverabilityInput,
): WebDiscoverability {
  const schemaValue = input.appSchema.aggregateRatingValue;
  const storeValue = input.storeRating;
  const ratingDrift: RatingDrift | null =
    schemaValue !== null && storeValue !== null && Number.isFinite(storeValue)
      ? {
          schemaValue,
          storeValue,
          drift: Math.round((schemaValue - storeValue) * 100) / 100,
        }
      : null;

  return {
    url: input.url,
    smartAppBanner: input.smartAppBanner,
    appSchema: input.appSchema,
    universalLinks: input.universalLinks,
    androidAppLinks: input.androidAppLinks,
    aiCrawlerAccess: { robotsTxtPresent: input.robotsTxtPresent, ...input.aiCrawlers },
    openGraph: input.openGraph,
    ratingDrift,
    checkedAt: input.checkedAt,
    provenance: input.provenance,
  };
}
