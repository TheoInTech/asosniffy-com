import { getCacheClient, type CacheClient } from "../cache/redis.js";

// Wave 0.4 — demand-side funnel telemetry (discoverability roadmap, critique C1).
//
// The open question this answers: do agent buyers with funded wallets actually
// exist? We count the three funnel stages — free quote served, 402 offer
// issued, paid diagnose settled — bucketed by UTC day and client surface
// (landing / sdk / cli / mcp / anonymous, from the soft X-Sniffy-Client
// attestation). quote_success → diagnose_402 measures intent; diagnose_402 →
// diagnose_paid measures wallet conversion, the number the roadmap's bigger
// bets are gated on.
//
// Storage is Redis day-bucket counters (90-day TTL), not the request log —
// Railway log retention is shorter than a product decision cycle. Counters
// are written from the audit middleware after the response exists, so the
// payment flow itself is never touched and a telemetry failure can never
// break a paying request.

export type FunnelStage = "quote_success" | "diagnose_402" | "diagnose_paid";

const STAGE_BY_ROUTE_STATUS: Record<string, Record<number, FunnelStage>> = {
  "POST /api/v1/aso/quote": { 200: "quote_success" },
  "POST /api/v1/aso/diagnose": {
    402: "diagnose_402",
    200: "diagnose_paid",
  },
};

export function funnelStageFor(
  route: string,
  status: number,
): FunnelStage | null {
  return STAGE_BY_ROUTE_STATUS[route]?.[status] ?? null;
}

const NINETY_DAYS_SECONDS = 90 * 24 * 60 * 60;

export function funnelKey(
  stage: FunnelStage,
  surface: string,
  at: Date,
): string {
  const day = at.toISOString().slice(0, 10);
  return `aso:funnel:${day}:${stage}:${surface}`;
}

// Increment the counter for (today, stage, surface). Returns the new count,
// or null when the cache backend failed — telemetry must never throw into
// the request path.
export async function recordFunnelStage(
  stage: FunnelStage,
  surface: string,
  client?: CacheClient,
): Promise<number | null> {
  try {
    const cache = client ?? getCacheClient();
    const count = await cache.incr(
      funnelKey(stage, surface, new Date()),
      NINETY_DAYS_SECONDS,
    );
    if (process.env.ENABLE_REQUEST_LOG !== "false") {
      process.stdout.write(
        `${JSON.stringify({
          ts: new Date().toISOString(),
          level: "info",
          event: "funnel_stage",
          stage,
          surface,
          dayCount: count,
        })}\n`,
      );
    }
    return count;
  } catch {
    process.stderr.write(
      `${JSON.stringify({
        ts: new Date().toISOString(),
        level: "warn",
        event: "funnel_stage_write_failed",
        stage,
        surface,
      })}\n`,
    );
    return null;
  }
}
