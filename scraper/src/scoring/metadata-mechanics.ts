// iOS metadata mechanics linter — deterministic simulator of the App Store's
// documented token rules, plus an App Review / Play-policy safety pass for
// ready-to-paste metadata output.
//
// Sources (see docs/research/2026-06-discoverability/research-apple-ranking.md
// and research-play-ranking.md for the full citations):
//   • Apple keyword-field rules — plurals are duplicates, words already in
//     name/subtitle/category are wasted, comma-separated with no spaces after
//     commas, generic terms ("app") add no value. First-party, current:
//     https://developer.apple.com/app-store/search/ (2025-2026).
//     Provenance label: "apple-documented".
//   • Token-combination mechanics — words (not phrases) from title, subtitle
//     and keyword field combine into phrase permutations within ONE locale;
//     compound title words split on capital letters; some words ("app",
//     "free") are auto-indexed for all apps. Community-tested via aso.dev
//     (https://aso.dev/metadata/cross-localization/), medium confidence —
//     Apple has never published permutation mechanics. Provenance label:
//     "community-tested" wherever a rule rests on this source alone.
//   • iOS App Review Guideline 2.3.7 (metadata accuracy; no prices in app
//     names or screenshots) and the App Store Connect 30-character name limit:
//     https://developer.apple.com/app-store/review/guidelines/
//   • Google Play metadata policy (enforced since 2021-09-29): 30-char title
//     cap; bans on performance/price/promo words ("free", "best", "#1",
//     "sale", "download now"), ALL-CAPS (non-brand), and emoji in titles.
//     Enforcement evidence (Console warnings → lost promotion eligibility →
//     suspension; title violations punished harder than description ones) per
//     the AppRadar enforcement study cited in research-play-ranking.md:
//     https://appradar.com/blog/google-play-policy-update-2021-impact-aso
//
// What this module deliberately does NOT claim:
//   • No rank predictions. `phrasePermutations` is an illustrative upper
//     bound on reachable two-word phrases, not a traffic or rank estimate.
//   • No claim that community-tested mechanics (token combination, camelCase
//     splitting, auto-indexing) are Apple-confirmed — each finding carries a
//     ruleProvenance label so consumers can tell first-party rules from lore.
//   • Nothing about screenshot-caption OCR indexing (contested; see
//     verification-verdicts.md V1) — captions are out of scope here.
//   • Review-safety flags are risk heuristics derived from published policy
//     and documented enforcement, not predictions that App Review / Play
//     review will reject a submission.
//
// Pure functions, no I/O, no clock reads. Inputs are already-fetched metadata.

export interface MetadataFieldsInput {
  title: string;
  subtitle: string | null;
  keywordsField: string | null;
}

export type MechanicsRuleProvenance = "apple-documented" | "community-tested";

export interface MechanicsFinding {
  kind:
    | "cross-field-duplicate"
    | "plural-duplicate"
    | "camelcase-hidden-split"
    | "auto-indexed-word"
    | "keyword-field-format";
  field: "title" | "subtitle" | "keywordsField";
  token: string;
  detail: string;
  charsWasted: number;
  ruleProvenance: MechanicsRuleProvenance;
}

export interface MechanicsReport {
  totalCharsWasted: number;
  findings: MechanicsFinding[];
  distinctIndexedTokens: number;
  phrasePermutations: number;
  phrasePermutationsIfFixed: number;
  notes: string[];
}

type FieldName = "title" | "subtitle" | "keywordsField";

// Most valuable first. When the same token appears in several fields, the
// duplicate occurrence in the CHEAPEST (last) field is the one to free up —
// keyword-field characters are the easiest to reclaim, title the costliest.
const FIELD_ORDER: readonly FieldName[] = ["title", "subtitle", "keywordsField"];

// Words Apple indexes for every app regardless of metadata. "app"/"apps" are
// called out as valueless generic terms in Apple's own keyword guidance;
// "free" likewise per App Store Connect guidance (and is a 2.3.7 risk in
// visible fields — see lintReviewSafety).
const AUTO_INDEXED_WORDS = new Set(["app", "apps", "free"]);

