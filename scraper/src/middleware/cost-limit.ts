import { createMiddleware } from "hono/factory";
import { env } from "../env.js";
import { getCacheClient } from "../cache/redis.js";

// Phase 5 — cost-circuit breaker.
//
// When iTunes call rate over the last 10 minutes exceeds the configured
// threshold (COST_CIRCUIT_THRESHOLD_PCT of ITUNES_RATE_LIMIT_PER_MIN*10),
// free endpoints return 503 with Retry-After so the budget is preserved
// for paying users. Paid /diagnose stays unprotected — the wallet that
// paid expects a response.
//
// Token-bucket call counts live in `aso:rl:apple-itunes:{minute}` keys
// (managed by providers/_lib/token-bucket.ts). The circuit reads the last
// 10 buckets and sums them.

export function costCircuitMiddleware() {
  return createMiddleware(async (c, next) => {
    if (env.RL_DISABLED || env.NODE_ENV === "test") {
      await next();
      return;
    }
    const usage = await getItunesUsageLast10Min();
    const budget = env.ITUNES_RATE_LIMIT_PER_MIN * 10;
    const pctUsed = budget === 0 ? 0 : (usage / budget) * 100;

    if (pctUsed >= env.COST_CIRCUIT_THRESHOLD_PCT) {
      c.header("Retry-After", "600");
      return c.json(
        {
          error: {
            code: "cost_circuit_open",
            message:
              "Free-tier capacity is reserved for paid /diagnose right now. Try again in a few minutes, or call /diagnose directly with an x402 payment.",
          },
          usagePct: Math.round(pctUsed),
        },
        503,
      );
    }
    await next();
  });
}

// Sum minute-bucket counts for the iTunes provider over the last 10 minutes.
// The keys are written by `providers/_lib/token-bucket.ts`.
async function getItunesUsageLast10Min(): Promise<number> {
  const cache = getCacheClient();
  const nowMinute = Math.floor(Date.now() / 60_000);
  const keys = Array.from({ length: 10 }, (_, i) =>
    `aso:rl:apple-itunes:${nowMinute - i}`,
  );
  const values = await Promise.all(keys.map((k) => cache.get(k)));
  let total = 0;
  for (const v of values) {
    if (v === null) continue;
    const n = parseInt(v, 10);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}
