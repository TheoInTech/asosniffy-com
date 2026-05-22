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
  type DescriptionDensityRow,
  type KeywordDiagnosis,
  type MetadataScoringResult,
  type ScoredCandidate,
} from "../scoring/index.js";
import {
  buildCompetitorNotes,
  effortForAction,
  impactForAction,
} from "./deterministic-prose.js";

// Legacy `shortDescription` slot — 240 chars, doesn't map to either real
// platform field but kept for back-compat with existing SDK / CLI / MCP
// consumers. Tier 2 (Phase F) introduces the two real fields below.
export const SHORT_DESCRIPTION_CAP = 240;

// Apple App Store promotional text. 170 chars, sits above the description
// on iOS, refreshable without a new App Review submission. Per the 2026
// ASO references this is one of the top-3 metadata levers founders have
// (right after title + subtitle).
export const PROMOTIONAL_TEXT_CAP = 170;

// Google Play short description. 80 chars, indexed by Play search. The
// canonical Android counterpart to iOS promotional text — different rules,
// distinct value.
export const ANDROID_SHORT_DESCRIPTION_CAP = 80;

// Phase 0 — Net-value guard stoplist. Generic verbs / connectives that count
// as rank-neutral when comparing current vs recommended copy. A token in this
// set only counts as rank-meaningful when the user has explicitly listed it in
// their keywords[] (user opt-in via NetValueContext.userKeywordSet). Without
// that opt-in, dropping such a token from the listing carries zero rank cost,
// so it shouldn't tip the net-value comparison.
const RANK_NEUTRAL_TOKENS: ReadonlySet<string> = new Set([
  "app", "free", "pro", "premium", "lite", "best", "top", "new", "my",
  "get", "your", "our", "all", "play", "use",
  "the", "and", "or", "of", "for", "in", "on", "to", "with", "by", "at",
  "is", "as",
]);

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
  // Phase 9 — relevance-gate scored candidate pool. When populated, the
  // template uses it to filter off-topic competitor terms before they
  // reach readyToPaste.keywordsField / subtitle. When omitted/empty
  // (legacy callers, older tests), the previous unfiltered behavior holds.
  // The orchestrator always populates this on production paid /diagnose.
  scoredCandidates?: readonly ScoredCandidate[];
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
      // Phase F: sample/disclaimer paths get null for the two new fields —
      // we don't fabricate promo text or short-desc copy over fixture data.
      promotionalText: null,
      androidShortDescription: null,
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

// Phase H — "Lift mentions of X in description" recommendation card.
// Fires once per diagnose run with the worst-under-density user keyword
// (count vs target). Capped at one card to avoid drowning out other
// recommendations; the descriptionDensity[] sibling on the public
// MetadataScore still surfaces every keyword for UI consumption. Returns
// null when no keyword is under-target or when description is too short
// to compute a meaningful target.
export function buildDescriptionDensityRecommendation(
  density: readonly DescriptionDensityRow[],
  userKeywords: readonly string[],
  nextRank: number,
): RecommendationItem | null {
  if (density.length === 0) return null;
  const userKeywordSet = new Set(
    userKeywords.map((k) => k.toLowerCase().trim()).filter(Boolean),
  );

  const underKeywords = density
    .filter((d) => d.polarity === "under")
    .filter((d) => userKeywordSet.has(d.keyword))
    // Prioritize highest target/count gap, then alphabetical for stability.
    .sort((a, b) => {
      const gapA = a.target - a.count;
      const gapB = b.target - b.count;
      if (gapA !== gapB) return gapB - gapA;
      return a.keyword.localeCompare(b.keyword);
    });

  if (underKeywords.length === 0) return null;
  const worst = underKeywords[0]!;
  const fromTo =
    worst.count === 0
      ? `from 0 to ${worst.target}`
      : `from ${worst.count} to ${worst.target}`;

  return {
    rank: nextRank,
    action: `Lift mentions of "${worst.keyword}" in description ${fromTo}.`,
    impact: "low",
    effort: "low",
    rationale:
      worst.count === 0
        ? `The description doesn't mention "${worst.keyword}" at all. At the 2026 target of 1 exact-phrase mention per 250 chars, your description warrants ${worst.target}. On Android the description is indexed for search; on iOS it's scanned by humans for "on-topic" confidence — both reward correct density.`
        : `Description currently mentions "${worst.keyword}" ${worst.count}× (1 per ${worst.charsPerMention} chars). The 2026 target is 1 per 250 chars, so lift to ${worst.target}× to match the indexed-density sweet spot.`,
  };
}

