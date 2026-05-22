import {
  type CountryCode,
  type CoverageProviderError,
} from "../schemas/index.js";
import { searchApps } from "../providers/apple/itunes.js";
import type { AppRecord } from "../providers/apple/types.js";
import { withCache } from "../cache/wrapper.js";
import { cacheKey } from "../cache/keys.js";
import { CACHE_TTL } from "../cache/ttl.js";
import { toProviderError } from "../providers/_lib/errors.js";
import type {
  CompetitorCandidate,
  CompetitorSource,
} from "./report-data.js";

// Phase 9 (Day 2) — Multi-keyword competitor intersection.
//
// Replacement primary path for collectIosCompetitors. Where the legacy
// path searched only the user's FIRST keyword and took top 5 — which
// surfaced off-category competitors for any keyword set with mixed
// intent — the intersection path runs all submitted keywords in parallel
// and keeps only the apps that appear in TWO OR MORE of those result
// sets. That cross-keyword overlap IS the relevance signal: apps that
// rank for "pickleball app" AND "tournament tracker" are far more
// likely to be on-topic than apps that only rank for one of them.
//
// Cost discipline (devsecops review):
//   - ≤ 5 user keywords ⇒ ≤ 5 iTunes /search calls per /diagnose
//     (each is independently cached at the apple:competitor-search
//     namespace, key shape compatible with the legacy path so warm
//     caches share entries — first /diagnose pays N calls, subsequent
//     calls reuse them).
//   - Only the TOP_PER_KEYWORD = 3 results of each search count toward
//     the intersection. Capping per-keyword (not just overall) keeps
//     the fan-out budget bounded under the raised
//     ITUNES_RATE_LIMIT_PER_MIN=45 budget.
//   - Promise.allSettled so one slow/failed search doesn't block the
//     others; partial degradation surfaces as a CoverageProviderError
//     entry but the request still serves.
//
// Fallback: when intersection produces fewer than MIN_USEFUL_ROWS = 3
// matches (or the user submitted <2 keywords), the orchestrator falls
// back to the legacy first-keyword path — better to ship a less
// targeted competitor trail than no trail at all.

const APPLE_PROVIDER = "apple-itunes";
const TOP_PER_KEYWORD = 3;
const MIN_MATCHES = 2;
const RESULT_CAP = 5;
const SEARCH_LIMIT = 20;
export const MIN_USEFUL_ROWS = 3;

export interface CompetitorIntersectionInput {
  keywords: readonly string[];
  country: CountryCode;
  // The target app's appId — excluded from the result set so we don't
  // surface the user's own app as their competitor.
  excludeAppId: string;
}

export interface CompetitorIntersectionOutcome {
  rows: CompetitorCandidate[];
  errors: CoverageProviderError[];
}

export async function collectIosCompetitorsByIntersection(
  input: CompetitorIntersectionInput,
): Promise<CompetitorIntersectionOutcome> {
  if (input.keywords.length < MIN_MATCHES) {
    return { rows: [], errors: [] };
  }

  const settled = await Promise.allSettled(
    input.keywords.map((keyword) =>
      withCache(
        () =>
          searchApps({
            term: keyword,
            country: input.country,
            limit: SEARCH_LIMIT,
          }),
        {
          key: cacheKey({
            namespace: "apple:competitor-search",
            country: input.country,
            extra: { keyword: keyword.toLowerCase(), limit: SEARCH_LIMIT },
          }),
          ttlSeconds: CACHE_TTL.appMetadata,
          namespace: "apple:competitor-search",
          audit: { provider: APPLE_PROVIDER, endpoint: "/search" },
        },
      ).then((res) => ({ keyword, res })),
    ),
  );

  const errors: CoverageProviderError[] = [];
  const matchMap = new Map<
    string,
    {
      record: AppRecord;
      matchedKeywords: Set<string>;
      bestRank: number;
    }
  >();

  for (const result of settled) {
    if (result.status === "rejected") {
      errors.push({
        provider: APPLE_PROVIDER,
        kind: "network_error",
        message: `intersection search failed: ${String(result.reason).slice(0, 200)}`,
      });
      continue;
    }
    const { keyword, res } = result.value;
    if ("error" in res) {
      const provErr = toProviderError({
        provider: APPLE_PROVIDER,
        endpoint: "/search",
        legacy: res,
      });
      errors.push({
        provider: APPLE_PROVIDER,
        kind: provErr.kind,
        message: provErr.message,
      });
      continue;
    }
    const eligible = res
      .filter((r) => r.id !== input.excludeAppId)
      .slice(0, TOP_PER_KEYWORD);
    for (let i = 0; i < eligible.length; i += 1) {
      const candidate = eligible[i]!;
      const existing = matchMap.get(candidate.id);
      if (existing) {
        existing.matchedKeywords.add(keyword.toLowerCase());
        existing.bestRank = Math.min(existing.bestRank, i);
      } else {
        matchMap.set(candidate.id, {
          record: candidate,
          matchedKeywords: new Set([keyword.toLowerCase()]),
          bestRank: i,
        });
      }
    }
  }

  const intersected = Array.from(matchMap.values()).filter(
    (e) => e.matchedKeywords.size >= MIN_MATCHES,
  );

  intersected.sort((a, b) => {
    if (b.matchedKeywords.size !== a.matchedKeywords.size) {
      return b.matchedKeywords.size - a.matchedKeywords.size;
    }
    return a.bestRank - b.bestRank;
  });

  const rows: CompetitorCandidate[] = intersected
    .slice(0, RESULT_CAP)
    .map((e) => ({
      appId: e.record.id,
      name: e.record.name,
      provenance: e.record.provenance,
      source: "search" as CompetitorSource,
      record: e.record,
    }));

  return { rows, errors };
}
