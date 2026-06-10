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
import {
  computeChance,
  computeKei,
  computeObservablePopularity,
  estimateMaxDailyImpressions,
} from "./keyword-popularity.js";
import type { BenchmarkRange } from "../schemas/index.js";

// Phase 3 — popularity + related-terms input per keyword. Optional so
// pre-Phase-3 callers (or callers with ASA disabled) get heuristic intent
// unchanged.
export interface KeywordPopularityInfo {
  keyword: string;
  popularityScore: number | null;
  popularitySource: "apple-search-ads" | "observable-signals" | "heuristic";
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
  popularitySource: "apple-search-ads" | "observable-signals" | "heuristic";
  popularityAsOf: string | null;
  relatedTerms: string[];
  // Wave 1 (roadmap 1.3) — app-relative opportunity signals. chance = where
  // the TARGET app's competitive score sits vs the top-N for this keyword
  // (1-100, higher = better chance to rank); kei = geometric mean of
  // popularity x chance; estMaxDailyImpressions = SplitMetrics/Phiture 2019
  // exponential as a labeled range. All null-gated honestly.
  chance: number | null;
  kei: number | null;
  estMaxDailyImpressions: BenchmarkRange | null;
  // Phase 6 (this PR) — keyword-difficulty signals derived from the top-N
  // competitors in the same iTunes search response. `difficulty` is null
  // and `difficultyIsFallback: true` when the top-five gate trips
  // (rate-limit, niche keyword, etc.). `matchKind` is how the user's
  // listing surfaces this keyword.
  difficulty: number | null;
  minDifficulty: number | null;
  difficultyIsFallback: boolean;
  matchKind: KeywordMatchKind;
  // Lifecycle gate — set true when the target app is too young / too
  // low-velocity for a `not_found` rank to be evidence of low intent.
  // Used only by the deterministic prose layer to swap "drop" advice for
  // "still seeding"; intentionally not surfaced in the public schema yet.
  isAppSeeding: boolean;
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
  const isAppSeeding = isAppStillSeeding(input.app, now);

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

    // Intent weighting deliberately treats observable-signal popularity like
    // the legacy heuristic: the 0.45/0.7 action thresholds were tuned against
    // heuristic intent, and obs-1 is unvalidated until the V4 study lands —
    // only live ASA data earns the stronger weighting.
    const intent = popularityWeightedIntent({
      keyword,
      popularityScore: popularity?.popularityScore ?? null,
      popularitySource:
        popularity?.popularitySource === "apple-search-ads"
          ? "apple-search-ads"
          : "heuristic",
    });
    const action = decideAction({
      rankBucket: rank?.rankBucket ?? "not_found",
      intent,
      coverageInTitle,
      coverageInSubtitle,
      isAppSeeding,
    });

    const difficultyOutcome = scoreKeywordDifficulty({
      keyword,
      competitors: rank?.topCompetitors,
      totalReturned: rank?.returnedCount,
      now,
    });

    // Wave 1 — observable-signal popularity (obs-1). Live ASA data, when the
    // flag-gated provider returned it, stays the labeled overlay; otherwise
    // the documented public-signal blend replaces the unlabeled heuristic
    // whenever the keyword's search results give it something to estimate
    // from. autocompleteRank is wired null for now: the autocomplete
    // provider fetches suggestions FOR a term, not the term's position
    // under its own prefix (follow-up in the keyword-intel endpoint work).
    const asaIsLive =
      popularity?.popularitySource === "apple-search-ads" &&
      popularity.popularityScore !== null;
    const observable = asaIsLive
      ? null
      : computeObservablePopularity({
          keyword,
          appCount: rank?.returnedCount ?? null,
          topApps: (rank?.topCompetitors ?? []).map((c) => ({
            name: c.name,
            averageUserRating: c.ratingsSummary.average,
            userRatingCount: c.ratingsSummary.count,
          })),
          autocompleteRank: null,
        });
    const popularityScore = asaIsLive
      ? popularity!.popularityScore
      : (observable?.score ?? popularity?.popularityScore ?? null);
    const popularitySource: KeywordDiagnosis["popularitySource"] = asaIsLive
      ? "apple-search-ads"
      : observable !== null
        ? "observable-signals"
        : (popularity?.popularitySource ?? "heuristic");

