import { createHash } from "node:crypto";
import { env } from "../env.js";
import { getCacheClient } from "../cache/redis.js";
import { recordSlo } from "./slo.js";

// Schema-drift detection via response shape hashing.
//
// `responseShapeHash` computes a sha256 of the structural skeleton of a
// JSON value — sorted key paths, nesting depth, array vs object markers —
// while ignoring values. The hash changes when a provider adds/removes/
// renames fields, but NOT when normal data churn changes string values
// or array lengths.
//
// Per provider+endpoint we keep two pieces of state in Redis:
//   - `aso:shape:{provider}:{endpoint}`        → last-seen hash
//   - `aso:shape:{provider}:{endpoint}:since`  → ISO timestamp when the
//                                                hash first differed from
//                                                the committed baseline
//
// The committed baselines live in `scraper/src/data/shape-baselines.json`
// (created by `pnpm run baseline:shapes`). On drift, we increment the
// Phase-1 SLO counter `drift.{provider}` and log a warning — Zod is still
// the authoritative parser, so drift NEVER gates the response.

const NAMESPACE = "aso:shape";
const TTL_SECONDS = 30 * 24 * 60 * 60; // 30d — refreshed on every write

export interface ShapeHashRecord {
  hash: string;
  fieldPaths: string[];
}

export interface ShapeDriftRecord {
  drift: boolean;
  previousHash: string | null;
  driftSince: string | null; // ISO; non-null only when drift is true
}

// Compute a stable shape hash + flat list of field paths. The field paths
// are the sorted nested key trail (e.g. ["feed.entry.0.title.label"]).
// Field paths are the most useful debugging output for shape diffs —
// reviewers see WHAT moved, not just that something changed.
export function responseShapeHash(value: unknown): ShapeHashRecord {
  const paths: string[] = [];
  walk(value, "", paths);
  paths.sort();
  const hash = createHash("sha256")
    .update(paths.join("\n"))
    .digest("hex")
    .slice(0, 16);
  return { hash, fieldPaths: paths };
}

function walk(value: unknown, prefix: string, paths: string[]): void {
  if (value === null) {
    paths.push(`${prefix}:null`);
    return;
  }
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") {
    paths.push(`${prefix}:${t}`);
    return;
  }
  if (Array.isArray(value)) {
    paths.push(`${prefix}:array`);
    // Walk the first element only — arrays of homogeneous shape produce
    // a stable signature; lengths shouldn't affect the hash.
    if (value.length > 0) walk(value[0], `${prefix}[]`, paths);
    return;
  }
  if (t === "object") {
    paths.push(`${prefix}:object`);
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj).sort()) {
      walk(obj[key], prefix === "" ? key : `${prefix}.${key}`, paths);
    }
  }
}

// Record this run's shape and report drift relative to the previous hash.
// Side-effects: writes the new last-seen hash; on drift, sets `driftSince`
// and increments the SLO drift counter for this provider.
export async function recordShape(opts: {
  provider: string;
  endpoint: string;
  hash: string;
}): Promise<ShapeDriftRecord> {
  if (!env.SHAPE_DRIFT_ENABLED) {
    return { drift: false, previousHash: null, driftSince: null };
  }
  const cache = getCacheClient();
  const lastKey = `${NAMESPACE}:${opts.provider}:${opts.endpoint}`;
  const sinceKey = `${lastKey}:since`;

  const previousHash = await cache.get(lastKey);
  const drift =
    previousHash !== null && previousHash !== opts.hash;

  let driftSince: string | null = null;
  if (drift) {
    driftSince = new Date().toISOString();
    await cache.set(sinceKey, driftSince, TTL_SECONDS);
    recordSlo(`drift.${opts.provider}`, false);
    process.stderr.write(
      `${JSON.stringify({
        ts: driftSince,
        level: "warn",
        event: "shape_drift",
        provider: opts.provider,
        endpoint: opts.endpoint,
        previousHash,
        currentHash: opts.hash,
      })}\n`,
    );
  } else if (previousHash !== null) {
    // Same hash → keep any previous driftSince so /health/drift can show
    // the original drift timestamp until the operator updates baselines.
    driftSince = await cache.get(sinceKey);
  }

  // Always refresh the last-seen entry (TTL slides forward).
  await cache.set(lastKey, opts.hash, TTL_SECONDS);

  return {
    drift,
    previousHash,
    driftSince,
  };
}

// Read-only accessor for /health/drift. Returns null when no record exists.
export async function getShapeDrift(opts: {
  provider: string;
  endpoint: string;
}): Promise<{ lastSeenHash: string | null; driftSince: string | null }> {
  const cache = getCacheClient();
  const lastKey = `${NAMESPACE}:${opts.provider}:${opts.endpoint}`;
  const sinceKey = `${lastKey}:since`;
  const [lastSeen, since] = await Promise.all([
    cache.get(lastKey),
    cache.get(sinceKey),
  ]);
  return { lastSeenHash: lastSeen, driftSince: since };
}

// One-call convenience for providers: compute hash, record, return drift
// info. Provider callers use this so they don't have to wire 3 imports.
export async function recordResponseShape(opts: {
  provider: string;
  endpoint: string;
  value: unknown;
}): Promise<ShapeDriftRecord & { hash: string; fieldPaths: string[] }> {
  const { hash, fieldPaths } = responseShapeHash(opts.value);
  const drift = await recordShape({
    provider: opts.provider,
    endpoint: opts.endpoint,
    hash,
  });
  return { ...drift, hash, fieldPaths };
}
