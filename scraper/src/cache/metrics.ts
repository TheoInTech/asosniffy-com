// In-process cache hit/miss counters. Resets on every process restart —
// acceptable for the MVP per business-model.md §6; replace with Prometheus or
// a hosted metrics service once we have an ops platform.

interface NamespaceCounters {
  hits: number;
  misses: number;
}

const counters = new Map<string, NamespaceCounters>();
const startedAt = Date.now();

function bucket(namespace: string): NamespaceCounters {
  let entry = counters.get(namespace);
  if (!entry) {
    entry = { hits: 0, misses: 0 };
    counters.set(namespace, entry);
  }
  return entry;
}

export function recordHit(namespace: string): void {
  bucket(namespace).hits += 1;
}

export function recordMiss(namespace: string): void {
  bucket(namespace).misses += 1;
}

export interface CacheMetricsSnapshot {
  uptimeSeconds: number;
  total: NamespaceCounters;
  byNamespace: Record<string, NamespaceCounters>;
}

export function getMetrics(): CacheMetricsSnapshot {
  const byNamespace: Record<string, NamespaceCounters> = {};
  let totalHits = 0;
  let totalMisses = 0;
  for (const [namespace, entry] of counters) {
    byNamespace[namespace] = { hits: entry.hits, misses: entry.misses };
    totalHits += entry.hits;
    totalMisses += entry.misses;
  }
  return {
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    total: { hits: totalHits, misses: totalMisses },
    byNamespace,
  };
}

export function resetMetricsForTests(): void {
  counters.clear();
}
