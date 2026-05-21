import type { AppRecord } from "../providers/apple/types.js";
import type {
  Confidence,
  Provenance,
  RankBucket,
} from "../schemas/index.js";
import type { KeywordRankDatum } from "../data/report-data.js";
import { intentScore, popularityWeightedIntent } from "./intent.js";
import {
  classifyKeywordMatch,
  type KeywordMatchKind,
} from "./keyword-match.js";
import {
  competitorScore,
  computeKeywordDifficulty,
} from "./keyword-difficulty.js";

// Phase 3 — popularity + related-terms input per keyword. Optional so
// pre-Phase-3 callers (or callers with ASA disabled) get heuristic intent
// unchanged.
export interface KeywordPopularityInfo {
  keyword: string;
  popularityScore: number | null;
  popularitySource: "apple-search-ads" | "heuristic";
  popularityAsOf: string | null;
  relatedTerms: string[];
}

// Per-keyword diagnostic combining provider rank data with metadata coverage.
// The orchestrator passes these into the synthesis layer to compose the
// prose `recommendation` string that the schema requires.

export type KeywordAction =
  | "add_to_title"
  | "add_to_subtitle"
  | "keep_in_keywords_field"
  | "drop";

export interface KeywordDiagnosis {
  keyword: string;
  rankBucket: RankBucket;
  intentScore: number;
  confidence: Confidence;
  provenance: Provenance;
  coverageInTitle: boolean;
  coverageInSubtitle: boolean;
  coverageInDescription: boolean;
  action: KeywordAction;
  // Phase 3 — surfaced through to KeywordDiagnosisItem in the API response.
  popularityScore: number | null;
  popularitySource: "apple-search-ads" | "heuristic";
  popularityAsOf: string | null;
  relatedTerms: string[];
  // Phase 6 (this PR) — keyword-difficulty signals derived from the top-N
  // competitors in the same iTunes search response. `difficulty` is null
  // and `difficultyIsFallback: true` when the top-five gate trips
  // (rate-limit, niche keyword, etc.). `matchKind` is how the user's
  // listing surfaces this keyword.
  difficulty: number | null;
  minDifficulty: number | null;
  difficultyIsFallback: boolean;
  matchKind: KeywordMatchKind;
}

export interface DiagnoseKeywordsInput {
  keywords: readonly string[];
  ranks: readonly KeywordRankDatum[];
  app: AppRecord | null;
  // Phase 3 — optional per-keyword popularity + related-terms map. When
  // omitted, falls back to heuristic intent with sources/scores nulled.
  popularity?: readonly KeywordPopularityInfo[];
}

export function diagnoseKeywords(
  input: DiagnoseKeywordsInput,
): KeywordDiagnosis[] {
  const title = (input.app?.name ?? "").toLowerCase();
  const subtitle = (input.app?.subtitle ?? "").toLowerCase();
  const description = (input.app?.description ?? "").toLowerCase();
  // Raw (unlowercased) target metadata for keyword-match classification —
  // the classifier owns case-folding so it can also strip punctuation
  // consistently with how match tokenization sees the metadata.
  const titleRaw = input.app?.name ?? "";
  const subtitleRaw = input.app?.subtitle ?? "";

  // Build a lookup so the order of `ranks` doesn't have to match `keywords`.
  const ranksByKeyword = new Map<string, KeywordRankDatum>();
  for (const r of input.ranks) {
    ranksByKeyword.set(r.keyword.toLowerCase(), r);
  }
  const popularityByKeyword = new Map<string, KeywordPopularityInfo>();
  for (const p of input.popularity ?? []) {
    popularityByKeyword.set(p.keyword.toLowerCase(), p);
  }
  const now = Date.now();

  return input.keywords.map((rawKeyword) => {
    const keyword = rawKeyword.trim();
    const lower = keyword.toLowerCase();
    const rank = ranksByKeyword.get(lower);
    const popularity = popularityByKeyword.get(lower);

    const coverageInTitle = title.length > 0 && title.includes(lower);
    const coverageInSubtitle = subtitle.length > 0 && subtitle.includes(lower);
    const coverageInDescription =
      description.length > 0 && description.includes(lower);

    const matchKind = classifyKeywordMatch({
      keyword,
      title: titleRaw,
      subtitle: subtitleRaw,
    });

    const intent = popularityWeightedIntent({
      keyword,
      popularityScore: popularity?.popularityScore ?? null,
      popularitySource: popularity?.popularitySource ?? "heuristic",
    });
    const action = decideAction({
      rankBucket: rank?.rankBucket ?? "not_found",
      intent,
      coverageInTitle,
      coverageInSubtitle,
    });

    const difficultyOutcome = scoreKeywordDifficulty({
      keyword,
      competitors: rank?.topCompetitors,
      totalReturned: rank?.returnedCount,
      now,
    });

    return {
      keyword,
      rankBucket: rank?.rankBucket ?? "not_found",
      intentScore: intent,
      confidence: rank?.confidence ?? "low",
      provenance: rank?.provenance ?? "fixture",
      coverageInTitle,
      coverageInSubtitle,
      coverageInDescription,
      action,
      popularityScore: popularity?.popularityScore ?? null,
      popularitySource: popularity?.popularitySource ?? "heuristic",
      popularityAsOf: popularity?.popularityAsOf ?? null,
      relatedTerms: popularity?.relatedTerms ?? [],
      difficulty: difficultyOutcome.difficulty,
      minDifficulty: difficultyOutcome.minDifficulty,
      difficultyIsFallback: difficultyOutcome.isFallback,
      matchKind,
    } satisfies KeywordDiagnosis;
  });
}

