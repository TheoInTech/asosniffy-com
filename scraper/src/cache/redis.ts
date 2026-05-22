import { Redis } from "@upstash/redis";
import { env } from "../env.js";

// Cache client interface. Backed by Upstash REST when both
// UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set; otherwise by
// an in-memory Map with lazy expiry. The in-memory mode is what runs in
// vitest and in `pnpm dev` without infra.

export interface ZSetMember {
  score: number;
  member: string;
}

export interface ZRangeOptions {
  // Optional score range (inclusive both ends). Omit either bound to use
  // -Infinity / +Infinity respectively.
  byScore?: { min: number; max: number };
  // Optional cap on the number of returned entries (after byScore filter).
  limit?: number;
}

export interface TryDecrementResult {
  success: boolean;
  balance: number;
}

export interface CacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  // Atomic counter with TTL — used by Phase-2 token buckets. Returns the
  // counter value AFTER the increment. The TTL is only applied on the
  // first increment (when the key is created); subsequent increments leave
  // the TTL alone so the bucket window doesn't extend forever.
  incr(key: string, ttlSeconds: number): Promise<number>;
  // Sprint B — atomic check-and-decrement primitive for Sniff Pack balance
  // spend. Returns { success: false, balance: <current> } when the current
  // value is below `amount`, leaving the stored value unchanged. On success,
  // decrements by `amount` and returns the new balance. Implementations MUST
  // ensure two concurrent calls cannot both succeed when the post-decrement
  // total would go negative — the Upstash backend achieves this via
  // optimistic DECRBY + INCRBY rollback; the in-memory backend leverages
  // the single-threaded JS event loop for natural atomicity.
  tryDecrement(key: string, amount: number): Promise<TryDecrementResult>;
  // Phase-4 ZSet primitives — backing for rank-history timeseries.
  // Semantics match Redis ZADD / ZRANGE BYSCORE / ZREMRANGEBYSCORE.
  // TTL is applied on first add per (key) so the series window doesn't
  // grow unbounded if no one writes anymore.
  zadd(
    key: string,
    score: number,
    member: string,
    ttlSeconds: number,
  ): Promise<void>;
  zrange(key: string, options?: ZRangeOptions): Promise<ZSetMember[]>;
  zremrangebyscore(key: string, min: number, max: number): Promise<number>;
  readonly backend: "upstash" | "memory";
}

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

interface MemoryZSetEntry {
  members: ZSetMember[]; // ordered ascending by score
  expiresAt: number;
}

class MemoryCacheClient implements CacheClient {
  readonly backend = "memory" as const;
  private readonly store = new Map<string, MemoryEntry>();
  private readonly zstore = new Map<string, MemoryZSetEntry>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
    this.zstore.delete(key);
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const entry = this.store.get(key);
    const now = Date.now();
    if (!entry || entry.expiresAt <= now) {
      this.store.set(key, {
        value: "1",
        expiresAt: now + ttlSeconds * 1000,
      });
      return 1;
    }
    const next = (parseInt(entry.value, 10) || 0) + 1;
    entry.value = String(next);
    return next;
  }

  async tryDecrement(
    key: string,
    amount: number,
  ): Promise<TryDecrementResult> {
    const entry = this.store.get(key);
    const now = Date.now();
    if (!entry || entry.expiresAt <= now) {
      return { success: false, balance: 0 };
    }
    const current = parseInt(entry.value, 10) || 0;
    if (current < amount) {
      return { success: false, balance: current };
    }
    const next = current - amount;
    entry.value = String(next);
    return { success: true, balance: next };
  }

  async zadd(
    key: string,
    score: number,
    member: string,
    ttlSeconds: number,
  ): Promise<void> {
    const now = Date.now();
    let entry = this.zstore.get(key);
    if (!entry || entry.expiresAt <= now) {
      entry = { members: [], expiresAt: now + ttlSeconds * 1000 };
      this.zstore.set(key, entry);
    }
    // Remove existing entries with same member (Redis ZADD semantics: a
    // member key is unique; second ZADD with the same member updates its
    // score). Identity here is on `member` (the JSON-stringified payload).
    entry.members = entry.members.filter((m) => m.member !== member);
    // Binary-search insert to keep array sorted ascending by score.
    const idx = binarySearchInsertIndex(entry.members, score);
    entry.members.splice(idx, 0, { score, member });
  }

  async zrange(
    key: string,
    options?: ZRangeOptions,
  ): Promise<ZSetMember[]> {
    const entry = this.zstore.get(key);
    if (!entry) return [];
    if (entry.expiresAt <= Date.now()) {
      this.zstore.delete(key);
      return [];
    }
    let result = entry.members;
    if (options?.byScore) {
      const { min, max } = options.byScore;
      result = result.filter((m) => m.score >= min && m.score <= max);
    }
    if (options?.limit !== undefined) {
      result = result.slice(0, options.limit);
    }
    // Return a defensive copy so callers can't mutate internal state.
    return result.map((m) => ({ score: m.score, member: m.member }));
  }

  async zremrangebyscore(
    key: string,
    min: number,
    max: number,
  ): Promise<number> {
    const entry = this.zstore.get(key);
    if (!entry) return 0;
    const before = entry.members.length;
    entry.members = entry.members.filter(
      (m) => m.score < min || m.score > max,
    );
    return before - entry.members.length;
  }

  clear(): void {
    this.store.clear();
    this.zstore.clear();
  }
}