// Deterministic reclaim model for phrasePermutationsIfFixed: every 8 wasted
// characters (an assumed average 7-char keyword + 1 comma separator) can be
// replaced by one new distinct keyword. Documented assumption, not a measure.
const ASSUMED_REPLACEMENT_KEYWORD_CHARS = 7 + 1;

interface FieldTokens {
  name: FieldName;
  raw: string;
  rawTokens: string[];
  lowerTokens: string[];
  tokenSet: Set<string>;
}

export function lintMetadataMechanics(
  input: MetadataFieldsInput,
): MechanicsReport {
  const fields: FieldTokens[] = [];
  for (const name of FIELD_ORDER) {
    const raw =
      name === "title" ? input.title : name === "subtitle" ? input.subtitle : input.keywordsField;
    if (typeof raw !== "string") continue;
    const rawTokens = tokenize(raw);
    const lowerTokens = rawTokens.map((t) => t.toLowerCase());
    fields.push({
      name,
      raw,
      rawTokens,
      lowerTokens,
      tokenSet: new Set(lowerTokens),
    });
  }

  const findings: MechanicsFinding[] = [];
  const keywordsField = fields.find((f) => f.name === "keywordsField");

  // 1. auto-indexed-word (apple-documented). Checked in the keywords field
  //    only — that is where these words burn the scarce 100-char budget.
  //    Tokens in this set are excluded from the duplicate passes below so a
  //    wasted "free" is never double-counted.
  if (keywordsField) {
    for (const token of sorted(keywordsField.tokenSet)) {
      if (!AUTO_INDEXED_WORDS.has(token)) continue;
      findings.push({
        kind: "auto-indexed-word",
        field: "keywordsField",
        token,
        detail:
          `"${token}" is indexed automatically for every app per Apple's ` +
          `keyword guidance (generic terms add no value) — remove it from the keywords field.`,
        charsWasted: token.length + separatorCost(keywordsField),
        ruleProvenance: "apple-documented",
      });
    }
  }

  // 2. cross-field-duplicate (apple-documented: "don't repeat any words
  //    included in your app name, subtitle, or category").
  const crossFieldFlagged = new Set<string>();
  const allTokens = new Set<string>();
  for (const f of fields) for (const t of f.tokenSet) allTokens.add(t);
  for (const token of sorted(allTokens)) {
    if (AUTO_INDEXED_WORDS.has(token)) continue;
    const containing = fields.filter((f) => f.tokenSet.has(token));
    if (containing.length < 2) continue;
    const cheapest = containing[containing.length - 1]!;
    const keptIn = containing[0]!;
    crossFieldFlagged.add(token);
    findings.push({
      kind: "cross-field-duplicate",
      field: cheapest.name,
      token,
      detail:
        `"${token}" already appears in ${keptIn.name}; Apple documents that words ` +
        `repeated across name, subtitle, and keywords are duplicates — remove it from ${cheapest.name}.`,
      charsWasted: token.length + separatorCost(cheapest),
      ruleProvenance: "apple-documented",
    });
  }

  // 3. plural-duplicate (apple-documented: "plurals of words you've already
  //    included ... are considered duplicates"). Naive English-only stemming
  //    (trailing s / es / ies→y) — deliberately not a full stemmer, and not
  //    applied to non-English plural systems.
  const stemGroups = new Map<string, Set<string>>();
  for (const token of allTokens) {
    if (AUTO_INDEXED_WORDS.has(token)) continue;
    const stem = naivePluralStem(token);
    let group = stemGroups.get(stem);
    if (!group) {
      group = new Set();
      stemGroups.set(stem, group);
    }
    group.add(token);
  }
  for (const stem of sorted(new Set(stemGroups.keys()))) {
    const forms = sorted(stemGroups.get(stem)!);
    if (forms.length < 2) continue;
    // Keep the shortest surface form; every other form is a duplicate.
    const kept = forms.reduce((a, b) =>
      b.length < a.length || (b.length === a.length && b < a) ? b : a,
    );
    for (const form of forms) {
      if (form === kept) continue;
      // Already counted as a cross-field duplicate — don't double-count chars.
      if (crossFieldFlagged.has(form)) continue;
      const containing = fields.filter((f) => f.tokenSet.has(form));
      const cheapest = containing[containing.length - 1];
      if (!cheapest) continue;
      const keptField = fields.find((f) => f.tokenSet.has(kept));
      findings.push({
        kind: "plural-duplicate",
        field: cheapest.name,
        token: form,
        detail:
          `"${form}" is a plural variant of "${kept}"` +
          (keptField ? ` (${keptField.name})` : "") +
          `; Apple treats plurals as duplicates — keep only "${kept}".`,
        charsWasted: form.length + separatorCost(cheapest),
        ruleProvenance: "apple-documented",
      });
    }
  }

  // 4. camelcase-hidden-split (community-tested, aso.dev): compound words in
  //    title/subtitle split on capital letters. Informational only — the app
  //    gains extra indexed words; nothing is wasted.
  for (const f of fields) {
    if (f.name === "keywordsField") continue;
    const seen = new Set<string>();
    for (const raw of f.rawTokens) {
      if (seen.has(raw)) continue;
      if (!/\p{Ll}\p{Lu}/u.test(raw)) continue;
      seen.add(raw);
      const parts = raw
        .split(/(?<=\p{Ll})(?=\p{Lu})/u)
        .map((p) => p.toLowerCase());
      findings.push({
        kind: "camelcase-hidden-split",
        field: f.name,
        token: raw,
        detail:
          `"${raw}" likely also indexes as separate words (${parts.join(", ")}) ` +
          `per community-tested capital-letter splitting. Informational — no characters wasted.`,
        charsWasted: 0,
        ruleProvenance: "community-tested",
      });
    }
  }

  // 5. keyword-field-format (apple-documented: comma-separated, no spaces
  //    after commas — e.g. "Property,House,Real Estate").
  if (keywordsField) {
    let spaceCount = 0;
    for (const match of keywordsField.raw.matchAll(/,( +)/g)) {
      spaceCount += match[1]!.length;
    }
    if (spaceCount > 0) {
      findings.push({
        kind: "keyword-field-format",
        field: "keywordsField",
        token: ", ",
        detail:
          `${spaceCount} space character(s) after commas in the keywords field; ` +
          `Apple's documented format is comma-separated with no spaces (e.g. "Property,House,Real Estate").`,
        charsWasted: spaceCount,
        ruleProvenance: "apple-documented",
      });
    }
  }

  const totalCharsWasted = findings.reduce((s, f) => s + f.charsWasted, 0);

  // Distinct indexed tokens = distinct lowercase tokens collapsed by the
  // naive plural stem (Apple counts each word once and treats plurals as the
  // same word). Auto-indexed words still index, so they stay in the count.
  const distinctStems = new Set<string>();
  for (const token of allTokens) distinctStems.add(naivePluralStem(token));
  const distinctIndexedTokens = distinctStems.size;

  const phrasePermutations = orderedPairs(distinctIndexedTokens);
  const reclaimedTokens = Math.floor(
    totalCharsWasted / ASSUMED_REPLACEMENT_KEYWORD_CHARS,
  );
  const phrasePermutationsIfFixed = orderedPairs(
    distinctIndexedTokens + reclaimedTokens,
  );

  const notes: string[] = [
    "Token-combination model (words from title, subtitle, and the keywords field combine into search phrases within one locale) is community-tested (aso.dev); Apple does not publish permutation mechanics.",
    "phrasePermutations is an illustrative upper bound — ordered two-token pairs of distinct indexed stems (n*(n-1)); not every pair is a plausible user query, and no rank outcome is implied.",
    `phrasePermutationsIfFixed assumes wasted characters are repurposed as new distinct keywords of average length 7 plus a 1-char comma separator (${ASSUMED_REPLACEMENT_KEYWORD_CHARS} chars per reclaimed keyword).`,
    "Plural detection uses naive English stemming only (trailing s/es, ies→y); non-English plural systems are not modeled.",
  ];
  if (typeof input.keywordsField !== "string") {
    notes.push(
      "keywordsField was not provided — it is not publicly visible (App Store Connect only), so this lint covers title/subtitle only.",
    );
  }
  if (allTokens.size === 0) {
    notes.push("No indexable tokens found in the provided fields.");
  }

  return {
    totalCharsWasted,
    findings,
    distinctIndexedTokens,
    phrasePermutations,
    phrasePermutationsIfFixed,
    notes,
  };
}

