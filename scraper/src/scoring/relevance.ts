import { intentScore } from "./intent.js";

// Phase 9 — Relevance gate. The chokepoint every keyword candidate passes
// through before it can land in readyToPaste or recommendations.
//
// Day 1 (this file, no embeddings): non-LLM, deterministic. The gate
// composes category-match against the target app's primaryCategory and
// the keyword's structural intent (via intent.ts). Day 5 lights up an
// embedding cosine term — until then, the formula collapses to:
//
//     score = 0.55 * categoryMatch + 0.45 * intent
//
// Labels:
//   on-topic ≥ 0.70   — safe for title / subtitle / keywords / OpenAI prompt
//   adjacent ≥ 0.45   — keyword field only; never title/subtitle
//   off-topic         — never reaches readyToPaste; surfaced in
//                       suggestedKeywords[] for honesty + UI display
//
// Bleed-fix rules (the reason this file exists):
//   1. origin === "user" always passes (score 1.0, on-topic).
//   2. origin === "competitor" with categoryMismatch is FORCED off-topic
//      regardless of intent. This is the pickleball-app gets a
//      Productivity-competitor's "tournament_bracket" bleed case.
//   3. autocomplete / asa-rec / review origins are derived from the user's
//      own queries or the user's own app context — they're on-category by
//      source, so categoryMatch defaults to true. Intent still drives the
//      score.

export type CandidateOrigin =
  | "user"
  | "competitor"
  | "autocomplete"
  | "asa-rec"
  | "review";

export type RelevanceLabel = "on-topic" | "adjacent" | "off-topic";

export interface CandidateKeyword {
  keyword: string;
  origin: CandidateOrigin;
  // For competitor-origin candidates only. The appId of the competitor that
  // surfaced this term — used to look up the competitor's primaryCategory
  // for the cross-category bleed check.
  sourceCompetitor?: string;
  // Optional popularity signal (ASA score 5-100, or autocomplete-derived
  // popularity if available). Passed through to UI; not used by the gate.
  popularity?: number | null;
}

export interface AppContext {
  appName: string;
  primaryCategory: string | undefined;
  userKeywords: readonly string[];
}

export interface CompetitorRef {
  appId: string;
  name: string;
  primaryCategory: string | undefined;
}

export interface ScoreCandidatesInput {
  candidates: readonly CandidateKeyword[];
  appContext: AppContext;
  competitorContexts: readonly CompetitorRef[];
  // Phase 9 (Day 5) — optional pre-computed cosine similarities keyed by
  // lowercased keyword. When provided, the gate switches to the
  // three-term formula (cosine + categoryMatch + intent); when
  // omitted/empty, the Day-1 formula (categoryMatch + intent) is used.
  // The orchestrator pre-computes this when env.RELEVANCE_GATE_ENABLED.
  cosineByKeyword?: ReadonlyMap<string, number>;
}

export interface ScoredCandidate {
  keyword: string;
  origin: CandidateOrigin;
  relevanceScore: number;
  relevanceLabel: RelevanceLabel;
  categoryMatch: boolean;
  intentScore: number;
  popularity: number | null;
  sourceCompetitor: string | null;
}

// Day-1 formula (no embeddings): score = CATEGORY_MATCH * 0.55 + INTENT * 0.45
const CATEGORY_MATCH_WEIGHT = 0.55;
const INTENT_WEIGHT = 0.45;

// Day-5 formula (when cosineByKeyword is provided):
//   score = COSINE * 0.55 + CATEGORY_MATCH * 0.25 + INTENT * 0.20
const COSINE_WEIGHT_DAY5 = 0.55;
const CATEGORY_MATCH_WEIGHT_DAY5 = 0.25;
const INTENT_WEIGHT_DAY5 = 0.2;

const ON_TOPIC_THRESHOLD = 0.7;
const ADJACENT_THRESHOLD = 0.45;
const OFF_TOPIC_SCORE = 0.3;

export function scoreCandidates(
  input: ScoreCandidatesInput,
): ScoredCandidate[] {
  const out: ScoredCandidate[] = [];
  const seen = new Set<string>();
  const competitorIndex = new Map(
    input.competitorContexts.map((c) => [c.appId, c] as const),
  );
  const targetCategory = normalizeCategory(input.appContext.primaryCategory);

  for (const candidate of input.candidates) {
    const keyword = candidate.keyword.toLowerCase().trim();
    if (keyword.length === 0) continue;
    if (seen.has(keyword)) continue;
    seen.add(keyword);

    const intent = intentScore(keyword);
    const popularity = candidate.popularity ?? null;
    const sourceCompetitor = candidate.sourceCompetitor ?? null;

    if (candidate.origin === "user") {
      out.push({
        keyword,
        origin: "user",
        relevanceScore: 1.0,
        relevanceLabel: "on-topic",
        categoryMatch: true,
        intentScore: intent,
        popularity,
        sourceCompetitor: null,
      });
      continue;
    }

    let categoryMatch: boolean;
    if (candidate.origin === "competitor" && candidate.sourceCompetitor) {
      const competitor = competitorIndex.get(candidate.sourceCompetitor);
      const competitorCategory = normalizeCategory(competitor?.primaryCategory);
      categoryMatch =
        targetCategory !== null &&
        competitorCategory !== null &&
        targetCategory === competitorCategory;
    } else {
      categoryMatch = true;
    }

    if (candidate.origin === "competitor" && !categoryMatch) {
      out.push({
        keyword,
        origin: candidate.origin,
        relevanceScore: OFF_TOPIC_SCORE,
        relevanceLabel: "off-topic",
        categoryMatch: false,
        intentScore: intent,
        popularity,
        sourceCompetitor,
      });
      continue;
    }

    const categoryComponent = categoryMatch ? 1.0 : 0.0;
    const cosine = input.cosineByKeyword?.get(keyword);
    const score =
      cosine !== undefined
        ? clamp01(
            COSINE_WEIGHT_DAY5 * clamp01(cosine) +
              CATEGORY_MATCH_WEIGHT_DAY5 * categoryComponent +
              INTENT_WEIGHT_DAY5 * intent,
          )
        : clamp01(
            CATEGORY_MATCH_WEIGHT * categoryComponent +
              INTENT_WEIGHT * intent,
          );
    const label = labelForScore(score);

    out.push({
      keyword,
      origin: candidate.origin,
      relevanceScore: round2(score),
      relevanceLabel: label,
      categoryMatch,
      intentScore: intent,
      popularity,
      sourceCompetitor,
    });
  }

  return out;
}

export function buildCandidatesFromCompetitors(
  competitors: ReadonlyArray<{
    appId: string;
    uniqueToCompetitor: readonly string[];
  }>,
): CandidateKeyword[] {
  const out: CandidateKeyword[] = [];
  const seen = new Set<string>();
  for (const c of competitors) {
    for (const term of c.uniqueToCompetitor) {
      const key = term.toLowerCase().trim();
      if (key.length === 0) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        keyword: key,
        origin: "competitor",
        sourceCompetitor: c.appId,
      });
    }
  }
  return out;
}

export function isOnTopicOrAdjacent(label: RelevanceLabel): boolean {
  return label !== "off-topic";
}

function labelForScore(score: number): RelevanceLabel {
  if (score >= ON_TOPIC_THRESHOLD) return "on-topic";
  if (score >= ADJACENT_THRESHOLD) return "adjacent";
  return "off-topic";
}

function normalizeCategory(category: string | undefined): string | null {
  if (!category) return null;
  const trimmed = category.trim().toLowerCase();
  return trimmed.length === 0 ? null : trimmed;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
