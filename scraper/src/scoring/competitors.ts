import type { AppRecord } from "../providers/apple/types.js";
import type { Provenance } from "../schemas/index.js";
import type { CompetitorCandidate } from "../data/report-data.js";

// Competitor analysis using only the data Phase 03 already returns —
// no extra Apple round-trips. For each competitor candidate we surface:
//   • the user's input keywords that overlap with the target app's surface
//   • candidate "keywords this competitor leans on that the target misses"
//     — extracted heuristically from the competitor's title/subtitle and
//     compared against the target's title/subtitle/keywords[] (this is the
//     "inferred" path from doc 04.p1; honest provenance).
//
// Output stays inside CompetitorTrailItem's schema shape; the synthesis
// layer composes the prose `notes` from these structured findings.

export interface CompetitorAnalysis {
  appId: string;
  name: string;
  overlapKeywords: string[];
  uniqueToCompetitor: string[];
  overlapScore: number;
  provenance: Provenance;
}

export interface AnalyzeCompetitorsInput {
  target: AppRecord | null;
  targetKeywords: readonly string[];
  candidates: readonly CompetitorCandidate[];
  // Optional: AppRecord per competitor — when Phase 03 returns competitor
  // candidates from the iTunes search results, we already have their record.
  // The orchestrator threads them through here when available.
  candidateRecords?: ReadonlyMap<string, AppRecord>;
}

export function analyzeCompetitors(
  input: AnalyzeCompetitorsInput,
): CompetitorAnalysis[] {
  const targetSurface = collectSurfaceTokens({
    title: input.target?.name,
    subtitle: input.target?.subtitle,
    keywords: input.targetKeywords,
  });

  return input.candidates.slice(0, 3).map((candidate) => {
    const record = input.candidateRecords?.get(candidate.appId);
    const competitorTokens = collectSurfaceTokens({
      title: record?.name,
      subtitle: record?.subtitle,
      keywords: [],
    });

    // overlap = user keywords that appear in the competitor's surface
    const overlap = [...input.targetKeywords]
      .map((k) => k.trim())
      .filter((k) => k.length > 0)
      .filter((k) => containsTerm(competitorTokens.flat, k.toLowerCase()));

    // unique = high-signal tokens the competitor uses that the target's
    // surface doesn't carry. Skip generic words and tokens shorter than 4
    // chars (low information).
    const unique: string[] = [];
    for (const token of competitorTokens.tokens) {
      if (token.length < 4) continue;
      if (GENERIC_TOKENS.has(token)) continue;
      if (targetSurface.tokens.has(token)) continue;
      if (overlap.some((o) => o.toLowerCase().includes(token))) continue;
      if (!unique.includes(token)) unique.push(token);
      if (unique.length >= 4) break;
    }

    return {
      appId: candidate.appId,
      name: candidate.name,
      overlapKeywords: overlap,
      uniqueToCompetitor: unique,
      overlapScore: overlap.length / Math.max(input.targetKeywords.length, 1),
      provenance: candidate.provenance,
    };
  });
}

interface SurfaceTokens {
  // Flat lowercase string used for substring matching of multi-word phrases.
  flat: string;
  // Single-token set used for unique-term diffing.
  tokens: Set<string>;
}

function collectSurfaceTokens(input: {
  title?: string;
  subtitle?: string;
  keywords: readonly string[];
}): SurfaceTokens {
  const flat = [input.title ?? "", input.subtitle ?? "", ...input.keywords]
    .join(" ")
    .toLowerCase();
  const tokens = new Set(
    flat
      .split(/[^a-z0-9]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0),
  );
  return { flat, tokens };
}

function containsTerm(haystack: string, needle: string): boolean {
  if (needle.length === 0) return false;
  return haystack.includes(needle);
}

const GENERIC_TOKENS = new Set([
  "app",
  "apps",
  "the",
  "and",
  "for",
  "with",
  "your",
  "free",
  "best",
  "new",
  "top",
  "pro",
  "plus",
  "lite",
  "ios",
  "android",
  "mobile",
  "phone",
  "smart",
  "easy",
  "simple",
]);