// ---------------------------------------------------------------------------
// App Review / Play-policy safety pass for ready-to-paste metadata.
// Generated metadata that triggers a store rejection is product liability —
// every ready-to-paste suggestion should run through this before display.
// ---------------------------------------------------------------------------

export interface ReviewRiskFlag {
  field: string;
  term: string;
  rule: string;
  severity: "warning" | "likely-violation";
  store: "ios" | "android";
}

export interface ReviewSafetyFields {
  title?: string | null;
  subtitle?: string | null;
  keywordsField?: string | null;
  shortDescription?: string | null;
  androidShortDescription?: string | null;
}

// App Store Connect enforces 30 characters for the app name (and Play's
// metadata policy caps titles at 30 as well).
const IOS_TITLE_MAX_CHARS = 30;

// App Review 2.3.7: don't include prices in app names or metadata.
const IOS_PRICING_TERMS = ["free", "sale", "discount"] as const;

// Generic superlatives in the keywords field — low-information terms that
// 2.3.7 calls out under accurate-metadata expectations.
const IOS_GENERIC_SUPERLATIVES = new Set([
  "best",
  "top",
  "#1",
  "number one",
  "great",
  "amazing",
  "awesome",
  "ultimate",
  "leading",
  "perfect",
]);

// App Store category names — Apple's keyword guidance says the category is
// already indexed, so spending keyword characters on it is wasted AND reads
// as keyword padding to review. Non-exhaustive: current primary categories
// plus common single-word/"and" variants.
const IOS_CATEGORY_NAMES = new Set([
  "books",
  "business",
  "developer tools",
  "education",
  "entertainment",
  "finance",
  "food & drink",
  "food and drink",
  "game",
  "games",
  "graphics & design",
  "graphics and design",
  "health & fitness",
  "health and fitness",
  "kids",
  "lifestyle",
  "magazines & newspapers",
  "magazines and newspapers",
  "medical",
  "music",
  "navigation",
  "news",
  "photo & video",
  "photo and video",
  "photography",
  "productivity",
  "reference",
  "shopping",
  "social networking",
  "sports",
  "stickers",
  "travel",
  "utilities",
  "weather",
]);

