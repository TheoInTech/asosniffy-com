import type { AppRecord } from "../providers/apple/types.js";
import type {
  DetectedApp,
  Provenance,
  ReadyToPaste,
  RecommendationItem,
} from "../schemas/index.js";
import {
  APPLE_CAPS,
  type CompetitorAnalysis,
  type KeywordDiagnosis,
  type MetadataScoringResult,
} from "../scoring/index.js";
import {
  buildCompetitorNotes,
  effortForAction,
  impactForAction,
} from "./deterministic-prose.js";

// Deterministic template fallback synthesizer.
//
// Produces the same shape as the OpenAI synthesizer (`SynthesisOutput`)
// using only the structured scoring output + the original input. No external
// dependencies, no nondeterminism — same inputs always produce the same
// strings. This is the no-key reliability guarantee from PLAN.md §14.
//
// Phase 1: when `inputProvenance` is "fixture" or "degraded", the synthesis
// switches to sample-disclaimer copy — concrete keyword recommendations
// require non-fixture, non-degraded inputs. This stops the Phase-0 bug
// where the AI confidently recommended "promote 'habit' into the title"
// on top of fixture data.

export interface SynthesisInput {
  scoring: {
    metadata: MetadataScoringResult;
    keywords: readonly KeywordDiagnosis[];
    competitors: readonly CompetitorAnalysis[];
  };
  context: {
    detectedApp: DetectedApp;
    appRecord: AppRecord | null;
    keywords: readonly string[];
  };
  // Worst-case provenance among the report-data inputs. Drives the gating
  // decision below (fixture/degraded → sample-disclaimer copy).
  inputProvenance: Provenance;
}

export interface SynthesisOutput {
  summary: string;
  recommendations: RecommendationItem[];
  readyToPaste: ReadyToPaste;
}

export function synthesizeReportTemplate(
  input: SynthesisInput,
): SynthesisOutput {
  // Honest-floor: don't fabricate concrete recommendations over fake or
  // degraded data. Emit clearly-labeled sample copy instead.
  if (input.inputProvenance === "fixture" || input.inputProvenance === "degraded") {
    return synthesizeDisclaimerOutput(input);
  }
  return {
    summary: buildSummary(input),
    recommendations: buildRecommendations(input),
    readyToPaste: buildReadyToPaste(input),
  };
}

function synthesizeDisclaimerOutput(input: SynthesisInput): SynthesisOutput {
  const appName = input.context.detectedApp.name;
  const isFixture = input.inputProvenance === "fixture";
  const prefix = isFixture
    ? "Sample recommendations, not based on your live data."
    : "Partial recommendations — Apple or Google didn't return full data this run.";
  const followup = isFixture
    ? "These are demo recommendations from the public sample dataset. To get a diagnosis grounded in your actual App Store data, the upstream providers (Apple iTunes, Google Play) must be reachable for your store and country."
    : "We hit a provider error before all data sources resolved. Retry the diagnosis in a minute, or contact support if it persists.";

  const recommendations: RecommendationItem[] = [
    {
      rank: 1,
      action: `${appName}: re-run the diagnosis when the upstream provider is back online.`,
      impact: "low",
      effort: "low",
      rationale: prefix,
    },
    {
      rank: 2,
      action: "Audit your visible-field coverage (title, subtitle, keywords) against your top three competitors.",
      impact: "medium",
      effort: "low",
      rationale: "This is the generic ASO move that applies regardless of rank data — it's a Phase-0 audit you can do without provider access.",
    },
    {
      rank: 3,
      action: "Lock in your highest-intent keyword in the subtitle field.",
      impact: "medium",
      effort: "low",
      rationale: "Apple weights the subtitle alongside the title; promoting your top-intent keyword there is the highest-leverage move in ASO. No rank data needed.",
    },
  ];

  const primary = input.context.keywords[0] ?? "your category";
  return {
    summary: `${prefix} ${followup}`,
    recommendations,
    readyToPaste: {
      title: truncate(appName, APPLE_CAPS.title),
      subtitle: truncate(`${capitalize(primary)} — sample`, APPLE_CAPS.subtitle),
      keywordsField: buildKeywordsField(input.context.keywords),
      shortDescription: truncate(
        `${appName} (sample). Re-run when live data is available for an evidence-based ASO diagnosis.`,
        240,
      ),
    },
  };
}