// Pool of keywords we can splice into the listing. Sorted descending by
// `weight` so callers iterate in best-first order.
interface OpportunityKeyword {
  // Lowercased canonical form used for matching + dedup.
  keyword: string;
  // Original input casing — passed to displayCasing() at splice points so
  // DUPR-style acronyms aren't flattened to "Dupr".
  originalKeyword: string;
  origin: "user-keyword" | "competitor-unique";
  weight: number;
  rankBucket?: string;
  // Pre-computed coverage flags against the user's current listing — only
  // populated for user-keyword origin (where `KeywordDiagnosis` already
  // tracked these); competitor-unique terms compute substring coverage
  // ad-hoc at the splice site.
  coverageInTitle: boolean;
  coverageInSubtitle: boolean;
  // Lifecycle gate — true when the source keyword is `not_found` on an
  // app that's still seeding. Title / subtitle / promo-text / android
  // short-desc pickers skip ineligible opportunities; keywords-field
  // picker still considers them (low-risk slot, high-reward if it ranks).
  // Without this flag, the readyToPaste layer promotes speculative
  // not_found keywords to the most valuable real estate on the listing.
  ineligibleForVisiblePromotion: boolean;
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
    const ineligible =
      k.isAppSeeding === true && k.rankBucket === "not_found";
    out.push({
      keyword: key,
      originalKeyword: k.keyword,
      origin: "user-keyword",
      weight: k.intentScore,
      rankBucket: k.rankBucket,
      coverageInTitle: k.coverageInTitle,
      coverageInSubtitle: k.coverageInSubtitle,
      ineligibleForVisiblePromotion: ineligible,
    });
  }

  // Phase 9 — Relevance gate filter. When the orchestrator has scored the
  // competitor-keyword candidates, drop anything labeled off-topic before
  // it can land in subtitle / keywords-field. Without this, an off-
  // category competitor's terms ("tournament_bracket" surfacing through a
  // Productivity competitor for a Sports app) would bleed straight into
  // readyToPaste.keywordsField.recommended. Legacy callers (older tests
  // that don't populate scoredCandidates) keep the previous behavior so
  // existing tests don't break — only the orchestrator path is gated.
  const offTopicByKeyword = new Set<string>();
  const adjacentByKeyword = new Set<string>();
  if (input.scoredCandidates && input.scoredCandidates.length > 0) {
    for (const c of input.scoredCandidates) {
      if (c.origin !== "competitor") continue;
      if (c.relevanceLabel === "off-topic") {
        offTopicByKeyword.add(c.keyword.toLowerCase());
      } else if (c.relevanceLabel === "adjacent") {
        adjacentByKeyword.add(c.keyword.toLowerCase());
      }
    }
  }

  // Competitor-unique terms anchor at 0.5 (on-topic) or 0.4 (adjacent) —
  // below most user keywords but above truly dead-weight terms. The
  // off-topic label drops the term entirely.
  for (const c of input.scoring.competitors) {
    for (const term of c.uniqueToCompetitor) {
      const key = term.toLowerCase();
      if (seen.has(key)) continue;
      if (offTopicByKeyword.has(key)) continue;
      seen.add(key);
      const weight = adjacentByKeyword.has(key) ? 0.4 : 0.5;
      out.push({
        keyword: key,
        originalKeyword: term,
        origin: "competitor-unique",
        weight,
        coverageInTitle: false,
        coverageInSubtitle: false,
        // Competitor-unique terms have no Sniffy rank data for the target
        // app — promote them only via subtitle (lower-risk visible slot)
        // and keywords-field. Excluding from title promotion is handled
        // case-by-case in buildTitleField.
        ineligibleForVisiblePromotion: false,
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
    // Lifecycle gate (Phase E1): a `not_found` keyword on a seeding listing
    // is "still seeding," not "high intent." The keyword-diagnosis layer
    // refuses to declare it dead, and the readyToPaste layer must refuse
    // to promote it to the most valuable real estate on the listing.
    // Without this skip the cascade goes: bad title → cascading bad
    // subtitle → cascading bad keywords-field strip.
    if (o.ineligibleForVisiblePromotion) continue;
    // Competitor-unique terms never go in the title — that's the
    // "Tally — Stars" anti-pattern. Tier 1 stripped brand tokens, but
    // even legitimate generic competitor coverage (e.g., "social",
    // "nearby") doesn't belong above the user's own brand-keyword combo.
    if (o.origin === "competitor-unique") continue;
    if (o.coverageInTitle) continue;
    if (fieldContainsKeyword(currentTitle, o.keyword)) continue;

    for (const brand of brands) {
      const recommended = `${brand} — ${displayCasing(o.keyword, o.originalKeyword)}`;
      if (recommended.length > cap) continue;
      if (recommended.toLowerCase() === currentTitle.toLowerCase()) continue;

      const reason = o.rankBucket
        ? `Promotes "${o.originalKeyword}" (rank ${o.rankBucket}) into the title — Apple's heaviest-weighted indexed field.`
        : `Promotes "${o.originalKeyword}" into the title — Apple's heaviest-weighted indexed field.`;

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
  // Phase E2 — the title text the subtitle picker must dedup against.
  // Pass `title.recommended ?? currentTitle` so a keyword that ended up in
  // the rewritten title doesn't ALSO get spliced into the subtitle.
  // Apple's keyword indexer treats a token in title + subtitle as one rank
  // signal, not two — duplicating wastes the subtitle's 30-char budget.
  recommendedOrCurrentTitle: string;
}): ReadyToPasteField {
  const cap = APPLE_CAPS.subtitle;
  const {
    currentSubtitle,
    opportunities,
    primaryCategory,
    consumedKeyword,
    recommendedOrCurrentTitle,
  } = args;
  const consumed = consumedKeyword?.toLowerCase() ?? "";
  // Phase E4 — suffix may be null when the category has no vetted cue.
  // We then emit subtitle as just the keyword (with brand cue) if that
  // alone is meaningful; otherwise return null. No "Daily Practice" fluff.
  const suffix = suffixForCategory(primaryCategory);

  const candidate = opportunities.find((o) => {
    if (consumed && o.keyword === consumed) return false;
    // Phase E1 — same lifecycle gate as title.
    if (o.ineligibleForVisiblePromotion) return false;
    // Phase E2 — never duplicate a keyword already in the title.
    if (o.coverageInTitle) return false;
    if (fieldContainsKeyword(recommendedOrCurrentTitle, o.keyword)) return false;
    if (o.coverageInSubtitle) return false;
    if (fieldContainsKeyword(currentSubtitle, o.keyword)) return false;
    const display = displayCasing(o.keyword, o.originalKeyword);
    const text = suffix ? `${display} · ${suffix}` : display;
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

  const display = displayCasing(candidate.keyword, candidate.originalKeyword);
  const recommended = suffix ? `${display} · ${suffix}` : display;
  if (recommended.toLowerCase() === currentSubtitle.toLowerCase()) {
    return makeField({
      current: currentSubtitle,
      recommended: null,
      changeReason: null,
      charLimit: cap,
    });
  }

  const cueClause = suffix ? ", paired with a category cue" : "";
  const reason =
    candidate.origin === "user-keyword" && candidate.rankBucket
      ? `Promotes "${candidate.originalKeyword}" (rank ${candidate.rankBucket}) into the subtitle${cueClause}.`
      : `Adds "${candidate.originalKeyword}" (competitor coverage) to the subtitle${cueClause}.`;

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
  // Phase E5 — strip against the CURRENT visible-field text, not the
  // recommended rewrites. Two reasons: (a) the keywords-field advice has
  // to stand on its own (a user who keeps the current title/subtitle and
  // only adopts this recommendation should still get a coherent listing);
  // (b) the Apple-dedup recommendation card surfaces title/subtitle dupes
  // separately, so we don't need to encode the "if you accept the title
  // rewrite, also drop these" coupling here.
  currentTitleText: string;
  currentSubtitleText: string;
}): ReadyToPasteField {
  const cap = APPLE_CAPS.keywordsField;
  const { userKeywords, opportunities, currentTitleText, currentSubtitleText } =
    args;
  const current = joinKeywords(userKeywords, cap);

  // Recommended set: user keywords + competitor-unique terms not already in
  // title/subtitle. Apple counts visible-field tokens, so we strip those out.
  const visibleTokens = tokenize(`${currentTitleText} ${currentSubtitleText}`);
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
  currentTitle: string;
  opportunities: OpportunityKeyword[];
  primaryCategory: string | undefined;
}): ReadyToPasteField {
  const cap = SHORT_DESCRIPTION_CAP;
  const { appName, currentTitle, opportunities, primaryCategory } = args;
  // Phase E1 — only visible-eligible opportunities (skip seeding+not_found).
  const eligible = opportunities.filter((o) => !o.ineligibleForVisiblePromotion);
  const top = eligible.slice(0, 2);

  if (top.length === 0) {
    return makeField({
      current: "",
      recommended: null,
      changeReason: null,
      charLimit: cap,
    });
  }

  // Phase E6 — when appName is a prefix of (or substring of) the current
  // title, leading with the appName echoes the title and wastes chars.
  // Collapse to bare keyword copy in that case.
  const titleLower = currentTitle.toLowerCase();
  const appLower = appName.toLowerCase();
  const echoesTitle =
    titleLower.includes(appLower) && titleLower !== appLower;

  // Phase E3 — preserve brand casing on each keyword.
  const displayTops = top.map((o) => displayCasing(o.keyword, o.originalKeyword));
  const tokensJoined =
    displayTops.length === 2
      ? `${displayTops[0]} and ${displayTops[1]}`
      : displayTops[0]!;

  // Phase E4 — emit the "for X" tail only when the category has a vetted
  // benefit. No generic "for indie builders" filler.
  const benefit = benefitForCategory(primaryCategory);
  const headlineBody = benefit ? `${tokensJoined} for ${benefit}.` : `${tokensJoined}.`;
  const headline = echoesTitle ? headlineBody : `${appName}: ${headlineBody}`;
  const recommended = truncate(headline, cap);

  if (recommended.length === 0) {
    return makeField({
      current: "",
      recommended: null,
      changeReason: null,
      charLimit: cap,
    });
  }

  const reason = `Leads with your top-intent keyword${top.length === 2 ? "s" : ""} (${top.map((o) => o.originalKeyword).join(", ")}) instead of generic copy.`;

  return makeField({
    current: "",
    recommended,
    changeReason: reason,
    charLimit: cap,
  });
}

// Phase F — Apple App Store promotional text. 170 chars, sits above the
// description on iOS, refreshable without a new App Review submission.
// Per 2026 ASO references this is one of the top-3 metadata levers a
// founder has after title + subtitle. We can't observe the user's current
// promo text (iTunes API doesn't expose it), so this is a write-only slot:
// `current` is always empty; the value is the paste-able recommendation.
function buildPromotionalTextField(args: {
  appName: string;
  currentTitle: string;
  opportunities: OpportunityKeyword[];
  primaryCategory: string | undefined;
}): ReadyToPasteField {
  const cap = PROMOTIONAL_TEXT_CAP;
  const { appName, currentTitle, opportunities, primaryCategory } = args;
  const eligible = opportunities.filter((o) => !o.ineligibleForVisiblePromotion);
  const top = eligible.slice(0, 2);
  if (top.length === 0) {
    return makeField({
      current: "",
      recommended: null,
      changeReason: null,
      charLimit: cap,
    });
  }

  const displayTops = top.map((o) => displayCasing(o.keyword, o.originalKeyword));
  const tokensJoined =
    displayTops.length === 2
      ? `${displayTops[0]} and ${displayTops[1]}`
      : displayTops[0]!;

  // Promo text is 170 chars — more room than short description. We can
  // include the brand prefix (if it doesn't echo the title), the keyword
  // pair, and a meaningful tail.
  const titleLower = currentTitle.toLowerCase();
  const appLower = appName.toLowerCase();
  const echoesTitle =
    titleLower.includes(appLower) && titleLower !== appLower;
  const benefit = benefitForCategory(primaryCategory);

  // Compose three candidate forms in decreasing specificity; first one
  // that fits the cap wins. Each form is honest (no template filler).
  const candidates: string[] = [];
  if (!echoesTitle) {
    if (benefit) {
      candidates.push(`${appName} — ${tokensJoined} for ${benefit}. Updated regularly.`);
      candidates.push(`${appName} — ${tokensJoined} for ${benefit}.`);
    }
    candidates.push(`${appName} — ${tokensJoined}. Refresh anytime without re-review.`);
    candidates.push(`${appName} — ${tokensJoined}.`);
  }
  if (benefit) {
    candidates.push(`${tokensJoined} for ${benefit}. Refresh anytime without re-review.`);
    candidates.push(`${tokensJoined} for ${benefit}.`);
  }
  candidates.push(`${tokensJoined}. Refresh anytime without re-review.`);
  candidates.push(`${tokensJoined}.`);

  const recommended = candidates.find((c) => c.length <= cap) ?? null;
  if (recommended === null) {
    return makeField({
      current: "",
      recommended: null,
      changeReason: null,
      charLimit: cap,
    });
  }

  const reason = `iOS promotional text indexes at 170 chars and refreshes without App Review — leads with "${top.map((o) => o.originalKeyword).join('", "')}" so the timely-update slot still pulls rank weight.`;

  return makeField({
    current: "",
    recommended,
    changeReason: reason,
    charLimit: cap,
  });
}

// Phase F — Google Play short description. 80 chars, indexed for Play
// search. The Android counterpart to iOS promotional text — different
// platform, different rules. Density matters more here than narrative
// since Play actually scans this field for keyword matches.
function buildAndroidShortDescriptionField(args: {
  opportunities: OpportunityKeyword[];
}): ReadyToPasteField {
  const cap = ANDROID_SHORT_DESCRIPTION_CAP;
  const { opportunities } = args;
  const eligible = opportunities.filter((o) => !o.ineligibleForVisiblePromotion);
  const top = eligible.slice(0, 3);
  if (top.length === 0) {
    return makeField({
      current: "",
      recommended: null,
      changeReason: null,
      charLimit: cap,
    });
  }

  // Try compositions from richest to leanest until one fits the 80-char cap.
  const displayTops = top.map((o) => displayCasing(o.keyword, o.originalKeyword));
  const candidates: string[] = [];
  if (displayTops.length >= 3) {
    candidates.push(`${displayTops[0]}, ${displayTops[1]}, ${displayTops[2]}.`);
    candidates.push(`${displayTops[0]} · ${displayTops[1]} · ${displayTops[2]}`);
  }
  if (displayTops.length >= 2) {
    candidates.push(`${displayTops[0]} and ${displayTops[1]}.`);
    candidates.push(`${displayTops[0]} · ${displayTops[1]}`);
  }
  candidates.push(`${displayTops[0]}.`);

  const recommended = candidates.find((c) => c.length <= cap) ?? null;
  if (recommended === null) {
    return makeField({
      current: "",
      recommended: null,
      changeReason: null,
      charLimit: cap,
    });
  }

  const reason = `Play indexes the 80-char short description directly — denser keyword inclusion here outranks long-description density per token.`;

  return makeField({
    current: "",
    recommended,
    changeReason: reason,
    charLimit: cap,
  });
}

// Phase 0 — Net-value guard. Wraps each readyToPaste field after generation
// (deterministic OR AI path) and refuses any rewrite that strips more
// rank-meaningful tokens than it adds. Concrete failure mode this prevents:
// engine recommends `subtitle: "PLAY"` to replace `"Scoring, drills & overlays"`
// because the only opportunity in the pool was a generic competitor-unique
// verb. Three indexed tokens (scoring, drills, overlays) destroyed to gain
// one generic verb that won't drive installs. The guard catches that class
// of regression once, for both the deterministic path and the AI path.
//
// A token in a field's text is rank-meaningful if any of:
//   1. It appears in input.context.keywords[]                 (user opt-in)
//   2. It appears in the relevance-gated competitor pool      (on-topic / adjacent)
//   3. length >= 4 AND not in RANK_NEUTRAL_TOKENS              (presumed valuable)
//
// Rule (1) protects intentional generic-keyword users — a developer who
// genuinely wants to chase "play" puts it in their keywords[] and the guard
// credits the token. Rule (3) catches incumbent copy tokens the user never
// enumerated but that are still doing indexing work.
// `coveragePolicy` describes whether a field stands alone for indexing or
// shares its keyword pool with the listing's visible surface:
//   • "isolated"            — title, subtitle, promo text, short desc.
//                             A token in this field's current value carries
//                             rank weight ONLY in this slot.
//   • "shared-with-visible" — keywords field. Apple counts title + subtitle
//                             + keywords-field as one rank pool, so a token
//                             dropped from keywords-field that's still in
//                             title or subtitle isn't actually lost. The
//                             guard treats those as still-indexed.
export type CoveragePolicy = "isolated" | "shared-with-visible";

export interface NetValueContext {
  userKeywordSet: ReadonlySet<string>;
  relevantCompetitorSet: ReadonlySet<string>;
  // Tokens from the current title + subtitle (the visible indexed surface).
  // The keywords-field guard subtracts these so that Apple-dedup-correct
  // rewrites — drop a token from keywords-field that's still in title or
  // subtitle — aren't flagged as regressions.
  visibleSurfaceTokens: ReadonlySet<string>;
}

export function buildNetValueContext(input: SynthesisInput): NetValueContext {
  const userKeywordSet = new Set<string>();
  for (const k of input.context.keywords) {
    const norm = k.toLowerCase().trim();
    if (norm.length > 0) userKeywordSet.add(norm);
  }

  // Mirror collectOpportunityKeywords: when the orchestrator populates
  // scoredCandidates, drop off-topic competitor terms before they can count
  // as rank-meaningful. An off-topic term contributes nothing even if it's
  // technically present in the recommended string.
  const offTopic = new Set<string>();
  if (input.scoredCandidates && input.scoredCandidates.length > 0) {
    for (const c of input.scoredCandidates) {
      if (c.origin !== "competitor") continue;
      if (c.relevanceLabel === "off-topic") {
        offTopic.add(c.keyword.toLowerCase());
      }
    }
  }

  const relevantCompetitorSet = new Set<string>();
  for (const c of input.scoring.competitors) {
    for (const term of c.uniqueToCompetitor) {
      const norm = term.toLowerCase().trim();
      if (norm.length === 0) continue;
      if (offTopic.has(norm)) continue;
      relevantCompetitorSet.add(norm);
    }
  }

  const currentTitle =
    input.context.appRecord?.name ?? input.context.detectedApp.name ?? "";
  const currentSubtitle = input.context.appRecord?.subtitle ?? "";
  const visibleSurfaceTokens = tokenize(`${currentTitle} ${currentSubtitle}`);

  return { userKeywordSet, relevantCompetitorSet, visibleSurfaceTokens };
}

interface TokenSets {
  // Tokens of the field text that are in input.context.keywords[] — the
  // founder's explicit "this is what I want to chase" list. These get
  // their own count axis because losing a user-keyword token is strictly
  // worse than losing a generic on-topic token, even when the totals tie.
  userKeyword: Set<string>;
  // Superset including userKeyword tokens + competitor-pool tokens +
  // length>=4 non-stoplist tokens. The catch-all for "presumed valuable."
  rankMeaningful: Set<string>;
}

function classifyTokens(
  text: string,
  ctx: NetValueContext,
  policy: CoveragePolicy,
): TokenSets {
  const userKeyword = new Set<string>();
  const rankMeaningful = new Set<string>();
  for (const token of tokenize(text)) {
    // For shared-with-visible (keywords field), tokens that live in the
    // current title or subtitle are still indexed elsewhere on the listing,
    // so they don't contribute to THIS slot's net value. Skip them. Both
    // current and recommended get the same treatment, so the comparison
    // stays on equal footing.
    if (policy === "shared-with-visible" && ctx.visibleSurfaceTokens.has(token)) {
      continue;
    }
    if (ctx.userKeywordSet.has(token)) {
      userKeyword.add(token);
      rankMeaningful.add(token);
      continue;
    }
    if (ctx.relevantCompetitorSet.has(token)) {
      rankMeaningful.add(token);
      continue;
    }
    if (token.length >= 4 && !RANK_NEUTRAL_TOKENS.has(token)) {
      rankMeaningful.add(token);
    }
  }
  return { userKeyword, rankMeaningful };
}

export function applyNetValueGuard(
  field: ReadyToPasteField,
  ctx: NetValueContext,
  label: string,
  policy: CoveragePolicy = "isolated",
): ReadyToPasteField {
  if (field.recommended === null) return field;
  const cur = classifyTokens(field.current, ctx, policy);
  const rec = classifyTokens(field.recommended, ctx, policy);

  // Refuse if EITHER axis regresses:
  //   • user-keyword count drops — we're dropping a token the founder
  //     explicitly named as a priority (Tally case: "pickleball" → "play")
  //   • total rank-meaningful count drops — we're dropping general indexed
  //     value (Tally case: "Scoring, drills & overlays" → "PLAY")
  // Tie on both axes passes (re-targeting at equal value is allowed).
  const userKeywordRegression = rec.userKeyword.size < cur.userKeyword.size;
  const rankRegression = rec.rankMeaningful.size < cur.rankMeaningful.size;
  if (!userKeywordRegression && !rankRegression) return field;

  // Lost tokens for the explanation: prefer user-keyword losses (they're
  // more important to surface), then fall back to general rank losses.
  const lostUserKeywords: string[] = [];
  for (const t of cur.userKeyword) {
    if (!rec.userKeyword.has(t)) lostUserKeywords.push(t);
  }
  const lostRankMeaningful: string[] = [];
  for (const t of cur.rankMeaningful) {
    if (!rec.rankMeaningful.has(t) && !lostUserKeywords.includes(t)) {
      lostRankMeaningful.push(t);
    }
  }
  const lost = [...lostUserKeywords, ...lostRankMeaningful];
  const lostQuoted = lost
    .slice(0, 3)
    .map((t) => `"${t}"`)
    .join(", ");
  const more = lost.length > 3 ? ` and ${lost.length - 3} more` : "";
  const reason = `Current ${label} indexes ${lostQuoted}${more} — replacing it with "${field.recommended}" would drop those without a net token gain.`;
  return {
    current: field.current,
    recommended: null,
    changeReason: reason,
    charCount: field.current.length,
    charLimit: field.charLimit,
  };
}

function buildReadyToPaste(input: SynthesisInput): ReadyToPaste {
  const opportunities = collectOpportunityKeywords(input);
  const currentTitle =
    input.context.appRecord?.name ?? input.context.detectedApp.name;
  const currentSubtitle = input.context.appRecord?.subtitle ?? "";
  const primaryCategory = input.context.appRecord?.primaryCategory;
  const appName = input.context.detectedApp.name;

  const title = buildTitleField({
    currentTitle,
    appName,
    opportunities,
  });

  // Pass the keyword that title consumed so subtitle picks a different one.
  const titleConsumed = extractKeywordFromTitle(title.recommended);

  const subtitle = buildSubtitleField({
    currentSubtitle,
    opportunities,
    primaryCategory,
    consumedKeyword: titleConsumed,
    // Phase E2 — dedup subtitle against the recommended-or-current title
    // so we never duplicate a keyword across both visible fields.
    recommendedOrCurrentTitle: title.recommended ?? currentTitle,
  });

  // Phase E5 — keywords-field strips against CURRENT title/subtitle, not
  // recommended. The Apple-dedup recommendation card already addresses
  // the "if you accept the title rewrite, also drop these" coupling.
  const keywordsField = buildKeywordsFieldField({
    userKeywords: input.context.keywords,
    opportunities,
    currentTitleText: currentTitle,
    currentSubtitleText: currentSubtitle,
  });

  const shortDescription = buildShortDescriptionField({
    appName,
    currentTitle,
    opportunities,
    primaryCategory,
  });

  // Phase F — two new platform-correct fields.
  const promotionalText = buildPromotionalTextField({
    appName,
    currentTitle,
    opportunities,
    primaryCategory,
  });
  const androidShortDescription = buildAndroidShortDescriptionField({
    opportunities,
  });

  // Phase 0 — Net-value guard. Refuses any rewrite that strips more
  // rank-meaningful tokens than it adds. The deterministic path and the AI
  // path (see mergeAiReadyToPaste in openai.ts) both run through this guard
  // so the paid /diagnose never ships a regressive recommendation.
  const netValueCtx = buildNetValueContext(input);
  return {
    title: applyNetValueGuard(title, netValueCtx, "title"),
    subtitle: applyNetValueGuard(subtitle, netValueCtx, "subtitle"),
    keywordsField: applyNetValueGuard(
      keywordsField,
      netValueCtx,
      "keywords field",
      "shared-with-visible",
    ),
    shortDescription: applyNetValueGuard(
      shortDescription,
      netValueCtx,
      "short description",
    ),
    promotionalText: applyNetValueGuard(
      promotionalText,
      netValueCtx,
      "promotional text",
    ),
    androidShortDescription: applyNetValueGuard(
      androidShortDescription,
      netValueCtx,
      "Play short description",
    ),
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

// Returns a meaningful "for X" benefit phrase only when the category has a
// vetted, specific audience description. Returns null for everything else
// so callers can skip the "for X" suffix rather than ship template filler
// ("indie builders", "players, leagues, and clubs" — generic copy that
// applies to nothing in particular). Honesty over breadth.
function benefitForCategory(category: string | undefined): string | null {
  if (!category) return null;
  switch (category.toLowerCase()) {
    case "productivity":
      return "people who track what matters";
    case "education":
      return "daily learners";
    case "health & fitness":
      return "anyone building healthier habits";
    case "lifestyle":
      return "daily rituals that stick";
    default:
      return null;
  }
}

// Returns a meaningful subtitle suffix only when the category has a vetted
// short cue. Returns null otherwise so the subtitle builder skips the
// generic "Daily Practice" / "Streaks" filler rather than ship it.
function suffixForCategory(category: string | undefined): string | null {
  if (!category) return null;
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
      return null;
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

// Preserve brand casing for paste-able output. Used at every keyword splice
// point so we don't strip the DUPR-acronym down to "Dupr" when the user
// typed "dupr" but the token is structurally brand-like (4–7 chars, no
// common English suffix, unusual vowel ratio). The structural test mirrors
// the brand-likeness detector in `scoring/intent.ts:singleWordAdjustment`
// so the two layers agree on what counts as a brand.
//
// Casing rules:
//   • If the original input has uppercase letters after the first char,
//     return it verbatim ("iOS", "DUPR", "macOS" stay unchanged).
//   • Else if the lowercased token is single-word and structurally
//     brand-like, return UPPERCASE ("dupr" → "DUPR").
//   • Else fall back to Title Case via capitalize().
function displayCasing(keyword: string, originalKeyword: string): string {
  const trimmedOriginal = originalKeyword.trim();
  if (trimmedOriginal.length === 0) return keyword;
  if (/[A-Z]/.test(trimmedOriginal.slice(1))) return trimmedOriginal;

  const tokens = keyword.toLowerCase().split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length !== 1) return capitalize(keyword);

  const token = tokens[0]!;
  const len = token.length;
  if (len < 3 || len > 7) return capitalize(keyword);

  const hasCommonSuffix =
    /(ing|tion|sion|ness|ment|ity|able|ible|ful|less|ous|ish|ly|er|ed|est|ies)$/.test(
      token,
    );
  if (hasCommonSuffix) return capitalize(keyword);

  const vowels = (token.match(/[aeiou]/g) ?? []).length;
  const vowelRatio = vowels / len;
  if (vowelRatio >= 0.3 && vowelRatio <= 0.6) return capitalize(keyword);

  return token.toUpperCase();
}