    // Wave 1 — chance/KEI/impressions. The target app is scored with the
    // SAME competitorScore formula its competitors were scored with, using
    // the matchKind already classified against its own title/subtitle.
    const targetScore = scoreTargetApp(input.app, matchKind, now);
    const chance = computeChance({
      targetCompetitiveScore: targetScore,
      topCompetitiveScores: difficultyOutcome.competitiveScores,
    });
    const kei = computeKei(popularityScore, chance);
    const estMaxDailyImpressions =
      popularityScore !== null
        ? estimateMaxDailyImpressions(popularityScore)
        : null;

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
      popularityScore,
      popularitySource,
      popularityAsOf: popularity?.popularityAsOf ?? null,
      relatedTerms: popularity?.relatedTerms ?? [],
      chance,
      kei,
      estMaxDailyImpressions,
      difficulty: difficultyOutcome.difficulty,
      minDifficulty: difficultyOutcome.minDifficulty,
      difficultyIsFallback: difficultyOutcome.isFallback,
      matchKind,
      isAppSeeding,
    } satisfies KeywordDiagnosis;
  });
}

// A `not_found` rank in a 35-day-old listing with 0.11 ratings/day is
// evidence of "still seeding," not "low intent." Without this gate the
// drop branch in decideAction fires on every niche/long-tail keyword in a
// brand-new app and the synthesis layer ends up recommending users drop
// their most relevant terms. The OR is intentionally permissive:
// false-positives produce "keep watching" advice (safe), while
// false-negatives drop high-relevance terms (harmful).
function isAppStillSeeding(app: AppRecord | null, now: number): boolean {
  if (!app?.releaseDate) return false;
  const released = Date.parse(app.releaseDate);
  if (!Number.isFinite(released)) return false;
  const days = (now - released) / DAY_MS;
  if (days < 90) return true;
  const ratings = app.ratingsSummary?.count ?? 0;
  const perDay = ratings / Math.max(days, 1);
  return perDay < 0.5;
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
  // Wave 1 — the per-competitor scores (0..1) the difficulty aggregate was
  // built from, surfaced so computeChance can place the target app among
  // them without re-scoring. Empty when no competitors were fetched.
  competitiveScores: readonly number[];
}

// Score each competitor against the target keyword, then ask the difficulty
// formula for an aggregate. When the top-five gate trips (rate-limit, niche
// keyword), `difficulty` is null and `isFallback: true` — we never fabricate
// a number from partial data.
function scoreKeywordDifficulty(
  input: ScoreKeywordDifficultyInput,
): ScoreKeywordDifficultyResult {
  if (!input.competitors || input.competitors.length === 0) {
    return {
      difficulty: null,
      minDifficulty: null,
      isFallback: true,
      competitiveScores: [],
    };
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
    // Difficulty honors the top-five gate, but the raw competitor scores are
    // still honest inputs for chance placement — surface them regardless.
    return {
      difficulty: null,
      minDifficulty: null,
      isFallback: true,
      competitiveScores: scores,
    };
  }
  // Defensive clamp at the producer boundary. The computeKeywordDifficulty
  // clamps both scores to [1, 100], but rounding to int could theoretically
  // emit a 0 if the upstream clamp drifts; the schema (z.number().int().min(1)
  // .max(100)) is the contract, so honor it here regardless.
  return {
    difficulty: clampInt(Math.round(breakdown.difficultyScore), 1, 100),
    minDifficulty: clampInt(Math.round(breakdown.minDifficultyScore), 1, 100),
    isFallback: false,
    competitiveScores: scores,
  };
}

// Wave 1 — score the TARGET app with the same formula used for its
// competitors so chance placement is apples-to-apples. Null when no
// AppRecord (android-only detection, region-locked) — computeChance then
// returns null per its honesty gate.
function scoreTargetApp(
  app: AppRecord | null,
  matchKind: KeywordMatchKind,
  now: number,
): number | null {
  if (!app) return null;
  const daysSinceFirstRelease = daysBetween(app.releaseDate, now);
  const daysSinceLastRelease = daysBetween(
    app.currentVersionReleaseDate ?? app.releaseDate,
    now,
  );
  return competitorScore({
    averageUserRating: app.ratingsSummary.average,
    userRatingCount: app.ratingsSummary.count,
    daysSinceFirstRelease,
    daysSinceLastRelease,
    keywordMatch: matchKind,
  }).score;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
  isAppSeeding: boolean;
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

  // Lifecycle gate — seeding apps don't have enough listing-history evidence
  // to declare a keyword dead. Hold the slot, swap the prose to "still
  // seeding" downstream, and re-check after the app accumulates velocity.
  if (input.isAppSeeding && ranksPoorly) {
    return "keep_in_keywords_field";
  }

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
