import { createHash } from "node:crypto";
import { getCacheClient } from "../cache/redis.js";
import type {
  DiagnosePaidResponse,
  SniffSummary,
  Store,
  CountryCode,
  Provenance,
} from "../schemas/index.js";
import type { LowerAddress } from "../lib/address.js";
import { tryNormalizeAddress } from "../lib/address.js";

// Per-wallet sniff history index, backed entirely by Redis (no Postgres).
//
// Keys (all 30-day TTL, refreshed on every read of the same series):
//   wallet:{addrLower}:sniffs  ZSET (score=settledAtMs, member=sniffId)
//                              trimmed to last WALLET_HISTORY_CAP entries
//   wallet:{addrLower}:dedupe:{dedupeKey} → sniffId
//                              dedupe by sha256(addr+cacheKey); same wallet
//                              re-running same (store, country, appId,
//                              keywordSetHash) overwrites in place
//   sniff:{sniffId}:meta       JSON SniffSummary (~1KB) for the list view
//   sniff:{sniffId}:report     Full DiagnosePaidResponse for byte-identical
//                              replay on /wallet/sniff/:sniffId

const RETENTION_SECONDS = 30 * 24 * 60 * 60;
const WALLET_HISTORY_CAP = 200;

const WALLET_SNIFFS_PREFIX = "wallet:";
const WALLET_SNIFFS_SUFFIX = ":sniffs";
const WALLET_DEDUPE_PREFIX = "wallet:";
const WALLET_DEDUPE_SUFFIX = ":dedupe:";
const SNIFF_META_PREFIX = "sniff:";
const SNIFF_META_SUFFIX = ":meta";
const SNIFF_REPORT_PREFIX = "sniff:";
const SNIFF_REPORT_SUFFIX = ":report";

// ---------- key builders ----------

export function walletSniffsKey(address: LowerAddress): string {
  return `${WALLET_SNIFFS_PREFIX}${address}${WALLET_SNIFFS_SUFFIX}`;
}

export function walletDedupeKey(
  address: LowerAddress,
  dedupeKey: string,
): string {
  return `${WALLET_DEDUPE_PREFIX}${address}${WALLET_DEDUPE_SUFFIX}${dedupeKey}`;
}

export function sniffMetaKey(sniffId: string): string {
  return `${SNIFF_META_PREFIX}${sniffId}${SNIFF_META_SUFFIX}`;
}

export function sniffReportKey(sniffId: string): string {
  return `${SNIFF_REPORT_PREFIX}${sniffId}${SNIFF_REPORT_SUFFIX}`;
}

// Stable dedupe key: same (wallet, store, country, appId, keywordSet) hashes
// to the same value across runs. The keywords array is lowercased + sorted
// + joined so list reordering doesn't fragment dedupe.
export function buildDedupeKey(args: {
  address: LowerAddress;
  store: Store;
  country: CountryCode;
  appId: string;
  keywords: ReadonlyArray<string>;
}): string {
  const ks = [...args.keywords]
    .map((k) => k.toLowerCase().trim())
    .filter(Boolean)
    .sort()
    .join("|");
  return createHash("sha256")
    .update(`${args.address}|${args.store}|${args.country}|${args.appId}|${ks}`)
    .digest("hex")
    .slice(0, 32);
}

// ---------- write ----------

export interface RecordSniffArgs {
  payer: LowerAddress;
  sniffId: string;
  store: Store;
  country: CountryCode;
  keywords: ReadonlyArray<string>;
  // Derived from the paid response.
  appId: string;
  appName: string;
  appDeveloper: string;
  appIconUrl: string | null;
  overallScore: number | null;
  appMetadataProvenance: Provenance;
  settledAt: string; // ISO
  report: DiagnosePaidResponse;
}

// Append a settled paid sniff to the wallet's index. Idempotent — if the
// same (wallet, store, country, appId, keywordSet) has been recorded before,
// the existing sniffId is reused and its timestamp + payload are refreshed.
// Returns the canonical sniffId stored against the dedupe key (which may
// differ from `args.sniffId` when this is a dedupe hit).
export async function recordSniff(args: RecordSniffArgs): Promise<string> {
  const cache = getCacheClient();
  const settledAtMs = Date.parse(args.settledAt);
  if (!Number.isFinite(settledAtMs)) {
    throw new Error(`recordSniff: settledAt is not a valid ISO date: ${args.settledAt}`);
  }

  const dedupeKey = buildDedupeKey({
    address: args.payer,
    store: args.store,
    country: args.country,
    appId: args.appId,
    keywords: args.keywords,
  });
  const dedupeRedisKey = walletDedupeKey(args.payer, dedupeKey);

  // Re-use existing sniffId on dedupe hit so the wallet's list stays stable.
  const existing = await cache.get(dedupeRedisKey);
  const canonicalSniffId =
    typeof existing === "string" && existing.length > 0
      ? existing
      : args.sniffId;

  const summary: SniffSummary = {
    sniffId: canonicalSniffId,
    store: args.store,
    country: args.country,
    app: {
      id: args.appId,
      name: args.appName,
      developer: args.appDeveloper,
      iconUrl: args.appIconUrl,
    },
    keywords: [...args.keywords],
    overallScore: args.overallScore,
    appMetadataProvenance: args.appMetadataProvenance,
    settledAt: args.settledAt,
  };

  await Promise.all([
    cache.set(dedupeRedisKey, canonicalSniffId, RETENTION_SECONDS),
    cache.set(
      sniffMetaKey(canonicalSniffId),
      JSON.stringify(summary),
      RETENTION_SECONDS,
    ),
    cache.set(
      sniffReportKey(canonicalSniffId),
      JSON.stringify(args.report),
      RETENTION_SECONDS,
    ),
    cache.zadd(
      walletSniffsKey(args.payer),
      settledAtMs,
      canonicalSniffId,
      RETENTION_SECONDS,
    ),
  ]);

  // Trim — keep newest WALLET_HISTORY_CAP entries. Members beyond the cap
  // get removed, but their `sniff:{id}:meta` and `sniff:{id}:report` keys
  // continue to live (they'll expire via TTL) so any open detail-view link
  // doesn't break mid-session.
  await trimWalletHistory(cache, args.payer);

  return canonicalSniffId;
}

