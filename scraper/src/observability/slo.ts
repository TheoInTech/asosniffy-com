// Rolling-window SLO counters.
//
// Phase 1 of the robustness plan defined three SLOs:
//   S1 ≥95% of /diagnose responses on iOS US/UK/CA have appMetadata=='live'
//      AND keywordRank ∈ {live, cached}.
//   S2 ≥99% of /sample responses return 200.
//   S3 ≤1% of /diagnose 200 responses ship with weighted confidence < 0.6.
//
// MVP storage is in-memory minute-bucketed counters. The Phase 4 design moves
// these to Redis ZSets for cross-instance aggregation, but for a single
// Railway service the in-memory store is sufficient and survives one process.
// Counters reset on restart — acceptable for now; see the plan's Phase 4
// observability work for the persistent path.

interface Bucket {
  ok: number;
  fail: number;
}

const counters = new Map<string, Map<number, Bucket>>();
const WINDOW_MINUTES = 60;

function minuteBucket(ts = Date.now()): number {
  return Math.floor(ts / 60_000);
}

function getOrCreate(metric: string, bucket: number): Bucket {
  let perMinute = counters.get(metric);
  if (!perMinute) {
    perMinute = new Map();
    counters.set(metric, perMinute);
  }
  let entry = perMinute.get(bucket);
  if (!entry) {
    entry = { ok: 0, fail: 0 };
    perMinute.set(bucket, entry);
  }
  return entry;
}

function pruneOld(metric: string, current: number): void {
  const perMinute = counters.get(metric);
  if (!perMinute) return;
  const cutoff = current - WINDOW_MINUTES;
  for (const minute of perMinute.keys()) {
    if (minute < cutoff) perMinute.delete(minute);
  }
}

// Record a single SLO observation. `ok=true` means the SLO target was met
// for this event; `ok=false` means it was missed (e.g. /diagnose returned
// without the required provenance).
export function recordSlo(metric: string, ok: boolean): void {
  const bucket = minuteBucket();
  const entry = getOrCreate(metric, bucket);
  if (ok) entry.ok += 1;
  else entry.fail += 1;
  pruneOld(metric, bucket);
}

export interface SloSnapshot {
  metric: string;
  windowMinutes: number;
  ok: number;
  fail: number;
  total: number;
  // Percent of events that met the SLO; null when total is 0 (no signal yet).
  pct: number | null;
}

function snapshotMetric(metric: string, current: number): SloSnapshot {
  const perMinute = counters.get(metric);
  let ok = 0;
  let fail = 0;
  if (perMinute) {
    const cutoff = current - WINDOW_MINUTES;
    for (const [minute, entry] of perMinute) {
      if (minute < cutoff) continue;
      ok += entry.ok;
      fail += entry.fail;
    }
  }
  const total = ok + fail;
  return {
    metric,
    windowMinutes: WINDOW_MINUTES,
    ok,
    fail,
    total,
    pct: total === 0 ? null : Math.round((ok / total) * 1000) / 10,
  };
}

export function getSloSnapshots(): SloSnapshot[] {
  const current = minuteBucket();
  const metrics = Array.from(counters.keys()).sort();
  return metrics.map((m) => snapshotMetric(m, current));
}

export function resetSloForTests(): void {
  counters.clear();
}

// Canonical SLO metric names. Imported by routes / middleware so the names
// stay consistent across the codebase.
export const SLO_METRICS = {
  diagnoseLiveData: "diagnose.iOS.live_data",
  sampleAvailability: "sample.availability",
  diagnoseConfidenceFloor: "diagnose.confidence_floor",
} as const;
