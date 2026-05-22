// Review-derived keyword frequency.
//
// Tokenizes review bodies, drops stopwords, applies light lemmatization
// (strip common plural/-ing/-ed suffixes), and returns the top-N terms
// by frequency. Used by Phase 3 to surface `suggestedKeywords[]` —
// terms users *should* have submitted but didn't.
//
// Deliberately small. We are not trying to be a full NLP pipeline; the
// goal is "what words do users themselves use to describe this app?"
// — that signal is robust even with a minimal stopword list.

// --- Helpers + suffix rules first (referenced by the STOPWORDS IIFE at
// module init — `const` declarations aren't hoisted, so SUFFIX_RULES must
// be declared before STOPWORDS evaluates).

const SUFFIX_RULES: Array<{ suffix: string; replacement: string; minLength: number }> = [
  { suffix: "ies", replacement: "y", minLength: 5 },
  { suffix: "ied", replacement: "y", minLength: 5 },
  { suffix: "ing", replacement: "", minLength: 6 },
  { suffix: "ed", replacement: "", minLength: 5 },
  { suffix: "es", replacement: "", minLength: 5 },
  { suffix: "s", replacement: "", minLength: 4 },
];

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

function lemmatize(token: string): string {
  for (const rule of SUFFIX_RULES) {
    if (token.length >= rule.minLength && token.endsWith(rule.suffix)) {
      return token.slice(0, token.length - rule.suffix.length) + rule.replacement;
    }
  }
  return token;
}

// --- Stopwords (raw and lemmatized union).

const STOPWORDS_EN = new Set([
  "the","a","an","and","or","but","if","then","else","for","while","with",
  "in","on","at","by","to","of","from","as","is","are","was","were","be",
  "been","being","have","has","had","do","does","did","done","will","would",
  "shall","should","can","could","may","might","must","this","that","these",
  "those","i","you","he","she","it","we","they","them","my","your","his",
  "her","its","our","their","what","which","who","whom","whose","when",
  "where","why","how","all","any","both","each","few","more","most","other",
  "some","such","no","nor","not","only","own","same","so","than","too",
  "very","just","app","apps","use","using","used","really","also","one",
  "lot","like","get","got","make","made","want","need","time","day","good",
  "great","nice","best","love","like","hate","new","old","much","many",
  "well","still","always","never","every","everything","nothing","please",
  "thanks","thank","there","here","because","yes","no","ok","okay",
  // Common English contraction stems — after normalize() strips the
  // apostrophe, "don't" tokenizes to ["don","t"], "doesn't" to ["doesn","t"],
  // etc. Without these, "don" and "doesn" leak into suggestedKeywords as
  // noise (observed in the Streaks smoke). "won" and "can" deliberately
  // excluded because they're real words too often.
  "don","doesn","didn","isn","wasn","aren","weren","hasn","haven","hadn",
  "wouldn","shouldn","couldn","mustn","ain","let","gonna","wanna",
]);

const STOPWORDS_ES = new Set([
  "el","la","los","las","de","y","o","u","pero","si","no","es","son","fue",
  "ser","con","sin","por","para","como","muy","ya","todo","todos","mas",
]);

const STOPWORDS_PT = new Set([
  "o","a","os","as","de","e","ou","mas","se","é","são","foi","ser","com",
  "sem","por","para","como","muito","já","tudo","todos","mais",
]);

const STOPWORDS_RAW = new Set([
  ...STOPWORDS_EN,
  ...STOPWORDS_ES,
  ...STOPWORDS_PT,
]);

// Lemmatize-the-stoplist: "this" lemmatizes to "thi" via the "s"-suffix
// rule, but "thi" is NOT in STOPWORDS_RAW — so without this union pass,
// "thi" leaks into suggestedKeywords as a token (observed in the Streaks
// smoke). Same problem for any stopword that hits a suffix rule. Building
// the lemmatized variants once at module init keeps the per-token cost zero.
const STOPWORDS = (() => {
  const out = new Set<string>(STOPWORDS_RAW);
  for (const w of STOPWORDS_RAW) out.add(lemmatize(w));
  return out;
})();

export interface KeywordFrequencyInput {
  reviewBodies: readonly string[];
  // Words to exclude as "brand" or "self-description" — typically the app
  // name and developer name. Case-insensitive.
  brandTokens?: readonly string[];
  // Tokens to exclude as "category names" (e.g. "productivity", "lifestyle")
  // so they don't dominate the top-N when reviewers happen to mention the
  // category. Case-insensitive.
  categoryTokens?: readonly string[];
  // Top-N to return. Default 30. Caller (orchestrator) usually slices
  // further when building suggestedKeywords[].
  topN?: number;
}

export interface KeywordFrequencyItem {
  token: string;
  count: number;
  // Number of distinct reviews this token appeared in. Used to deprioritize
  // a token that only appears 20 times in a single very-long review.
  reviewCount: number;
}

export function reviewKeywordFrequency(
  input: KeywordFrequencyInput,
): KeywordFrequencyItem[] {
  // Brand/category tokens are filtered AFTER lemmatization on the review
  // side — so we lemmatize the filter tokens too. Otherwise "Pawprint Habits"
  // tokenizes to {pawprint, habits} but a review token "habits" lemmatizes
  // to "habit", which then bypasses the filter.
  const brand = new Set(
    (input.brandTokens ?? [])
      .flatMap((t) => normalize(t).split(" "))
      .filter((t) => t.length > 0)
      .map(lemmatize),
  );
  const categories = new Set(
    (input.categoryTokens ?? [])
      .flatMap((t) => normalize(t).split(" "))
      .filter((t) => t.length > 0)
      .map(lemmatize),
  );

  const totalCount = new Map<string, number>();
  const reviewCount = new Map<string, number>();

  for (const body of input.reviewBodies) {
    const seen = new Set<string>();
    for (const raw of tokenize(body)) {
      const t = lemmatize(raw);
      if (t.length < 3) continue;
      if (STOPWORDS.has(t)) continue;
      if (brand.has(t)) continue;
      if (categories.has(t)) continue;
      if (/^\d+$/.test(t)) continue;
      totalCount.set(t, (totalCount.get(t) ?? 0) + 1);
      if (!seen.has(t)) {
        seen.add(t);
        reviewCount.set(t, (reviewCount.get(t) ?? 0) + 1);
      }
    }
  }

  const topN = input.topN ?? 30;
  return Array.from(totalCount.entries())
    .map(([token, count]) => ({
      token,
      count,
      reviewCount: reviewCount.get(token) ?? 0,
    }))
    .sort((a, b) => {
      // Primary: review-distribution count (a token in 30 distinct reviews
      // beats a token mentioned 30 times in one review). Secondary: total
      // count.
      if (b.reviewCount !== a.reviewCount) return b.reviewCount - a.reviewCount;
      return b.count - a.count;
    })
    .slice(0, topN);
}
