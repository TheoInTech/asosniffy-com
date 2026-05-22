import type { AppRecord } from "../providers/apple/types.js";
import { reviewKeywordFrequency } from "./review-keywords.js";

// Phase D — Review-language mining.
//
// Surfaces tokens that customers (review authors) use frequently but that
// the developer's listing doesn't cover. That's the "language gap":
// customers describe the app in their own words; closing the gap means
// the listing starts ranking for the searches those customers describe
// it with.
//
// Concrete example: a habit-tracker app's reviewers consistently call
// it a "routine builder" — but the developer's title/subtitle/keywords
// only use the word "habits". reviewLanguageTokens surfaces "routine"
// as a gap to close.
//
// Distinct from suggestedKeywords[reason="review-frequency"] (which
// reports the top-N raw review tokens for the UI to display) — this
// path is dedup-against-surface AND feeds the synthesis opportunity pool
// at weight 0.50.
//
// Cost: zero. reviewKeywordFrequency() already runs once per /diagnose
// for the suggestedKeywords path; we just filter its output.

export interface ReviewLanguageInput {
  reviewBodies: readonly string[];
  appRecord: AppRecord | null;
  userKeywords: readonly string[];
  // Brand/category tokens excluded by reviewKeywordFrequency too — pass
  // them through so the extractor's stoplist stays consistent with the
  // suggestedKeywords path. Optional; defaults to deriving from appRecord.
  brandTokens?: readonly string[];
  categoryTokens?: readonly string[];
  // Max output size. Capped at the source's topN (~30) by upstream
  // frequency calc; default 15 here keeps the synthesis pool focused on
  // the strongest-distribution gaps.
  topN?: number;
}

// Minimum review-distribution count for a token to qualify. A token in
// at least 2 distinct reviews is a real pattern, not one chatty user.
const MIN_DISTINCT_REVIEW_COUNT = 2;

export interface ReviewLanguageTokens {
  languageTokens: string[];
}

export function extractReviewLanguageTokens(
  input: ReviewLanguageInput,
): ReviewLanguageTokens {
  if (input.reviewBodies.length === 0) return { languageTokens: [] };

  // Frequency-rank the review corpus, applying the standard EN/ES/PT
  // stoplist + light lemmatization. brand + category exclusions match
  // the suggestedKeywords path.
  const brandFromAppRecord = input.appRecord
    ? deriveBrandTokens(input.appRecord)
    : [];
  const categoryFromAppRecord = input.appRecord?.primaryCategory
    ? [input.appRecord.primaryCategory]
    : [];

  const frequency = reviewKeywordFrequency({
    reviewBodies: input.reviewBodies,
    brandTokens: input.brandTokens ?? brandFromAppRecord,
    categoryTokens: input.categoryTokens ?? categoryFromAppRecord,
    topN: 50, // pull a wider band before we filter against user surface
  });

  // Build the "already covered" set — tokens the user's listing surface
  // already has, in lemmatized form so we match what reviewKeywordFrequency
  // produced. Mirror its tokenize+lemmatize logic locally (no API export
  // would mean duplicating the rules; safer to import? for now duplicate).
  const surface = collectSurfaceSet(input);

  const languageTokens: string[] = [];
  const topN = input.topN ?? 15;
  for (const entry of frequency) {
    if (entry.reviewCount < MIN_DISTINCT_REVIEW_COUNT) break; // sorted by reviewCount desc
    if (surface.has(entry.token)) continue;
    languageTokens.push(entry.token);
    if (languageTokens.length >= topN) break;
  }

  return { languageTokens };
}

// What's already on the user's listing surface? Title + subtitle + their
// submitted keywords + description tokens. We lemmatize via the same rules
// as reviewKeywordFrequency so the comparison is apples-to-apples.
function collectSurfaceSet(input: ReviewLanguageInput): Set<string> {
  const out = new Set<string>();
  const sources: string[] = [];
  if (input.appRecord) {
    if (input.appRecord.name) sources.push(input.appRecord.name);
    if (input.appRecord.subtitle) sources.push(input.appRecord.subtitle);
    if (input.appRecord.description) sources.push(input.appRecord.description);
  }
  for (const k of input.userKeywords) sources.push(k);

  for (const src of sources) {
    for (const t of tokenize(src)) {
      const lem = lemmatize(t);
      if (lem.length >= 3) out.add(lem);
    }
  }
  return out;
}

// --- Local copies of normalize / tokenize / lemmatize from review-keywords.
// Kept private to this module to avoid widening review-keywords.ts's
// exported surface. Drift risk is low — both consumers want the same
// canonical form, and the rules are tiny.

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[–—−-]/g, " ")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter((t) => t.length > 0);
}

const SUFFIX_RULES: Array<{ suffix: string; replacement: string; minLength: number }> = [
  { suffix: "ies", replacement: "y", minLength: 5 },
  { suffix: "ied", replacement: "y", minLength: 5 },
  { suffix: "ing", replacement: "", minLength: 6 },
  { suffix: "ed", replacement: "", minLength: 5 },
  { suffix: "es", replacement: "", minLength: 5 },
  { suffix: "s", replacement: "", minLength: 4 },
];

function lemmatize(token: string): string {
  for (const rule of SUFFIX_RULES) {
    if (token.length >= rule.minLength && token.endsWith(rule.suffix)) {
      return token.slice(0, token.length - rule.suffix.length) + rule.replacement;
    }
  }
  return token;
}

function deriveBrandTokens(appRecord: AppRecord): string[] {
  const tokens: string[] = [];
  if (appRecord.name) tokens.push(appRecord.name);
  if (appRecord.developer) tokens.push(appRecord.developer);
  return tokens;
}