async function trimWalletHistory(
  cache: ReturnType<typeof getCacheClient>,
  address: LowerAddress,
): Promise<void> {
  const key = walletSniffsKey(address);
  // Fetch all entries to count — wallet ZSETs are capped so the unfiltered
  // fetch stays small.
  const all = await cache.zrange(key);
  if (all.length <= WALLET_HISTORY_CAP) return;
  // Compute the score of the oldest entry we want to keep, then drop
  // everything strictly older.
  const sortedDesc = [...all].sort((a, b) => b.score - a.score);
  const keepBoundary = sortedDesc[WALLET_HISTORY_CAP - 1];
  if (!keepBoundary) return;
  // ZREMRANGEBYSCORE -inf .. (keepBoundary.score - 1)
  await cache.zremrangebyscore(
    key,
    Number.NEGATIVE_INFINITY,
    keepBoundary.score - 1,
  );
}

// ---------- read ----------

export interface ListSniffsArgs {
  address: LowerAddress;
  limit?: number;
  // ISO timestamp cursor — entries with settledAt < cursor are returned.
  // Omit for newest-first first page.
  cursor?: string;
}

export interface ListSniffsResult {
  items: SniffSummary[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function listSniffs(args: ListSniffsArgs): Promise<ListSniffsResult> {
  const cache = getCacheClient();
  const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const cursorMs =
    args.cursor !== undefined ? Date.parse(args.cursor) : Number.POSITIVE_INFINITY;
  const allEntries = await cache.zrange(walletSniffsKey(args.address));
  // Newest first; entries strictly older than the cursor.
  const filtered = [...allEntries]
    .filter((e) => e.score < cursorMs)
    .sort((a, b) => b.score - a.score);
  const page = filtered.slice(0, limit);
  const metas = await Promise.all(
    page.map((e) => cache.get(sniffMetaKey(e.member))),
  );
  const items: SniffSummary[] = [];
  for (let i = 0; i < page.length; i++) {
    const raw = metas[i];
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as SniffSummary;
      items.push(parsed);
    } catch {
      // Skip corrupt entries — list view shouldn't 500 because of one bad
      // meta blob. Stale entries get pruned by TTL.
      continue;
    }
  }
  const nextCursor =
    filtered.length > limit && items.length > 0
      ? items[items.length - 1]!.settledAt
      : null;
  return { items, nextCursor };
}

// Fetch a full report for replay. Returns null when:
//   - the sniffId has no meta record (expired or never existed)
//   - the meta record's payer doesn't match the caller's session address
//     (return null, not 403, so an attacker can't enumerate valid sniffIds
//     by probing for response-code differences).
export async function getSniff(args: {
  address: LowerAddress;
  sniffId: string;
}): Promise<DiagnosePaidResponse | null> {
  const cache = getCacheClient();
  const [metaRaw, reportRaw] = await Promise.all([
    cache.get(sniffMetaKey(args.sniffId)),
    cache.get(sniffReportKey(args.sniffId)),
  ]);
  if (!metaRaw || !reportRaw) return null;

  // Ownership check via the per-wallet ZSET — if the sniffId is a member
  // of this wallet's :sniffs set, the caller owns it. Membership-by-score
  // lookup requires fetching the set (capped at WALLET_HISTORY_CAP, so
  // small) and scanning for the member.
  const ownerSet = await cache.zrange(walletSniffsKey(args.address));
  const owns = ownerSet.some((m) => m.member === args.sniffId);
  if (!owns) return null;

  try {
    return JSON.parse(reportRaw) as DiagnosePaidResponse;
  } catch {
    return null;
  }
}

// ---------- defensive helpers used by tests + audit ----------

// Lowercase + structurally validate; returns null on bad input. Re-exported
// here so wallet/* call sites don't have to thread lib/address imports.
export function safeNormalizeAddress(input: unknown): LowerAddress | null {
  return tryNormalizeAddress(input);
}
