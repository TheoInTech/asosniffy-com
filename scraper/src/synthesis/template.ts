import type { AppRecord } from "../providers/apple/types.js";
import type {
  DetectedApp,
  Provenance,
  ReadyToPaste,
  ReadyToPasteField,
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

// Google Play short-description cap doesn't match this number, but the
// existing scoring + UI treat the `shortDescription` slot as a punchy
// 1-2 sentence summary closer to iOS promotional text. Kept at 240 to
// preserve pre-refactor behavior; revisit when Android scraping is wired.
export const SHORT_DESCRIPTION_CAP = 240;

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
  const sampleSubtitle = truncate(
    `${capitalize(primary)} — sample`,
    APPLE_CAPS.subtitle,
  );
  const sampleShortDescription = truncate(
    `${appName} (sample). Re-run when live data is available for an evidence-based ASO diagnosis.`,
    SHORT_DESCRIPTION_CAP,
  );
  const sampleKeywords = buildKeywordsField(input.context.keywords);
  const disclaimerReason = isFixture
    ? "Sample data — re-run with live providers for a real recommendation."
    : "Partial data — provider degraded; re-run for a real recommendation.";

  return {
    summary: `${prefix} ${followup}`,
    recommendations,
    readyToPaste: {
      title: makeField({
        current: truncate(appName, APPLE_CAPS.title),
        recommended: null,
        changeReason: disclaimerReason,
        charLimit: APPLE_CAPS.title,
      }),
      subtitle: makeField({
        current: input.context.appRecord?.subtitle ?? "",
        recommended: sampleSubtitle,
        changeReason: disclaimerReason,
        charLimit: APPLE_CAPS.subtitle,
      }),
      keywordsField: makeField({
        current: sampleKeywords,
        recommended: null,
        changeReason: disclaimerReason,
        charLimit: APPLE_CAPS.keywordsField,
      }),
      shortDescription: makeField({
        current: "",
        recommended: sampleShortDescription,
        changeReason: disclaimerReason,
        charLimit: SHORT_DESCRIPTION_CAP,
      }),
      source: "template-fallback",
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

  // 2) Subtitle rewrite if subtitle subscore is weak AND there's an actual
  //    negative reason to point at. The metadata scorer can emit a "below 60"
  //    score whose `reasons[0]` is a *positive* note (e.g., "Subtitle length
  //    is in the optimal 20–28 range") because reasons[] is order-of-emission,
  //    not order-of-polarity. We surface `negativeReasons[0]` so the
  //    recommendation never contradicts its own rationale. When the score
  //    is below 60 but every reason is positive, the right move is to leave
  //    the subtitle alone, not to rewrite it.
  const subtitleSub = input.scoring.metadata.subtitle;
  if (
    subtitleSub.score < 60 &&
    subtitleSub.negativeReasons.length > 0 &&
    !promotions.some((p) => p.action === "add_to_subtitle")
  ) {
    items.push({
      rank: items.length + 1,
      action: "Rewrite the subtitle.",
      impact: "medium",
      effort: "low",
      rationale: subtitleSub.negativeReasons[0]!,
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

  // 3.5) Apple keyword-field dedup — when the user's submitted keywords[]
  // overlap tokens already in title/subtitle, those slots are wasted. Apple
  // indexes title + subtitle automatically, so dupes in the hidden field
  // burn budget without earning a rank position. Surface as an explicit,
  // quantified recommendation rather than fixing it silently in readyToPaste.
  const appleDedup = detectAppleKeywordDedup({
    keywords: input.context.keywords,
    title:
      input.context.appRecord?.name ?? input.context.detectedApp.name,
    subtitle: input.context.appRecord?.subtitle ?? "",
  });
  if (appleDedup.wastedChars >= 6) {
    const list = appleDedup.dupes.map((d) => `"${d}"`).join(", ");
    items.push({
      rank: items.length + 1,
      action: `Apple keyword dedup — drop ${list} from the keywords field.`,
      impact: "low",
      effort: "low",
      rationale: `Apple indexes your title and subtitle automatically, so repeating ${list} in the 100-char keywords field wastes ${appleDedup.wastedChars} characters. Reclaim those slots for terms only reachable via the hidden field.`,
    });
  }

  // 4) Competitor copy lessons. (Brand-token filter in scoring/competitors.ts
  // already strips a competitor's own brand-name tokens from
  // uniqueToCompetitor, so this no longer recommends a user copy "stars"
  // when their competitor is "Pickleball Stars".)
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

// Pool of keywords we can splice into the listing. Sorted descending by
// `weight` so callers iterate in best-first order.
interface OpportunityKeyword {
  keyword: string;
  origin: "user-keyword" | "competitor-unique";
  weight: number;
  rankBucket?: string;
  // Pre-computed coverage flags against the user's current listing — only
  // populated for user-keyword origin (where `KeywordDiagnosis` already
  // tracked these); competitor-unique terms compute substring coverage
  // ad-hoc at the splice site.
  coverageInTitle: boolean;
  coverageInSubtitle: boolean;
}

function collectOpportunityKeywords(
  input: SynthesisInput,
): OpportunityKeyword[] {
  const out: OpportunityKeyword[] = [];
  const seen = new Set<string>();

  for (const k of input.scoring.keywords) {
    const key = k.keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      keyword: k.keyword,
      origin: "user-keyword",
      weight: k.intentScore,
      rankBucket: k.rankBucket,
      coverageInTitle: k.coverageInTitle,
      coverageInSubtitle: k.coverageInSubtitle,
    });
  }

  // Competitor-unique terms anchor at 0.5 — below most user keywords but
  // above truly dead-weight terms. Real intent for these would require
  // a separate scoring pass, which we defer until plumbing is justified.
  for (const c of input.scoring.competitors) {
    for (const term of c.uniqueToCompetitor) {
      const key = term.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        keyword: term,
        origin: "competitor-unique",
        weight: 0.5,
        coverageInTitle: false,
        coverageInSubtitle: false,
      });
    }
  }

  return out.sort((a, b) => b.weight - a.weight);
}

// Apple's keyword indexer tokenizes on whitespace + punctuation and matches
// case-insensitively. Substring is a reasonable proxy for "covered" in
// short fields where exact-phrase placement matters more than precision.
function fieldContainsKeyword(text: string, keyword: string): boolean {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

// Brand prefix candidates to try (longest first) when splicing a keyword
// into the title. `"Tally: Everything Pickleball"` yields `["Tally"]`. A
// no-delimiter multi-word name like `"Pawprint Habits"` yields
// `["Pawprint Habits", "Pawprint"]` so the rewriter can fall back to the
// first word when the full name is too long to fit any opportunity keyword.
function brandCandidates(appName: string): string[] {
  const trimmed = appName.trim();
  const split = trimmed.split(/[:\-–—|]/);
  if (split.length > 1) {
    const head = split[0]?.trim() ?? trimmed;
    return [head.length > 0 ? head : trimmed];
  }
  const firstWord = trimmed.split(/\s+/)[0] ?? trimmed;
  return firstWord === trimmed ? [trimmed] : [trimmed, firstWord];
}

function buildTitleField(args: {
  currentTitle: string;
  appName: string;
  opportunities: OpportunityKeyword[];
}): ReadyToPasteField {
  const cap = APPLE_CAPS.title;
  const { currentTitle, appName, opportunities } = args;
  const brands = brandCandidates(appName);

  // Iterate opportunities in priority order (intent desc). For each, try
  // brand candidates longest-first so we don't shorten the brand more than
  // necessary. Return the first (opportunity, brand) combo that fits the cap.
  for (const o of opportunities) {
    if (o.coverageInTitle) continue;
    if (fieldContainsKeyword(currentTitle, o.keyword)) continue;

    for (const brand of brands) {
      const recommended = `${brand} — ${capitalize(o.keyword)}`;
      if (recommended.length > cap) continue;
      if (recommended.toLowerCase() === currentTitle.toLowerCase()) continue;

      const reason =
        o.origin === "user-keyword" && o.rankBucket
          ? `Promotes "${o.keyword}" (rank ${o.rankBucket}) into the title — Apple's heaviest-weighted indexed field.`
          : `Promotes "${o.keyword}" (competitor coverage you don't carry) into the title.`;

      return makeField({
        current: currentTitle,
        recommended,
        changeReason: reason,
        charLimit: cap,
      });
    }
  }

  return makeField({
    current: currentTitle,
    recommended: null,
    changeReason: null,
    charLimit: cap,
  });
}

function buildSubtitleField(args: {
  currentSubtitle: string;
  opportunities: OpportunityKeyword[];
  primaryCategory: string | undefined;
  consumedKeyword: string | null;
}): ReadyToPasteField {
  const cap = APPLE_CAPS.subtitle;
  const { currentSubtitle, opportunities, primaryCategory, consumedKeyword } =
    args;
  const consumed = consumedKeyword?.toLowerCase() ?? "";
  const suffix = suffixForCategory(primaryCategory);

  const candidate = opportunities.find((o) => {
    if (consumed && o.keyword.toLowerCase() === consumed) return false;
    if (o.coverageInSubtitle) return false;
    if (fieldContainsKeyword(currentSubtitle, o.keyword)) return false;
    const text = `${capitalize(o.keyword)} · ${suffix}`;
    return text.length <= cap;
  });

  if (!candidate) {
    return makeField({
      current: currentSubtitle,
      recommended: null,
      changeReason: null,
      charLimit: cap,
    });
  }

  const recommended = `${capitalize(candidate.keyword)} · ${suffix}`;
  if (recommended.toLowerCase() === currentSubtitle.toLowerCase()) {
    return makeField({
      current: currentSubtitle,
      recommended: null,
      changeReason: null,
      charLimit: cap,
    });
  }

  const reason =
    candidate.origin === "user-keyword" && candidate.rankBucket
      ? `Promotes "${candidate.keyword}" (rank ${candidate.rankBucket}) into the subtitle, paired with a category cue.`
      : `Adds "${candidate.keyword}" (competitor coverage) to the subtitle, paired with a category cue.`;

  return makeField({
    current: currentSubtitle,
    recommended,
    changeReason: reason,
    charLimit: cap,
  });
}

function buildKeywordsFieldField(args: {
  userKeywords: readonly string[];
  opportunities: OpportunityKeyword[];
  titleText: string;
  subtitleText: string;
}): ReadyToPasteField {
  const cap = APPLE_CAPS.keywordsField;
  const { userKeywords, opportunities, titleText, subtitleText } = args;
  const current = joinKeywords(userKeywords, cap);

  // Recommended set: user keywords + competitor-unique terms not already in
  // title/subtitle. Apple counts visible-field tokens, so we strip those out.
  const visibleTokens = tokenize(`${titleText} ${subtitleText}`);
  const recommendedSet = new Set<string>();
  for (const k of userKeywords) {
    const norm = k.toLowerCase().trim();
    if (norm.length === 0) continue;
    if (visibleTokens.has(norm)) continue;
    recommendedSet.add(norm);
  }
  for (const o of opportunities) {
    if (o.origin !== "competitor-unique") continue;
    const norm = o.keyword.toLowerCase().trim();
    if (norm.length === 0) continue;
    if (visibleTokens.has(norm)) continue;
    recommendedSet.add(norm);
  }
  const recommended = joinKeywords(Array.from(recommendedSet), cap);

  if (recommended === current || recommended.length === 0) {
    return makeField({
      current,
      recommended: null,
      changeReason: null,
      charLimit: cap,
    });
  }

  const added = Array.from(recommendedSet).filter(
    (k) =>
      !userKeywords.some((u) => u.toLowerCase().trim() === k),
  );
  const reason = added.length > 0
    ? `Adds competitor-coverage terms (${added.slice(0, 3).join(", ")}) and drops tokens already in title/subtitle.`
    : `Drops tokens already covered by title/subtitle so each slot earns a new rank.`;

  return makeField({
    current,
    recommended,
    changeReason: reason,
    charLimit: cap,
  });
}

function buildShortDescriptionField(args: {
  appName: string;
  opportunities: OpportunityKeyword[];
  primaryCategory: string | undefined;
}): ReadyToPasteField {
  const cap = SHORT_DESCRIPTION_CAP;
  const { appName, opportunities, primaryCategory } = args;
  const top = opportunities.slice(0, 2).map((o) => o.keyword.toLowerCase());

  if (top.length === 0) {
    return makeField({
      current: "",
      recommended: null,
      changeReason: null,
      charLimit: cap,
    });
  }

  const benefit = benefitForCategory(primaryCategory);
  const headline =
    top.length === 2
      ? `${appName}: ${top[0]} and ${top[1]} for ${benefit}.`
      : `${appName}: ${top[0]} for ${benefit}.`;
  const recommended = truncate(headline, cap);

  const reason = `Leads with your top-intent keyword${top.length === 2 ? "s" : ""} (${top.join(", ")}) instead of generic copy.`;

  return makeField({
    current: "",
    recommended,
    changeReason: reason,
    charLimit: cap,
  });
}

function buildReadyToPaste(input: SynthesisInput): ReadyToPaste {
  const opportunities = collectOpportunityKeywords(input);
  const currentTitle =
    input.context.appRecord?.name ?? input.context.detectedApp.name;
  const currentSubtitle = input.context.appRecord?.subtitle ?? "";

  const title = buildTitleField({
    currentTitle,
    appName: input.context.detectedApp.name,
    opportunities,
  });

  // Pass the keyword that title consumed so subtitle picks a different one.
  const titleConsumed = extractKeywordFromTitle(title.recommended);

  const subtitle = buildSubtitleField({
    currentSubtitle,
    opportunities,
    primaryCategory: input.context.appRecord?.primaryCategory,
    consumedKeyword: titleConsumed,
  });

  const keywordsField = buildKeywordsFieldField({
    userKeywords: input.context.keywords,
    opportunities,
    titleText: title.recommended ?? currentTitle,
    subtitleText: subtitle.recommended ?? currentSubtitle,
  });

  const shortDescription = buildShortDescriptionField({
    appName: input.context.detectedApp.name,
    opportunities,
    primaryCategory: input.context.appRecord?.primaryCategory,
  });

  return {
    title,
    subtitle,
    keywordsField,
    shortDescription,
    source: "deterministic",
  };
}

function makeField(args: {
  current: string;
  recommended: string | null;
  changeReason: string | null;
  charLimit: number;
}): ReadyToPasteField {
  const text = args.recommended ?? args.current;
  return {
    current: args.current,
    recommended: args.recommended,
    changeReason: args.changeReason,
    charCount: text.length,
    charLimit: args.charLimit,
  };
}

// Identify single-token user keywords already present in the title or
// subtitle. Multi-token user keywords (like "habit tracker") are ignored
// here — they're handled by the field-level dedup logic in
// buildKeywordsFieldField. Wasted chars approximates how much of the
// 100-char comma-joined keywords budget the developer reclaims after the
// fix: sum of token lengths plus one comma per token (minus one because
// the keywords field has N-1 separators for N tokens).
function detectAppleKeywordDedup(args: {
  keywords: readonly string[];
  title: string;
  subtitle: string;
}): { dupes: string[]; wastedChars: number } {
  const visible = tokenize(`${args.title} ${args.subtitle}`);
  const dupes: string[] = [];
  for (const raw of args.keywords) {
    const k = raw.toLowerCase().trim();
    if (k.length === 0) continue;
    if (k.includes(" ")) continue;
    if (!visible.has(k)) continue;
    if (dupes.includes(k)) continue;
    dupes.push(k);
  }
  if (dupes.length === 0) return { dupes, wastedChars: 0 };
  const totalTokenChars = dupes.reduce((acc, k) => acc + k.length, 0);
  const wastedChars = totalTokenChars + dupes.length - 1;
  return { dupes, wastedChars };
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 0),
  );
}

function joinKeywords(keywords: readonly string[], cap: number): string {
  const joined = keywords
    .map((k) => k.toLowerCase().trim())
    .filter((k) => k.length > 0)
    .join(",");
  return truncate(joined, cap);
}

function buildKeywordsField(keywords: readonly string[]): string {
  return joinKeywords(keywords, APPLE_CAPS.keywordsField);
}

// Recover the keyword the deterministic title-rewriter spliced in (the
// portion after the brand prefix). Returns null when title is unchanged
// or doesn't follow the "<brand> — <keyword>" shape.
function extractKeywordFromTitle(recommended: string | null): string | null {
  if (recommended === null) return null;
  const match = /[—\-–]\s+(.+)$/.exec(recommended);
  return match?.[1]?.trim() ?? null;
}

function benefitForCategory(category: string | undefined): string {
  if (!category) return "indie builders";
  switch (category.toLowerCase()) {
    case "productivity":
      return "people who track what matters";
    case "education":
      return "daily learners";
    case "health & fitness":
      return "anyone building healthier habits";
    case "lifestyle":
      return "daily rituals that stick";
    case "sports":
      return "players, leagues, and clubs";
    case "games":
      return "fans who want to win more";
    default:
      return "indie builders";
  }
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