// Google Play metadata policy banned performance/price/promo patterns
// (research-play-ranking.md; AppRadar enforcement study of the Sept 2021
// policy: https://appradar.com/blog/google-play-policy-update-2021-impact-aso).
const PLAY_BANNED_TERMS = ["best", "#1", "free", "sale", "download now"] as const;

export function lintReviewSafety(
  fields: ReviewSafetyFields,
  store: "ios" | "android",
): ReviewRiskFlag[] {
  const flags: ReviewRiskFlag[] = [];
  if (store === "ios") {
    lintIosSafety(fields, flags);
  } else {
    lintAndroidSafety(fields, flags);
  }
  return flags;
}

function lintIosSafety(fields: ReviewSafetyFields, flags: ReviewRiskFlag[]): void {
  const title = fields.title ?? null;
  if (title !== null && [...title].length > IOS_TITLE_MAX_CHARS) {
    flags.push({
      field: "title",
      term: title,
      rule: `App name exceeds the ${IOS_TITLE_MAX_CHARS}-character App Store Connect limit`,
      severity: "likely-violation",
      store: "ios",
    });
  }

  // Pricing words in user-visible metadata (App Review Guideline 2.3.7).
  for (const fieldName of ["title", "subtitle"] as const) {
    const value = fields[fieldName];
    if (typeof value !== "string") continue;
    for (const term of IOS_PRICING_TERMS) {
      if (!containsTerm(value, term)) continue;
      flags.push({
        field: fieldName,
        term,
        rule: "Pricing language in metadata risks App Review Guideline 2.3.7 (don't include prices in app names or metadata)",
        severity: "warning",
        store: "ios",
      });
    }
  }

  // Keyword-field terms that are category names or generic superlatives.
  const keywordsField = fields.keywordsField;
  if (typeof keywordsField === "string") {
    for (const rawTerm of keywordsField.split(",")) {
      const term = rawTerm.trim().toLowerCase();
      if (term.length === 0) continue;
      if (IOS_CATEGORY_NAMES.has(term)) {
        flags.push({
          field: "keywordsField",
          term,
          rule: "Category names are already indexed; using them as keywords wastes characters and reads as padding (Apple keyword guidance / 2.3.7)",
          severity: "warning",
          store: "ios",
        });
      } else if (IOS_GENERIC_SUPERLATIVES.has(term)) {
        flags.push({
          field: "keywordsField",
          term,
          rule: "Generic superlatives in the keyword field conflict with accurate-metadata expectations (App Review Guideline 2.3.7)",
          severity: "warning",
          store: "ios",
        });
      }
    }
  }
}

