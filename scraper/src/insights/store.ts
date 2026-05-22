import { getCacheClient } from "../cache/redis.js";
import {
  PublicShowcaseReport as PublicShowcaseReportSchema,
  ShowcaseEntry as ShowcaseEntrySchema,
  type CountryCode,
  type PublicShowcaseReport,
  type ShowcaseEntry,
  type Store,
} from "../schemas/index.js";

// Sprint C — public showcase store. Backed by the same cache client as
// every other Sniffy persistence layer. Two keys per (store, country):
//
//   insights:index:{store}:{country}    ZSET    score=settledAt millis,
//                                                member=appId
//   insights:report:{store}:{country}:{appId}    SET    value=JSON report
//
// 30-day TTL on entries; the index trims expired members lazily on read.
// Index TTL also 30 days, refreshed on every save.
//
// Fail-open semantics: writes are fire-and-forget at the call site (a Redis
// hiccup never blocks the /diagnose response), and reads return empty/null
// on error so the public showcase degrades gracefully when Redis is
// unreachable instead of returning a 500.

const TTL_SECONDS = 30 * 24 * 60 * 60;
const INDEX_PREFIX = "insights:index";
const REPORT_PREFIX = "insights:report";
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

function indexKey(store: Store, country: CountryCode): string {
  return `${INDEX_PREFIX}:${store}:${country}`;
}

function reportKey(
  store: Store,
  country: CountryCode,
  appId: string,
): string {
  return `${REPORT_PREFIX}:${store}:${country}:${appId}`;
}

export interface SaveInput {
  entry: ShowcaseEntry;
  report: PublicShowcaseReport;
}

// Atomic-ish save: writes the report payload first, then upserts the index
// member. Order matters — if the index points to a member whose payload
// hasn't landed yet, the detail-page read returns 404. We accept the
// occasional "index ahead of payload" by 1-2ms of network latency in
// exchange for the simpler semantics.
export async function saveShowcase(input: SaveInput): Promise<void> {
  try {
    const cache = getCacheClient();
    const { entry, report } = input;
    const settledAtMs = Date.parse(entry.settledAt);
    if (!Number.isFinite(settledAtMs)) {
      throw new Error(
        `saveShowcase: entry.settledAt is not a parseable ISO date: ${entry.settledAt}`,
      );
    }
    await cache.set(
      reportKey(entry.store, entry.country, entry.appId),
      JSON.stringify(report),
      TTL_SECONDS,
    );
    await cache.zadd(
      indexKey(entry.store, entry.country),
      settledAtMs,
      entry.appId,
      TTL_SECONDS,
    );
  } catch (err) {
    // Fail-open — the diagnose response has already shipped at this point.
    // Surface a structured log so a sustained outage is visible without
    // 500-ing the user-facing call.
    process.stderr.write(
      `${JSON.stringify({
        ts: new Date().toISOString(),
        level: "warn",
        event: "showcase_save_failed",
        store: input.entry.store,
        country: input.entry.country,
        appId: input.entry.appId,
        error: err instanceof Error ? err.message : String(err),
      })}\n`,
    );
  }
}

// Read the latest report for the tuple, or null when unknown or expired.
// Fail-closed: Redis errors return null (treated as "not in showcase")
// rather than a 500 — keeps the public showcase degradation graceful.
export async function getShowcaseReport(
  store: Store,
  country: CountryCode,
  appId: string,
): Promise<PublicShowcaseReport | null> {
  try {
    const raw = await getCacheClient().get(reportKey(store, country, appId));
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as unknown;
    const result = PublicShowcaseReportSchema.safeParse(parsed);
    if (!result.success) return null;
    return result.data;
  } catch {
    return null;
  }
}

export interface ListShowcaseInput {
  store?: Store;
  country?: CountryCode;
  limit?: number;
}

export interface ListShowcaseResult {
  entries: ShowcaseEntry[];
  freshestAt: string | null;
}

// List recent showcase entries, newest-first. When both store and country
// are provided we hit one index. When either is omitted we'd ideally fan
// across multiple indexes — for the MVP we only support the
// (store, country) and "no filter → ios+US" combinations. The full
// cross-storefront fan-out lands when traffic warrants it.
//
// Each entry is materialized by reading its report payload and projecting
// to the minimal listing shape. That's O(limit) reads per call; acceptable
// at MVP traffic levels (target ≤50 entries per index). When index hot-paths
// emerge we can move the listing shape into the ZSET member itself.
export async function listRecentShowcase(
  input: ListShowcaseInput = {},
): Promise<ListShowcaseResult> {
  const limit = Math.min(
    Math.max(input.limit ?? DEFAULT_LIST_LIMIT, 1),
    MAX_LIST_LIMIT,
  );
  const store = (input.store ?? "ios") as Store;
  const country = (input.country ?? "US") as CountryCode;

  try {
    const cache = getCacheClient();
    const members = await cache.zrange(indexKey(store, country));
    // ZRANGE returns ascending — reverse for newest-first, then cap.
    const ordered = [...members].reverse().slice(0, limit);

    const entries: ShowcaseEntry[] = [];
    for (const member of ordered) {
      const raw = await cache.get(reportKey(store, country, member.member));
      if (raw === null) continue;
      const parsed = JSON.parse(raw) as unknown;
      const report = PublicShowcaseReportSchema.safeParse(parsed);
      if (!report.success) continue;
      const candidate = projectToEntry({
        store,
        country,
        appId: member.member,
        scoreMillis: member.score,
        report: report.data,
      });
      const entryParse = ShowcaseEntrySchema.safeParse(candidate);
      if (!entryParse.success) continue;
      entries.push(entryParse.data);
    }

    return {
      entries,
      freshestAt: entries.length > 0 ? (entries[0]?.settledAt ?? null) : null,
    };
  } catch {
    return { entries: [], freshestAt: null };
  }
}

function projectToEntry(input: {
  store: Store;
  country: CountryCode;
  appId: string;
  scoreMillis: number;
  report: PublicShowcaseReport;
}): ShowcaseEntry {
  return {
    store: input.store,
    country: input.country,
    appId: input.appId,
    appName: input.report.detectedApp.name,
    appDeveloper: input.report.detectedApp.developer,
    iconUrl: null,
    primaryCategory: null,
    overallScore: input.report.metadataScore?.overall ?? null,
    settledAt: new Date(input.scoreMillis).toISOString(),
  };
}
