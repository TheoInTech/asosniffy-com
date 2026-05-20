import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Hono } from "hono";
import { env } from "../env.js";
import { SCHEMA_VERSION } from "../schemas/index.js";
import { getMetrics } from "../cache/metrics.js";
import { getCacheClient } from "../cache/redis.js";
import { getSloSnapshots } from "../observability/slo.js";
import { getShapeDrift } from "../observability/shape-hash.js";

export const healthRoute = new Hono();

interface BaselineEntry {
  hash: string;
  fieldPaths: string[];
  capturedAt: string;
}

// Lazily load shape baselines once at module init so /health/drift doesn't
// hit disk per request. Missing file → empty baselines map (drift endpoint
// degrades gracefully with `baselineHash: null` for every provider).
let baselinesCache: Record<string, BaselineEntry> | null = null;
function getBaselines(): Record<string, BaselineEntry> {
  if (baselinesCache !== null) return baselinesCache;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const baselinePath = resolve(here, "..", "data", "shape-baselines.json");
    const raw = readFileSync(baselinePath, "utf8");
    baselinesCache = JSON.parse(raw) as Record<string, BaselineEntry>;
  } catch {
    baselinesCache = {};
  }
  return baselinesCache;
}

healthRoute.get("/", (c) =>
  c.json({
    ok: true,
    schemaVersion: SCHEMA_VERSION,
    network: env.MORPH_NETWORK,
  }),
);

// /health/metrics surfaces:
//   • Cache hit/miss counters (Phase 0)
//   • SLO snapshots over a 60-min sliding window (Phase 1)
//   • Cache backend identifier
//
// Unauthenticated by design — judges and uptime monitors hit it without keys.
// A Phase 5 rate-limit (6/min/IP) prevents abuse.
healthRoute.get("/metrics", (c) =>
  c.json({
    ...getMetrics(),
    cacheBackend: getCacheClient().backend,
    slo: getSloSnapshots(),
  }),
);

// /health/drift — per provider+endpoint, compare the committed baseline hash
// against the last-seen hash. Driven by Phase 4 shape-hash monitoring.
// Unauthenticated like /metrics; safe because we expose only hash + ISO
// timestamps + structural field paths (already in baseline file).
healthRoute.get("/drift", async (c) => {
  const baselines = getBaselines();
  const entries = await Promise.all(
    Object.entries(baselines).map(async ([key, entry]) => {
      const [provider, endpoint] = key.split(":");
      if (!provider || !endpoint) return null;
      const state = await getShapeDrift({ provider, endpoint });
      return [
        key,
        {
          baselineHash: entry.hash,
          baselineCapturedAt: entry.capturedAt,
          lastSeenHash: state.lastSeenHash,
          driftSince: state.driftSince,
          // drift surfaces true when last-seen exists and differs from baseline
          drift:
            state.lastSeenHash !== null &&
            state.lastSeenHash !== entry.hash,
        },
      ] as const;
    }),
  );
  const out: Record<string, unknown> = {};
  for (const e of entries) {
    if (!e) continue;
    out[e[0]] = e[1];
  }
  return c.json({ providers: out });
});