function lintAndroidSafety(
  fields: ReviewSafetyFields,
  flags: ReviewRiskFlag[],
): void {
  const checked: Array<{ name: string; value: string; isTitle: boolean }> = [];
  if (typeof fields.title === "string") {
    checked.push({ name: "title", value: fields.title, isTitle: true });
  }
  if (typeof fields.shortDescription === "string") {
    checked.push({
      name: "shortDescription",
      value: fields.shortDescription,
      isTitle: false,
    });
  }
  if (typeof fields.androidShortDescription === "string") {
    checked.push({
      name: "androidShortDescription",
      value: fields.androidShortDescription,
      isTitle: false,
    });
  }

  for (const { name, value, isTitle } of checked) {
    // Banned performance/price/promo terms. Documented enforcement is
    // harsher on titles (suspensions reported) than descriptions (Console
    // warnings / lost promotion eligibility) — severity reflects that.
    for (const term of PLAY_BANNED_TERMS) {
      if (!containsTerm(value, term)) continue;
      flags.push({
        field: name,
        term,
        rule: "Google Play metadata policy bans performance/price/promo words in store listing text (enforced since Sept 2021; see AppRadar enforcement study, research-play-ranking.md)",
        severity: isTitle ? "likely-violation" : "warning",
        store: "android",
      });
    }

    // ALL-CAPS words longer than 5 chars (not acronym-like). Brand names are
    // the policy's only carve-out, which we cannot verify — hence warning.
    for (const word of tokenize(value)) {
      if (!/^\p{Lu}{6,}$/u.test(word)) continue;
      flags.push({
        field: name,
        term: word,
        rule: "Google Play metadata policy disallows ALL-CAPS words that are not brand names or acronyms",
        severity: "warning",
        store: "android",
      });
    }

    // Emoji in titles is an explicit Play metadata policy violation.
    if (isTitle) {
      const emoji = value.match(/\p{Extended_Pictographic}/u);
      if (emoji) {
        flags.push({
          field: name,
          term: emoji[0],
          rule: "Google Play metadata policy disallows emoji in app titles",
          severity: "likely-violation",
          store: "android",
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// Words only: split on anything that is not a letter or digit. Keeps
// diacritics ("café") intact; camelCase compounds stay one raw token here
// (their hidden split is reported separately as community-tested).
function tokenize(value: string): string[] {
  return value.match(/[\p{L}\p{N}]+/gu) ?? [];
}

// Naive English plural stemmer — ies→y, (s|x|z|ch|sh)es→stem, trailing s.
// Deliberately not Porter: Apple's documented rule is only that plurals are
// duplicates, so anything fancier would over-claim.
function naivePluralStem(token: string): string {
  if (token.length > 3 && token.endsWith("ies")) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.length > 3 && /(s|x|z|ch|sh)es$/u.test(token)) {
    return token.slice(0, -2);
  }
  if (token.length > 1 && token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return token;
}

// Removing one token from a field also frees one separator (comma in the
// keywords field, space in title/subtitle) — unless it is the only token.
function separatorCost(field: FieldTokens): number {
  return field.lowerTokens.length > 1 ? 1 : 0;
}

function orderedPairs(n: number): number {
  return Math.max(0, n * (n - 1));
}

// Whole-term match with non-word boundaries so "free" never matches
// "freedom"; handles multi-word terms ("download now") and "#1".
function containsTerm(haystack: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
    "iu",
  );
  return pattern.test(haystack);
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort();
}