function buildSummary(input: SynthesisInput): string {
  const appName = input.context.detectedApp.name;
  const overall = input.scoring.metadata.overall;
  const primary = input.context.keywords[0];

  const topRanking = input.scoring.keywords.find(
    (k) => k.rankBucket === "1-10" || k.rankBucket === "11-30",
  );
  const promoteCandidate = input.scoring.keywords.find(
    (k) => k.action === "add_to_title" || k.action === "add_to_subtitle",
  );
  const topCompetitor = input.scoring.competitors[0];

  const fragments: string[] = [];

  fragments.push(
    `${appName} scores ${overall}/100 across the indexed metadata surfaces.`,
  );

  if (primary && topRanking && topRanking.keyword.toLowerCase() === primary.toLowerCase()) {
    fragments.push(
      `"${primary}" is already ranking — the work is converting that into title-bar real estate.`,
    );
  } else if (promoteCandidate) {
    const field =
      promoteCandidate.action === "add_to_title" ? "title" : "subtitle";
    fragments.push(
      `The fastest unlock is promoting "${promoteCandidate.keyword}" into the ${field}.`,
    );
  } else if (primary) {
    fragments.push(`"${primary}" is the keyword with the most leverage right now.`);
  }

  if (topCompetitor && topCompetitor.uniqueToCompetitor.length > 0) {
    fragments.push(
      `${topCompetitor.name} is winning surface area on terms ${appName} doesn't carry yet.`,
    );
  } else if (topCompetitor) {
    fragments.push(
      `${topCompetitor.name} is the closest competitor on these keywords.`,
    );
  }

  return fragments.join(" ");
}

function buildRecommendations(
  input: SynthesisInput,
): RecommendationItem[] {
  const items: RecommendationItem[] = [];

  // 1) Highest-impact keyword promotions, in order.
  const promotions = input.scoring.keywords.filter(
    (k) => k.action === "add_to_title" || k.action === "add_to_subtitle",
  );
  for (const k of promotions) {
    items.push({
      rank: items.length + 1,
      action:
        k.action === "add_to_title"
          ? `Add "${k.keyword}" to the app title.`
          : `Add "${k.keyword}" to the subtitle.`,
      impact: impactForAction(k.action),
      effort: effortForAction(k.action),
      rationale:
        k.action === "add_to_title"
          ? `Title is Apple's heaviest-weighted indexed field. "${k.keyword}" currently sits in the keywords field (rank bucket ${k.rankBucket}); pulling it into the title is the biggest single rank lever available.`
          : `Subtitle indexes alongside the title at 30 characters. Promoting "${k.keyword}" out of the hidden keywords field (rank bucket ${k.rankBucket}) recovers visible-field weight without disturbing brand.`,
    });
  }

  // 2) Subtitle rewrite if subtitle subscore is weak (and we didn't already
  //    cover it via a promotion).
  if (
    input.scoring.metadata.subtitle.score < 60 &&
    !promotions.some((p) => p.action === "add_to_subtitle")
  ) {
    const reason =
      input.scoring.metadata.subtitle.reasons[0] ??
      "Subtitle is under-using its 30-character budget.";
    items.push({
      rank: items.length + 1,
      action: "Rewrite the subtitle.",
      impact: "medium",
      effort: "low",
      rationale: reason,
    });
  }

  // 3) Drop low-intent dead-weight keywords.
  const drops = input.scoring.keywords.filter((k) => k.action === "drop");
  if (drops.length > 0) {
    const list = drops.map((d) => `"${d.keyword}"`).join(", ");
    items.push({
      rank: items.length + 1,
      action: `Drop dead-weight keyword${drops.length === 1 ? "" : "s"}: ${list}.`,
      impact: "low",
      effort: "low",
      rationale: `${drops.length === 1 ? "This term is" : "These terms are"} not ranking and have low search intent — reclaim the slot${drops.length === 1 ? "" : "s"} for a more competitive keyword.`,
    });
  }

  // 4) Competitor copy lessons.
  const topCompetitor = input.scoring.competitors[0];
  if (topCompetitor && topCompetitor.uniqueToCompetitor.length > 0) {
    items.push({
      rank: items.length + 1,
      action: `Study how ${topCompetitor.name} uses ${topCompetitor.uniqueToCompetitor
        .slice(0, 2)
        .map((t) => `"${t}"`)
        .join(" and ")}.`,
      impact: "medium",
      effort: "medium",
      rationale: buildCompetitorNotes(topCompetitor),
    });
  }

  // Guarantee at least one recommendation so the schema's `recommendations`
  // array always has prose for the founder.
  if (items.length === 0) {
    const primary = input.context.keywords[0] ?? "your top keyword";
    items.push({
      rank: 1,
      action: `Audit visible-field coverage for "${primary}".`,
      impact: "medium",
      effort: "low",
      rationale: `Scoring found no immediate moves on your input keywords. The next step is to compare visible-field coverage against the competitor trail.`,
    });
  }

  return items.slice(0, 5);
}

