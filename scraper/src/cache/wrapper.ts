import { getCacheClient } from "./redis.js";
import { recordHit, recordMiss } from "./metrics.js";

export interface CacheWrapperOptions {
  key: string;
  ttlSeconds: number;
  namespace: string;
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
  opts: CacheWrapperOptions,
): Promise<T> {
  const cache = getCacheClient();
  const raw = await cache.get(opts.key);
  if (raw !== null) {
    recordHit(opts.namespace);
    const parsed = JSON.parse(raw) as T;
    return rewriteProvenanceOnHit(parsed);
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
