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
  switch (d.action) {
    case "add_to_title":
      return `Move "${d.keyword}" into the app title — high intent and ${rankPhrase}. Title gets the heaviest Apple search weight.`;
    case "add_to_subtitle":
      return `Promote "${d.keyword}" into the subtitle — ${rankPhrase}, and subtitle is the cheapest visible-field win.`;
    case "drop":
      return `Drop "${d.keyword}" — low intent and ${rankPhrase}. Reclaim the slot for a more competitive term.`;
    case "keep_in_keywords_field":
      if (d.coverageInTitle) {
        return `Keep "${d.keyword}" in the keywords field — already covered by the title.`;
      }
      if (d.coverageInSubtitle) {
        return `Keep "${d.keyword}" in the keywords field — subtitle already carries it; further promotion risks displacing brand.`;
      }
      return `Keep "${d.keyword}" in the keywords field — ${rankPhrase}; better fit there than in visible metadata.`;
    default: {
      const exhaustive: never = d.action;
      throw new Error(`Unhandled keyword action: ${String(exhaustive)}`);
    }
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