interface ScoreKeywordDifficultyInput {
  keyword: string;
  competitors: readonly AppRecord[] | undefined;
  totalReturned: number | undefined;
  now: number;
}

interface ScoreKeywordDifficultyResult {
  difficulty: number | null;
  minDifficulty: number | null;
  isFallback: boolean;
}

// Score each competitor against the target keyword, then ask the difficulty
// formula for an aggregate. When the top-five gate trips (rate-limit, niche
// keyword), `difficulty` is null and `isFallback: true` — we never fabricate
// a number from partial data.
function scoreKeywordDifficulty(
  input: ScoreKeywordDifficultyInput,
): ScoreKeywordDifficultyResult {
  if (!input.competitors || input.competitors.length === 0) {
    return { difficulty: null, minDifficulty: null, isFallback: true };
  }

  const scores = input.competitors.map((competitor) => {
    const match = classifyKeywordMatch({
      keyword: input.keyword,
      title: competitor.name,
      subtitle: competitor.subtitle ?? "",
    });
    const daysSinceFirstRelease = daysBetween(
      competitor.releaseDate,
      input.now,
    );
    const daysSinceLastRelease = daysBetween(
      competitor.currentVersionReleaseDate ?? competitor.releaseDate,
      input.now,
    );
    return competitorScore({
      averageUserRating: competitor.ratingsSummary.average,
      userRatingCount: competitor.ratingsSummary.count,
      daysSinceFirstRelease,
      daysSinceLastRelease,
      keywordMatch: match,
    }).score;
  });

  const breakdown = computeKeywordDifficulty({
    competitiveScores: scores,
    appCount: input.totalReturned ?? input.competitors.length,
  });
  if (breakdown.isFallback) {
    return { difficulty: null, minDifficulty: null, isFallback: true };
  }
  return {
    difficulty: Math.round(breakdown.difficultyScore),
    minDifficulty: Math.round(breakdown.minDifficultyScore),
    isFallback: false,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(iso: string | undefined, now: number): number {
  if (!iso) return Number.POSITIVE_INFINITY; // upstream treats missing as "ancient"
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(1, Math.floor((now - t) / DAY_MS));
}

interface DecideActionInput {
  rankBucket: RankBucket;
  intent: number;
  coverageInTitle: boolean;
  coverageInSubtitle: boolean;
}

// Decision matrix derived from the doc's recommendation enum:
//   • Already in title — keep it there; no action required (but we still
//     report which one applies for completeness; "keep_in_keywords_field"
//     is the closest "no-op" we have).
//   • High intent, not in title — promote to title.
//   • High intent, in subtitle but not title — leave for now; promoting to
//     title risks displacing the brand. Return keep_in_keywords_field.
//   • Medium intent, not in subtitle — promote to subtitle.
//   • Low intent, not ranking, no coverage anywhere — drop it.
//   • Anything else — keep in keywords field.
function decideAction(input: DecideActionInput): KeywordAction {
  if (input.coverageInTitle) return "keep_in_keywords_field";

  const ranksWell = input.rankBucket === "1-10" || input.rankBucket === "11-30";
  const ranksPoorly =
    input.rankBucket === "100+" || input.rankBucket === "not_found";

  // Drop: low intent + not ranking + not in any visible field.
  if (
    input.intent < 0.45 &&
    ranksPoorly &&
    !input.coverageInSubtitle
  ) {
    return "drop";
  }

  // High intent — push toward the most visible field it's missing from.
  if (input.intent >= 0.7) {
    return input.coverageInSubtitle ? "keep_in_keywords_field" : "add_to_title";
  }

  // Medium intent — subtitle is the better placement (lower risk of
  // displacing brand vs the title).
  if (input.intent >= 0.45) {
    if (!input.coverageInSubtitle) return "add_to_subtitle";
    return "keep_in_keywords_field";
  }

  // Low intent but ranks decently — likely a category browse term worth
  // keeping in the hidden field.
  if (ranksWell) return "keep_in_keywords_field";

  return "keep_in_keywords_field";
}
