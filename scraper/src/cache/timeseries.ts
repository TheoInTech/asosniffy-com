import { createHash } from "node:crypto";
import { getCacheClient, type ZSetMember } from "./redis.js";
import type {
  Confidence,
  Provenance,
  RankBucket,
  Store,
} from "../schemas/index.js";

// Daily rank-history snapshots in Redis ZSets.
//
// Phase 4 ships one sorted-set per (store, country, appId, keyword) tuple.
// Each ZSet entry's score is a day-aligned UNIX day index
// (Math.floor(unixMillis / 86400_000)). One sample per day per tuple — a
// second write same day overwrites (Redis ZADD semantics on identical
// member key). For per-day uniqueness we serialize without sampledAt so
// a re-run produces an identical member string; downstream consumers
// reconstruct sampledAt from the score.
//
// Retention is 90 days, enforced via ZREMRANGEBYSCORE on every write.
//
// Storage math (saturation target):
//   1000 active apps × 5 keywords × 5 countries × 90 days × ~120B = ~270MB
// Upstash free tier is 256MB — `cache/eviction.ts` (post-Phase-4) prunes
// series with no read in 30 days to stay under. Single-tenant hackathon
// load lands far below the ceiling.

const KEY_NAMESPACE = "rank-history";
const RETENTION_DAYS = 90;
const SECONDS_PER_DAY = 86400;
// TTL on each ZSet key — sliding window: each write refreshes it. Long
// enough that an app that diagnoses weekly keeps its full series; short
// enough that abandoned apps eventually evict naturally.
const ZSET_TTL_SECONDS = RETENTION_DAYS * SECONDS_PER_DAY;

export interface RankSample {
  position: number; // 1-indexed; 0 means not_found
  bucket: RankBucket;
  confidence: Confidence;
  provenance: Provenance;
  searchedDepth: number;
  sampledAt: string; // ISO 8601 — reconstructed from ZSet score for older entries
}

export interface RecordRankInput {
  store: Store;
  country: string;
  appId: string;
  keyword: string;
  position: number;
  bucket: RankBucket;
  confidence: Confidence;
  provenance: Provenance;
  searchedDepth: number;
  sampledAt?: Date;
}

export interface GetRankSeriesInput {
  store: Store;
  country: string;
  appId: string;
  keyword: string;
  // Number of days of history to return (default 30, capped at retention).
  windowDays?: number;
}

export function rankHistoryKey(input: {
  store: Store;
  country: string;
  appId: string;
  keyword: string;
}): string {
  return `${KEY_NAMESPACE}:${input.store}:${input.country.toUpperCase()}:${input.appId}:${keywordHash(input.keyword)}`;
}

export function keywordHash(keyword: string): string {
  return createHash("sha256")
    .update(keyword.toLowerCase().trim())
    .digest("hex")
    .slice(0, 16);
}

// Day index (UTC). Two samples on the same UTC day collapse to one ZSet
// entry — the latest write wins (Redis ZADD same-member behavior).
function unixDay(date: Date): number {
  return Math.floor(date.getTime() / 1000 / SECONDS_PER_DAY);
}

// Stringify the sample in a stable form so the SAME-day write produces
// the same member key (ZADD semantics: same member updates score). We
// drop sampledAt from the persisted member because it's derived from
// the score anyway; including it would break the same-day-collapse
// invariant.
function memberPayload(input: RecordRankInput): string {
  return JSON.stringify({
    p: input.position,
    b: input.bucket,
    c: input.confidence,
    pr: input.provenance,
    sd: input.searchedDepth,
  });
}

interface MemberData {
  p: number;
  b: RankBucket;
  c: Confidence;
  pr: Provenance;
  sd: number;
}

function parseMember(raw: string): MemberData | null {
  try {
    return JSON.parse(raw) as MemberData;
  } catch {
    return null;
  }
}

// Record a daily rank snapshot. Idempotent within the same UTC day — a
// second write the same day OVERWRITES the previous sample (we pre-clear
// today's score before ZADD). Caller (orchestrator) is expected to
// fire-and-forget; errors are swallowed so a Redis hiccup never 500s
// a paid /diagnose.
export async function recordRank(input: RecordRankInput): Promise<void> {
  try {
    const cache = getCacheClient();
    const at = input.sampledAt ?? new Date();
    const day = unixDay(at);
    const key = rankHistoryKey(input);
    // Latest-wins for the same UTC day: ZADD-with-same-member only collides
    // if payload is byte-identical, but the same day can legitimately
    // produce different positions/buckets across diagnose runs. Pre-clear
    // the day's entries so the second write is the canonical sample.
    await cache.zremrangebyscore(key, day, day);
    await cache.zadd(key, day, memberPayload(input), ZSET_TTL_SECONDS);
    // Auto-trim entries older than retention window.
    const cutoff = day - RETENTION_DAYS;
    await cache.zremrangebyscore(key, Number.NEGATIVE_INFINITY, cutoff - 1);
  } catch (err) {
    // Honest log; never throw upward.
    process.stderr.write(
      `${JSON.stringify({
        ts: new Date().toISOString(),
        level: "warn",
        event: "rank_history_persist_failed",
        message: (err as Error)?.message ?? String(err),
      })}\n`,
    );
  }
}

// Read back the series for one tuple, ordered ascending by day. Empty
// array when the key doesn't exist (cold-start: first read).
export async function getRankSeries(
  input: GetRankSeriesInput,
): Promise<RankSample[]> {
  const cache = getCacheClient();
  const key = rankHistoryKey(input);
  const today = unixDay(new Date());
  const windowDays = Math.min(input.windowDays ?? 30, RETENTION_DAYS);
  const oldestDay = today - windowDays;
  const members = await cache.zrange(key, {
    byScore: { min: oldestDay, max: today },
  });
  return members.flatMap((m): RankSample[] => {
    const parsed = parseMember(m.member);
    if (!parsed) return [];
    const sampledAtMs = m.score * SECONDS_PER_DAY * 1000;
    return [
      {
        position: parsed.p,
        bucket: parsed.b,
        confidence: parsed.c,
        provenance: parsed.pr,
        searchedDepth: parsed.sd,
        sampledAt: new Date(sampledAtMs).toISOString(),
      },
    ];
  });
}

// Internal helper — exposed for tests that want to seed a series at
// arbitrary historical dates without going through the per-day collapse.
export async function _recordRankAtDay_forTests(
  input: RecordRankInput & { dayIndex: number },
): Promise<void> {
  const cache = getCacheClient();
  const key = rankHistoryKey(input);
  await cache.zadd(
    key,
    input.dayIndex,
    memberPayload(input),
    ZSET_TTL_SECONDS,
  );
}

// Members raw fetch (advanced; tests + diagnostics). Returns the raw
// ZSet member entries with day-index scores.
export async function _getRawMembers_forTests(
  input: GetRankSeriesInput,
): Promise<ZSetMember[]> {
  const cache = getCacheClient();
  const key = rankHistoryKey(input);
  return cache.zrange(key);
}
