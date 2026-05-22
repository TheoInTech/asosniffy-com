import { getCacheClient, type CacheClient } from "../cache/redis.js";
import { SettleResponse, type SettleResponseType } from "./facilitator/index.js";

// Settle idempotency cache. Prevents the same EIP-3009 authorization (same
// authorization.from + authorization.nonce) from being submitted to the
// Morph facilitator's `/x402/v2/settle` more than once. Without this, a
// client retry on a perceived timeout — or two concurrent diagnose requests
// carrying the same PAYMENT-SIGNATURE header — causes the facilitator to
// reject the second submission with
// `transaction exists, from nonce conflict: from=…, nonce=…`, even though
// the first call already settled successfully. The user paid once but we
// surface a confusing failure.
//
// State machine, keyed by (authFrom, authNonce):
//   in_flight (60s)  — a settle is currently being attempted
//   success  (3600s) — settle completed; cached SettleResponse is replayed
//   failed   (300s)  — settle failed; the same error is re-thrown to the
//                      client so a buggy retry loop doesn't hammer the
//                      facilitator on a dead authorization
//
// Fail-open: any Redis error is logged and treated as a cache miss. The
// schema fix in `facilitator/types.ts` is the load-bearing correctness
// piece; idempotency is defense-in-depth, and a Redis outage must not
// block paid requests.

const KEY_PREFIX = "x402:settle:dedupe:";
const IN_FLIGHT_TTL_SECONDS = 60;
const SUCCESS_TTL_SECONDS = 3600;
const FAILURE_TTL_SECONDS = 300;

interface IdempotencyKeyParts {
  authFrom: string;
  authNonce: string;
}

export interface AcquireFresh {
  kind: "fresh";
}
export interface AcquireCachedSuccess {
  kind: "cached_success";
  settleResponse: SettleResponseType;
}
export interface AcquireCachedFailure {
  kind: "cached_failure";
  message: string;
  facilitatorStatus?: number;
  facilitatorBody?: unknown;
}
export interface AcquireInFlight {
  kind: "in_flight";
}
export type AcquireSettleSlot =
  | AcquireFresh
  | AcquireCachedSuccess
  | AcquireCachedFailure
  | AcquireInFlight;

interface InFlightEntry {
  status: "in_flight";
  at: string;
}
interface SuccessEntry {
  status: "success";
  settleResponse: unknown;
  at: string;
}
interface FailureEntry {
  status: "failed";
  message: string;
  facilitatorStatus?: number;
  facilitatorBody?: unknown;
  at: string;
}
type Entry = InFlightEntry | SuccessEntry | FailureEntry;

