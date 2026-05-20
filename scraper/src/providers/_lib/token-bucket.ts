import { getCacheClient } from "../../cache/redis.js";

// Per-host token bucket persisted in Redis (or in-memory in dev/test).
//
// Each provider gets a budget in requests-per-minute. The bucket counter
// resets every minute via the Redis key TTL — simpler than a leaky-bucket
// implementation and accurate enough for the rates we run at.
//
// Acquire returns `{ ok: true }` when the call may proceed, or
// `{ ok: false, retryAfterMs }` when the budget is spent. Callers decide
// between waiting (rare; only used for read-side calls) or surfacing as
// degraded (the common case — Phase 1 honest-floor).

export interface BucketAcquireOk {
  readonly ok: true;
}
export interface BucketAcquireWait {
  readonly ok: false;
  readonly retryAfterMs: number;
}
export type BucketAcquire = BucketAcquireOk | BucketAcquireWait;

export interface AcquireInput {
  provider: string;
  perMinuteBudget: number;
}

export async function acquire(input: AcquireInput): Promise<BucketAcquire> {
  if (input.perMinuteBudget <= 0) return { ok: true };

  const cache = getCacheClient();
  const bucket = Math.floor(Date.now() / 60_000);
  const key = `aso:rl:${input.provider}:${bucket}`;
  // TTL one full minute + 5s safety margin so the next-minute bucket
  // doesn't briefly observe the previous one.
  const count = await cache.incr(key, 65);

  if (count <= input.perMinuteBudget) {
    return { ok: true };
  }

  // Over budget — compute how many ms remain in this minute window so the
  // caller can either wait or surface the wait time in an error.
  const msIntoMinute = Date.now() % 60_000;
  return { ok: false, retryAfterMs: 60_000 - msIntoMinute };
}

// Convenience: try to acquire, then optionally wait up to `maxWaitMs` for
// the next window. Used by call sites that prefer a short delay over an
// immediate degraded response (e.g. burst of 5 keyword calls in a single
// /diagnose against an 18/min bucket).
export interface AcquireWithWaitInput extends AcquireInput {
  maxWaitMs?: number;
}

export async function acquireOrWait(
  input: AcquireWithWaitInput,
): Promise<BucketAcquire> {
  const first = await acquire(input);
  if (first.ok) return first;
  const maxWait = input.maxWaitMs ?? 0;
  if (first.retryAfterMs > maxWait) return first;
  await sleep(first.retryAfterMs + 5); // 5ms safety to land in next bucket
  return acquire(input);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
