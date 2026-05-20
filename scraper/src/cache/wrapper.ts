import { getCacheClient } from "./redis.js";
import { recordHit, recordMiss } from "./metrics.js";
import { recordInvocation, responseHash } from "../observability/audit.js";

export interface CacheWrapperAuditOptions {
  provider: string;
  endpoint: string;
}

export interface CacheWrapperOptions<T = unknown> {
  key: string;
  ttlSeconds: number;
  namespace: string;
  // Optional audit registration. When provided, withCache records a
  // ProviderInvocation for every call: source "cached" on hit, "live" on
  // miss-then-success. Errors do not surface here — the provider itself is
  // responsible for recording its own live invocation with errorKind set
  // (we don't want to cache failures, so the cache layer can't see them).
  audit?: CacheWrapperAuditOptions;
  // Phase 4 — cache quarantine on Zod-style validation failure.
  // When provided and the cached value fails validation, withCache deletes
  // the key, logs `cache_quarantine`, and re-executes `fn` so the caller
  // gets fresh data. This solves the cache-poisoning risk: a bad payload
  // cached today doesn't keep poisoning every subsequent request for the
  // remainder of the TTL.
  validate?: (value: T) => boolean;
}

// withCache: provider call → cache-aware provider call.
//
// On hit: parse the cached JSON, rewrite any `provenance: "live"` to "cached"
// (recursively, supports arrays), and return. Record a hit metric.
// On miss: call fn, store the result (only if it's not an error envelope —
// we don't want to cache failures), and return the original value. Record a
// miss metric.
//
// Convention: error returns from providers use a `{ error: "..." }` envelope
// (see Apple provider). We skip caching them so the next call retries live.
export async function withCache<T>(
  fn: () => Promise<T>,
  opts: CacheWrapperOptions<T>,
): Promise<T> {
  const cache = getCacheClient();
  const started = Date.now();
  const raw = await cache.get(opts.key);
  if (raw !== null) {
    const parsed = JSON.parse(raw) as T;

    // Phase 4 — quarantine on validation failure. The validate callback is
    // a cheap structural check (Zod safeParse, type-guard, etc.). When it
    // fails, we delete the key and fall through to a fresh fetch.
    if (opts.validate && !opts.validate(parsed)) {
      await cache.delete(opts.key);
      process.stderr.write(
        `${JSON.stringify({
          ts: new Date().toISOString(),
          level: "warn",
          event: "cache_quarantine",
          namespace: opts.namespace,
          key: opts.key,
        })}\n`,
      );
      // Fall through to the miss path. Record this as a miss for the
      // metrics counter so quarantine events aren't counted as hits.
      recordMiss(opts.namespace);
      const fresh = await fn();
      if (!isErrorEnvelope(fresh)) {
        await cache.set(opts.key, JSON.stringify(fresh), opts.ttlSeconds);
      }
      return fresh;
    }

    recordHit(opts.namespace);
    const rewritten = rewriteProvenanceOnHit(parsed);
    if (opts.audit) {
      recordInvocation({
        provider: opts.audit.provider,
        endpoint: opts.audit.endpoint,
        source: "cached",
        latencyMs: Date.now() - started,
        bytesIn: raw.length,
        responseHash: responseHash(parsed),
      });
    }
    return rewritten;
  }
  recordMiss(opts.namespace);
  const fresh = await fn();
  if (!isErrorEnvelope(fresh)) {
    await cache.set(opts.key, JSON.stringify(fresh), opts.ttlSeconds);
  }
  return fresh;
}

function rewriteProvenanceOnHit<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => rewriteProvenanceOnHit(item)) as unknown as T;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "provenance" in (value as Record<string, unknown>)
  ) {
    const record = value as Record<string, unknown>;
    if (record.provenance === "live") {
      return { ...record, provenance: "cached" } as unknown as T;
    }
  }
  return value;
}

function isErrorEnvelope(value: unknown): value is { error: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in (value as Record<string, unknown>) &&
    typeof (value as Record<string, unknown>).error === "string"
  );
}
