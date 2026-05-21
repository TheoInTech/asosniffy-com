import type { RankBucket } from "../schemas/index.js";
import type {
  CompetitorAnalysis,
  KeywordAction,
  KeywordDiagnosis,
  MetadataScoringResult,
} from "../scoring/index.js";

// Deterministic prose builders for the report's "small" string fields —
// the per-keyword recommendation, per-metadata-subscore notes, and per-
// competitor notes. The AI synthesis layer (04.p2) only handles the larger
// narrative surfaces (summary, recommendations[], readyToPaste); these
// shorter strings are derived directly from structured scoring output so
// they stay grounded and cheap.

export function buildKeywordRecommendation(d: KeywordDiagnosis): string {
  const rankPhrase = describeRank(d.rankBucket);
  const difficultyTail = describeDifficulty(d.difficulty);
  const matchTail = describeMatchKind(d.matchKind);
  const decoration = [difficultyTail, matchTail].filter(Boolean).join(" ");
  const suffix = decoration ? ` ${decoration}` : "";

  switch (d.action) {
    case "add_to_title":
      return `Move "${d.keyword}" into the app title — high intent and ${rankPhrase}. Title gets the heaviest Apple search weight.${suffix}`;
    case "add_to_subtitle":
      return `Promote "${d.keyword}" into the subtitle — ${rankPhrase}, and subtitle is the cheapest visible-field win.${suffix}`;
    case "drop":
      return `Drop "${d.keyword}" — low intent and ${rankPhrase}. Reclaim the slot for a more competitive term.${suffix}`;
    case "keep_in_keywords_field":
      if (d.coverageInTitle) {
        return `Keep "${d.keyword}" in the keywords field — already covered by the title.${suffix}`;
      }
      if (d.coverageInSubtitle) {
        return `Keep "${d.keyword}" in the keywords field — subtitle already carries it; further promotion risks displacing brand.${suffix}`;
      }
      // Lifecycle-aware framing for a `not_found` keyword while the app
      // is still seeding (young listing or low ratings velocity). Calling
      // this "low intent" would be a false negative — the listing simply
      // hasn't accumulated enough Apple-side signal yet.
      if (d.isAppSeeding && d.rankBucket === "not_found") {
        return `Keep "${d.keyword}" in the keywords field — listing is still seeding (young app or low ratings velocity), so "not ranking yet" isn't evidence of low intent. Re-check after the app accumulates more installs and reviews.${suffix}`;
      }
      return `Keep "${d.keyword}" in the keywords field — ${rankPhrase}; better fit there than in visible metadata.${suffix}`;
    default: {
      const exhaustive: never = d.action;
      throw new Error(`Unhandled keyword action: ${String(exhaustive)}`);
    }
  }
}

// "Difficulty 71/100 (high)" etc. Returns empty when we have no honest
// number — happens when the top-five gate trips (rate-limit, niche keyword).
function describeDifficulty(difficulty: number | null): string {
  if (difficulty === null) return "";
  const band = difficulty >= 67 ? "high" : difficulty >= 34 ? "medium" : "low";
  return `Difficulty ${difficulty}/100 (${band}).`;
}

// Match-kind colour for the keyword's placement on the user's listing.
// Only the actionable distinctions surface — "titleExactPhrase" is the
// strongest signal so we don't say anything (no improvement available).
function describeMatchKind(matchKind: KeywordDiagnosis["matchKind"]): string {
  switch (matchKind) {
    case "titleAllWords":
      return "Tokens are in the title but not as an exact phrase — promoting to a contiguous phrase is the cheapest single fix.";
    case "subtitleExactPhrase":
      return "Listed as an exact phrase in the subtitle.";
    case "subtitleAllWords":
      return "Subtitle has the tokens but not as a phrase.";
    case "combinedPhrase":
      return "Tokens span the title and subtitle — fragments dilute rank weight.";
    case "titleExactPhrase":
    case "none":
      return "";
  }
}

export function buildMetadataNotes(result: MetadataScoringResult): {
  title: string;
  subtitle: string;
  keywordsField: string;
  description: string;
} {
  return {
    title: firstReason(result.title.reasons, "Title scoring complete."),
    subtitle: firstReason(result.subtitle.reasons, "Subtitle scoring complete."),
    keywordsField: firstReason(
      result.keywordsField.reasons,
      "Keyword field scoring complete.",
    ),
    description: firstReason(
      result.description.reasons,
      "Listing description scoring complete.",
    ),
  };
}

export function buildCompetitorNotes(a: CompetitorAnalysis): string {
  const fragments: string[] = [];
  if (a.overlapKeywords.length > 0) {
    fragments.push(
      `Overlaps on ${quoteList(a.overlapKeywords)} — direct rank competition.`,
    );
  } else {
    fragments.push("No direct overlap on your input keywords yet.");
  }
  if (a.uniqueToCompetitor.length > 0) {
    fragments.push(
      `Leans on ${quoteList(a.uniqueToCompetitor)} — terms your listing doesn't carry.`,
    );
  }
  return fragments.join(" ");
}

function describeRank(bucket: RankBucket): string {
  switch (bucket) {
    case "1-10":
      return "currently top-10";
    case "11-30":
      return "ranking 11–30";
    case "31-50":
      return "ranking 31–50";
    case "51-100":
      return "ranking 51–100";
    case "100+":
      return "ranking past 100";
    case "not_found":
      return "not currently ranking";
  }
}

function firstReason(reasons: readonly string[], fallback: string): string {
  return reasons[0] ?? fallback;
}

function quoteList(items: readonly string[]): string {
  const quoted = items.map((i) => `"${i}"`);
  if (quoted.length === 1) return quoted[0]!;
  if (quoted.length === 2) return `${quoted[0]} and ${quoted[1]}`;
  return `${quoted.slice(0, -1).join(", ")}, and ${quoted[quoted.length - 1]}`;
}

// Map the internal KeywordAction enum to the public Recommendation impact /
// effort labels. Used by both template + AI synthesis layers to keep impact
// scoring consistent.
export function impactForAction(action: KeywordAction): "high" | "medium" | "low" {
  switch (action) {
    case "add_to_title":
      return "high";
    case "add_to_subtitle":
      return "medium";
    case "drop":
      return "low";
    case "keep_in_keywords_field":
      return "low";
  }
}

export function effortForAction(action: KeywordAction): "high" | "medium" | "low" {
  switch (action) {
    case "add_to_title":
      return "medium"; // title change risks brand displacement
    case "add_to_subtitle":
      return "low";
    case "drop":
      return "low";
    case "keep_in_keywords_field":
      return "low";
  }
}
