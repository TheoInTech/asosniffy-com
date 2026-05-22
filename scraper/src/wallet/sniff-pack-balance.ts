import { getCacheClient } from "../cache/redis.js";
import { normalizeAddress, tryNormalizeAddress } from "../lib/address.js";
import type { LowerAddress } from "../lib/address.js";

// Sprint A/B — Sniff Pack balance manager. Keyed by checksum-normalized
// (lower-cased) wallet address. Stored as a stringified integer in Redis so
// the existing CacheClient.set/get interface is sufficient — no INCRBY
// primitive needed for the purchase path. Decrement-on-/diagnose lands in a
// later iteration; that's where atomic INCRBY semantics become load-bearing
// and we may revisit the primitive choice.
//
// Failure semantics: getBalance always returns 0 on error (fail-closed — we
// never wave through a diagnose call by claiming balance the user doesn't
// have). incrementBalance throws when the input delta is invalid; transient
// Redis failures bubble so the route can return 5xx and the user can retry
// the purchase. The pack purchase has already settled on-chain at that point
// — refunds happen at the support layer, not here.

const BALANCE_PREFIX = "sniff-pack:balance:";

// 2 years. Pack 250 at 4 audits/year = 62 years to deplete, so a hard expiry
// would lock funded users out of credits they paid for. The TTL refreshes on
// every increment, keeping active users alive indefinitely while letting
// fully-dormant balances eventually expire from the cache.
const BALANCE_TTL_SECONDS = 2 * 365 * 24 * 60 * 60;

export interface BalanceSnapshot {
  wallet: LowerAddress;
  balance: number;
}

function buildKey(address: LowerAddress): string {
  return `${BALANCE_PREFIX}${address}`;
}

function parseBalance(raw: string | null): number {
  if (raw === null) return 0;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

// Read-only fetch. Fail-closed: a Redis hiccup returns 0 (no balance) so a
// downstream /diagnose decrement can never falsely succeed against unknown
// state. Callers should treat 0 as "no balance" without trying to recover.
export async function getBalance(rawWallet: string): Promise<number> {
  const address = tryNormalizeAddress(rawWallet);
  if (!address) return 0;
  try {
    const raw = await getCacheClient().get(buildKey(address));
    return parseBalance(raw);
  } catch {
    return 0;
  }
}

// Atomic-ish increment via read-modify-write. The current call site is the
// pack purchase route, which fires after a successful on-chain settle — a
// user-initiated single-tab flow with no concurrent races in practice. A
// stale read between two near-simultaneous buys would under-count (one buy
// lost) but never over-count, so the failure mode is safe. The decrement
// path (tryDecrementBalance) uses the cache layer's atomic primitive
// because /diagnose can race against itself.
export async function incrementBalance(
  rawWallet: string,
  credits: number,
): Promise<BalanceSnapshot> {
  if (!Number.isInteger(credits) || credits <= 0) {
    throw new Error(`Invalid credit delta: ${credits}`);
  }
  const address = normalizeAddress(rawWallet);
  const cache = getCacheClient();
  const key = buildKey(address);

  const raw = await cache.get(key);
  const current = parseBalance(raw);
  const next = current + credits;

  await cache.set(key, String(next), BALANCE_TTL_SECONDS);

  return { wallet: address, balance: next };
}

export interface TryDecrementBalanceResult {
  success: boolean;
  wallet: LowerAddress | null;
  balance: number;
}

// Atomic check-and-decrement keyed by checksum-lowered wallet. Backed by the
// cache layer's tryDecrement primitive — Memory backend leverages JS
// single-threading; Upstash uses DECRBY + INCRBY rollback. Fail-closed: any
// error returns { success: false } so a Redis hiccup never falsely succeeds
// a paid /diagnose.
//
// This is the hot path on /diagnose when an authed wallet has a balance —
// keep allocations / async work to a minimum.
export async function tryDecrementBalance(
  rawWallet: string,
  credits: number,
): Promise<TryDecrementBalanceResult> {
  if (!Number.isInteger(credits) || credits <= 0) {
    return { success: false, wallet: null, balance: 0 };
  }
  const address = tryNormalizeAddress(rawWallet);
  if (!address) {
    return { success: false, wallet: null, balance: 0 };
  }
  try {
    const result = await getCacheClient().tryDecrement(buildKey(address), credits);
    return {
      success: result.success,
      wallet: address,
      balance: result.balance,
    };
  } catch {
    return { success: false, wallet: address, balance: 0 };
  }
}