function dedupeKey({ authFrom, authNonce }: IdempotencyKeyParts): string {
  return `${KEY_PREFIX}${authFrom.toLowerCase()}:${authNonce.toLowerCase()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function logWarn(event: string, fields: Record<string, unknown>): void {
  // Same plain stderr JSON shape used by middleware/error-handler.ts.
  // Keeping it local avoids a circular import; the field names match the
  // existing facilitator_error log so Railway log queries stay consistent.
  process.stderr.write(
    `${JSON.stringify({
      ts: nowIso(),
      level: "warn",
      message: event,
      ...fields,
    })}\n`,
  );
}

function parseEntry(raw: string): Entry | null {
  try {
    const parsed = JSON.parse(raw) as Entry;
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed.status === "in_flight" ||
        parsed.status === "success" ||
        parsed.status === "failed")
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

// Atomic slot acquisition. On `fresh`, the caller MUST eventually call
// recordSettleSuccess, recordSettleFailure, or releaseInFlight — otherwise
// the in_flight TTL (60s) acts as the failsafe and other writers will be
// blocked for that window.
export async function acquireSettleSlot(
  parts: IdempotencyKeyParts,
  cache: CacheClient = getCacheClient(),
): Promise<AcquireSettleSlot> {
  const key = dedupeKey(parts);

  let existingRaw: string | null = null;
  try {
    existingRaw = await cache.get(key);
  } catch (err) {
    logWarn("settle_idempotency_read_failed", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
    return { kind: "fresh" };
  }

  if (existingRaw !== null) {
    const entry = parseEntry(existingRaw);
    if (entry?.status === "success") {
      const reparsed = SettleResponse.safeParse(entry.settleResponse);
      if (reparsed.success) {
        return { kind: "cached_success", settleResponse: reparsed.data };
      }
      // Cached entry doesn't match current schema (e.g. cached before the
      // discriminated-union migration). Drop it and proceed fresh.
      logWarn("settle_idempotency_cached_success_invalid", {
        key,
        issues: reparsed.error.issues.length,
      });
    }
    if (entry?.status === "failed") {
      return {
        kind: "cached_failure",
        message: entry.message,
        ...(entry.facilitatorStatus !== undefined
          ? { facilitatorStatus: entry.facilitatorStatus }
          : {}),
        ...(entry.facilitatorBody !== undefined
          ? { facilitatorBody: entry.facilitatorBody }
          : {}),
      };
    }
    if (entry?.status === "in_flight") {
      return { kind: "in_flight" };
    }
    // Unknown / unparseable entry — fall through to claim attempt; SETNX
    // will fail and we'll report in_flight, which is the conservative
    // posture (treat unknown state as "someone else is working on it").
  }

  let claimed = false;
  try {
    claimed = await cache.setIfNotExists(
      key,
      JSON.stringify({ status: "in_flight", at: nowIso() } satisfies InFlightEntry),
      IN_FLIGHT_TTL_SECONDS,
    );
  } catch (err) {
    logWarn("settle_idempotency_claim_failed", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
    return { kind: "fresh" };
  }

  if (!claimed) {
    // Someone else won the race between our GET and our SETNX.
    return { kind: "in_flight" };
  }
  return { kind: "fresh" };
}

export async function recordSettleSuccess(
  parts: IdempotencyKeyParts,
  settleResponse: SettleResponseType,
  cache: CacheClient = getCacheClient(),
): Promise<void> {
  const key = dedupeKey(parts);
  try {
    await cache.set(
      key,
      JSON.stringify({
        status: "success",
        settleResponse,
        at: nowIso(),
      } satisfies SuccessEntry),
      SUCCESS_TTL_SECONDS,
    );
  } catch (err) {
    logWarn("settle_idempotency_write_success_failed", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function recordSettleFailure(
  parts: IdempotencyKeyParts,
  failure: {
    message: string;
    facilitatorStatus?: number;
    facilitatorBody?: unknown;
  },
  cache: CacheClient = getCacheClient(),
): Promise<void> {
  const key = dedupeKey(parts);
  try {
    await cache.set(
      key,
      JSON.stringify({
        status: "failed",
        message: failure.message,
        ...(failure.facilitatorStatus !== undefined
          ? { facilitatorStatus: failure.facilitatorStatus }
          : {}),
        ...(failure.facilitatorBody !== undefined
          ? { facilitatorBody: failure.facilitatorBody }
          : {}),
        at: nowIso(),
      } satisfies FailureEntry),
      FAILURE_TTL_SECONDS,
    );
  } catch (err) {
    logWarn("settle_idempotency_write_failure_failed", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Clear the in_flight marker when settle threw something we don't want to
// cache (e.g. an unexpected non-PaymentRequiredError). Without this the key
// would block other writers for the full 60s in_flight TTL on transient
// errors — the failsafe still kicks in, but only after the window.
export async function releaseInFlight(
  parts: IdempotencyKeyParts,
  cache: CacheClient = getCacheClient(),
): Promise<void> {
  const key = dedupeKey(parts);
  try {
    await cache.delete(key);
  } catch (err) {
    logWarn("settle_idempotency_release_failed", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
