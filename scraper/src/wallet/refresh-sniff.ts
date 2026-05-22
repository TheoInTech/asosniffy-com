import { getCacheClient } from "../cache/redis.js";
import type { CountryCode, Store } from "../schemas/index.js";

// Sprint A — refresh-sniff discount. When a paid /diagnose has settled for
// the same (store, country, appId) within the last 30 days, the next /quote
// halves its price. The mechanic is a thin Redis presence check; the actual
// discount math lives in payment/pricing.ts.
//
// Failure semantics: every fail-open helper here returns the "no discount"
// answer (false / no-op write). A Redis outage therefore never overcharges
// a returning founder — it just misses a discount we'd otherwise apply.

const REFRESH_WINDOW_DAYS = 30;
const REFRESH_WINDOW_SECONDS = REFRESH_WINDOW_DAYS * 24 * 60 * 60;

export interface RefreshSniffKey {
  store: Store;
  country: CountryCode;
  appId: string;
}

function buildKey(input: RefreshSniffKey): string {
  // Country is normalized upstream by Zod (must match /^[A-Z]{2}$/), but a
  // belt-and-suspenders upper-case keeps the key stable if a future caller
  // bypasses the schema (e.g. internal job).
  return `diagnose:completed:${input.store}:${input.country.toUpperCase()}:${input.appId}`;
}

export async function markDiagnoseCompleted(
  input: RefreshSniffKey,
): Promise<void> {
  try {
    await getCacheClient().set(buildKey(input), "1", REFRESH_WINDOW_SECONDS);
  } catch {
    // Marker write failure means the next /quote pays full price. Caller
    // already settled the current diagnose; do not surface the Redis error.
  }
}

export async function hasRecentDiagnose(
  input: RefreshSniffKey,
): Promise<boolean> {
  try {
    const value = await getCacheClient().get(buildKey(input));
    return value !== null;
  } catch {
    return false;
  }
}