function buildReadyToPaste(input: SynthesisInput): ReadyToPaste {
  const appName = input.context.detectedApp.name;
  const existingSubtitle = input.context.appRecord?.subtitle ?? "";
  const primary = input.context.keywords[0] ?? "your category";

  const titleAction = input.scoring.keywords.find((k) => k.action === "add_to_title");
  const title = titleAction
    ? truncate(`${appName} — ${capitalize(titleAction.keyword)}`, APPLE_CAPS.title)
    : truncate(appName, APPLE_CAPS.title);

  const subtitleAction = input.scoring.keywords.find(
    (k) => k.action === "add_to_subtitle",
  );
  const subtitle = subtitleAction
    ? truncate(
        `${capitalize(subtitleAction.keyword)} & ${suffixForCategory(input.context.appRecord?.primaryCategory)}`,
        APPLE_CAPS.subtitle,
      )
    : truncate(
        existingSubtitle.length > 0
          ? existingSubtitle
          : `${capitalize(primary)} for indie builders`,
        APPLE_CAPS.subtitle,
      );

  const keywordsField = buildKeywordsField(input.context.keywords);

  const shortDescription = truncate(
    `${appName} helps you with ${primary.toLowerCase()} — focused, fast, and built for the workflow you already have.`,
    240,
  );

  return {
    title,
    subtitle,
    keywordsField,
    shortDescription,
  };
}

function buildKeywordsField(keywords: readonly string[]): string {
  if (keywords.length === 0) return "";
  // App Store Connect uses comma-joined single tokens, no spaces, lowercased.
  // We approximate by joining the user-provided phrases with commas.
  const joined = keywords
    .map((k) => k.toLowerCase().trim())
    .filter((k) => k.length > 0)
    .join(",");
  return truncate(joined, APPLE_CAPS.keywordsField);
}

function suffixForCategory(category: string | undefined): string {
  if (!category) return "Streaks";
  switch (category.toLowerCase()) {
    case "productivity":
      return "Streaks & Routines";
    case "education":
      return "Learn Daily";
    case "health & fitness":
      return "Healthy Habits";
    case "lifestyle":
      return "Daily Rituals";
    default:
      return "Daily Practice";
  }
}

function truncate(s: string, cap: number): string {
  return s.length <= cap ? s : s.slice(0, cap);
}

function capitalize(text: string): string {
  if (text.length === 0) return text;
  return text
    .split(" ")
    .map((word) => (word ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(" ");
}