class UpstashCacheClient implements CacheClient {
  readonly backend = "upstash" as const;
  private readonly redis: Redis;

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token });
  }

  async get(key: string): Promise<string | null> {
    // Upstash auto-deserializes JSON — force a string round-trip so the
    // wrapper can JSON.parse what it put in.
    const raw = await this.redis.get<unknown>(key);
    if (raw === null || raw === undefined) return null;
    return typeof raw === "string" ? raw : JSON.stringify(raw);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, { ex: ttlSeconds });
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    // Two-step: INCR then EXPIRE (only when value is 1). Upstash supports
    // INCR atomically and EXPIRE NX-style via the @upstash/redis client.
    const next = await this.redis.incr(key);
    if (next === 1) {
      await this.redis.expire(key, ttlSeconds);
    }
    return next;
  }

  async tryDecrement(
    key: string,
    amount: number,
  ): Promise<TryDecrementResult> {
    // Optimistic atomic check-and-decrement. Two concurrent callers running
    // DECRBY at the same moment can both observe positive values; the
    // post-decrement inspection + rollback ensures only one wins. The loser
    // pays for an extra round-trip, but the credit ledger never goes
    // negative under any interleaving.
    //
    // Pre-check via GET is intentionally absent — a GET-then-DECRBY shape
    // would have a wider race window. DECRBY + conditional INCRBY is the
    // tightest correct pattern available without Lua scripting on Upstash.
    const next = (await this.redis.decrby(key, amount)) as number;
    if (next < 0) {
      // Roll back so the next caller observes the original balance. The
      // failed call did not consume a credit, only one extra round-trip.
      await this.redis.incrby(key, amount);
      return { success: false, balance: Math.max(0, next + amount) };
    }
    return { success: true, balance: next };
  }

  async zadd(
    key: string,
    score: number,
    member: string,
    ttlSeconds: number,
  ): Promise<void> {
    // @upstash/redis ZADD signature accepts { score, member } record.
    await this.redis.zadd(key, { score, member });
    // Apply TTL on first add via EXPIRE NX. Upstash REST does not expose
    // EXPIRE NX directly; safest cheap approach is to set TTL every call.
    // The series window is bounded by ZREMRANGEBYSCORE either way, so
    // re-touching TTL doesn't grow storage — it just keeps the key alive
    // as long as it's being written to.
    await this.redis.expire(key, ttlSeconds);
  }

  async zrange(
    key: string,
    options?: ZRangeOptions,
  ): Promise<ZSetMember[]> {
    const min = toUpstashScoreBound(options?.byScore?.min, "min");
    const max = toUpstashScoreBound(options?.byScore?.max, "max");

    // Upstash returns flat [member, score, member, score, ...] when
    // withScores=true.
    const raw = (await this.redis.zrange<unknown[]>(key, min, max, {
      byScore: true,
      withScores: true,
    })) as Array<string | number>;

    const out: ZSetMember[] = [];
    for (let i = 0; i + 1 < raw.length; i += 2) {
      const member = String(raw[i]);
      const score = Number(raw[i + 1]);
      out.push({ score, member });
    }
    // Upstash REST + the @upstash/redis types don't expose LIMIT alongside
    // BYSCORE. Apply the cap client-side. Series windows are bounded by
    // 90-day ZREMRANGEBYSCORE upstream, so the unfiltered fetch stays small.
    if (options?.limit !== undefined) {
      return out.slice(0, options.limit);
    }
    return out;
  }

  async zremrangebyscore(
    key: string,
    min: number,
    max: number,
  ): Promise<number> {
    return await this.redis.zremrangebyscore(
      key,
      toUpstashScoreBound(min, "min"),
      toUpstashScoreBound(max, "max"),
    );
  }
}

let singleton: CacheClient | null = null;

export function getCacheClient(): CacheClient {
  if (singleton) return singleton;
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    singleton = new UpstashCacheClient(url, token);
  } else {
    singleton = new MemoryCacheClient();
  }
  return singleton;
}

export function resetCacheClientForTests(): void {
  if (singleton && singleton.backend === "memory") {
    (singleton as MemoryCacheClient).clear();
  }
  singleton = null;
}

function binarySearchInsertIndex(
  arr: ReadonlyArray<ZSetMember>,
  score: number,
): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid]!.score <= score) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// Coerce an optional number bound into the literal "-inf" / "+inf" sentinels
// Upstash's typed client expects. Finite numbers pass through unchanged.
function toUpstashScoreBound(
  value: number | undefined,
  end: "min" | "max",
): number | "-inf" | "+inf" {
  if (value === undefined) return end === "min" ? "-inf" : "+inf";
  if (!Number.isFinite(value)) {
    if (value === Number.NEGATIVE_INFINITY) return "-inf";
    if (value === Number.POSITIVE_INFINITY) return "+inf";
  }
  return value;
}
