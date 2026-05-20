import type { AppRecord } from "../providers/apple/types.js";
import type { AndroidAppRecord } from "../providers/android/types.js";

// Both Apple and Android records expose enough of the same fields that we
// can score them with the same similarity function. The local type guard
// extracts the fields similarityScore reads.
export interface IdentityCandidate {
  name: string;
  bundleId?: string;
  ratingsSummary: { average: number; count: number };
}

export function toIdentityCandidate(
  record: AppRecord | AndroidAppRecord,
): IdentityCandidate {
  // Apple records carry `bundleId`; Android records carry `packageName`.
  // Both are reverse-DNS strings and serve the same role for similarity.
  if ("packageName" in record) {
    return {
      name: record.name,
      bundleId: record.packageName,
      ratingsSummary: record.ratingsSummary,
    };
  }
  const c: IdentityCandidate = {
    name: record.name,
    ratingsSummary: record.ratingsSummary,
  };
  if (record.bundleId !== undefined) c.bundleId = record.bundleId;
  return c;
}

// App-identity similarity scoring.
//
// Previously `detect.ts` accepted iTunes' first search result blindly —
// ambiguous names ("Habit", "Notes", "Camera") silently returned whatever
// Apple ranked first that day. This module produces a 0–1 score per
// candidate so the orchestrator can:
//   - accept high-similarity matches (≥ 0.85) as `identityConfidence: high`
//   - surface mid-confidence matches with a `candidates[]` array
//   - refuse to generate a paid report when confidence is `low`
//
// Inputs the scorer uses:
//   1. Normalized Levenshtein distance between query and trackName.
//   2. Token-overlap ratio between query tokens and trackName tokens.
//   3. bundleId substring match if the query looks like a reverse-DNS.
//   4. userRatingCount as a popularity tiebreaker (an app with 1M ratings is
//      more likely the intended match than one with 50).
//
// The score is a weighted average of these signals; weights are tuned so
// an exact name match scores ≥ 0.95 and a same-token-different-developer
// match scores ~0.70 (medium confidence — surface candidates).

const REVERSE_DNS_RE = /^[a-z0-9][a-z0-9_]*(\.[a-z0-9][a-z0-9_-]*){2,}$/i;

export function similarityScore(
  query: string,
  record: AppRecord | AndroidAppRecord | IdentityCandidate,
): number {
  const c =
    "ratingsSummary" in record &&
    !("packageName" in record) &&
    !("bundleId" in record) &&
    !("description" in record)
      ? (record as IdentityCandidate)
      : toIdentityCandidate(record as AppRecord | AndroidAppRecord);
  return similarityScoreOnCandidate(query, c);
}

function similarityScoreOnCandidate(
  query: string,
  candidate: IdentityCandidate,
): number {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return 0;

  // 1. Exact-name match → 1.0 short-circuit (case- and punctuation-insensitive).
  const name = candidate.name.trim().toLowerCase();
  if (normalize(q) === normalize(name)) return 1.0;

  // 2. bundleId / packageName reverse-DNS match → very strong signal.
  if (REVERSE_DNS_RE.test(q) && candidate.bundleId) {
    if (candidate.bundleId.toLowerCase() === q) return 0.98;
    if (
      candidate.bundleId.toLowerCase().includes(q) ||
      q.includes(candidate.bundleId.toLowerCase())
    ) {
      return 0.92;
    }
  }

  // 3. Levenshtein-derived similarity over normalized strings.
  const levSim = 1 - levenshtein(normalize(q), normalize(name)) / Math.max(q.length, name.length);

  // 4. Token overlap (Jaccard over word sets).
  const qTokens = tokenize(q);
  const nTokens = tokenize(name);
  const jaccard = jaccardSimilarity(qTokens, nTokens);

  // 5. Popularity boost — caps at +0.05 for apps with ≥ 100K ratings.
  const popularityBoost = popularityWeight(candidate.ratingsSummary.count);

  // Weighted blend. Levenshtein dominates for typos / suffix differences;
  // Jaccard catches "Notes" vs "Notes Plus" pattern; popularity is a tiebreaker.
  const blend = levSim * 0.55 + jaccard * 0.4 + popularityBoost;
  return clamp01(blend);
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[–—−-]/g, " ") // dashes → spaces
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ") // strip punctuation
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): Set<string> {
  return new Set(
    normalize(s)
      .split(" ")
      .filter((t) => t.length > 0),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersect = 0;
  for (const t of a) {
    if (b.has(t)) intersect += 1;
  }
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

// Iterative Levenshtein with two-row buffer. O(n*m) time, O(min(n,m)) space.
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1]! + 1, // insertion
        prev[j]! + 1, // deletion
        prev[j - 1]! + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

function popularityWeight(ratingsCount: number): number {
  if (ratingsCount >= 100_000) return 0.05;
  if (ratingsCount >= 10_000) return 0.03;
  if (ratingsCount >= 1_000) return 0.01;
  return 0;
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
