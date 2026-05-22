// Sprint B — curated ASO knowledge base. Each entry pairs a topic key with a
// one-sentence "why this matters" summary and a citation to a PRIMARY source
// (Apple HIG, Apple Search Ads docs, Play Store policy guidance, or App Store
// Review Guidelines). The summaries paraphrase the source — they are NOT
// verbatim quotes — and the URLs link to the public documentation that backs
// the claim. ASO blog tooling and third-party commentary are explicitly
// excluded from this source list to keep the knowledge moat defensible
// against drift in any one vendor's content.
//
// Enrichment flow: after synthesis emits a RecommendationItem, the
// orchestrator calls getKnowledgeForRecommendation() to pattern-match the
// action + rationale text against MATCHERS and attach a KnowledgeCitation
// when one fits. Recommendations that don't match any topic stay clean
// (knowledge: null) — better to omit a citation than fabricate one.

export interface KnowledgeSource {
  name: string;
  url: string;
  section?: string;
}

export interface KnowledgeEntry {
  topic: string;
  summary: string;
  source: KnowledgeSource;
}

// Snapshot fingerprint for the knowledge corpus. Bumped manually any time
// the corpus changes so SDK consumers and the public showcase can branch on
// "is this report's citation block still current?".
export const ASO_KNOWLEDGE_VERSION = "2026-05-1";

export const ASO_KNOWLEDGE_BASE: readonly KnowledgeEntry[] = [
  // ---------- Title ----------
  {
    topic: "title-keyword-weight",
    summary:
      "Title text gets the highest keyword weight in App Store search ranking — a primary keyword in the title can shift a listing's rank by roughly 10%.",
    source: {
      name: "Apple Search Ads — App Store algorithm",
      url: "https://searchads.apple.com/learn",
    },
  },
  {
    topic: "title-30-char-cap",
    summary:
      "iOS app titles are capped at 30 characters and indexed for search. Unused title bytes are unused ranking signal.",
    source: {
      name: "Apple App Store Connect Help — App Information",
      url: "https://developer.apple.com/help/app-store-connect/manage-app-information/enter-app-information/",
    },
  },

  // ---------- Subtitle ----------
  {
    topic: "subtitle-distinct-keywords",
    summary:
      "Apple indexes title + subtitle + keyword field together and counts each token once — repeating a keyword across two of these fields wastes the 30-char subtitle budget without adding ranking weight.",
    source: {
      name: "Apple Search Ads — Choosing keywords",
      url: "https://searchads.apple.com/learn",
    },
  },

  // ---------- Keyword field (iOS) ----------
  {
    topic: "keyword-field-no-spaces",
    summary:
      "The 100-char iOS keyword field is comma-separated with no space after each comma; every wasted byte cuts indexed terms. Use singular forms — Apple indexes plural forms automatically.",
    source: {
      name: "Apple App Store Connect Help — Keywords",
      url: "https://developer.apple.com/app-store/search/",
    },
  },
  {
    topic: "keyword-field-no-redundant-terms",
    summary:
      "Don't list 'app', 'free', your own app name, your category name, or competitor brand names in the keyword field — Apple indexes those signals separately and may treat the latter as a guideline violation.",
    source: {
      name: "App Store Review Guidelines §5.2 — Intellectual Property",
      url: "https://developer.apple.com/app-store/review/guidelines/",
    },
  },

  // ---------- Description ----------
  {
    topic: "description-not-indexed-ios",
    summary:
      "The iOS app description is NOT indexed for App Store search — it's conversion copy that loads after the search ranking is already decided. Keyword stuffing here doesn't move the rank.",
    source: {
      name: "Apple Search Ads — App Store algorithm",
      url: "https://searchads.apple.com/learn",
    },
  },
  {
    topic: "description-indexed-android",
    summary:
      "Google Play indexes the full app description for search. Density matters — community guidance lands on roughly 1 exact-phrase mention per 250 characters as a sustainable target for each ranking keyword.",
    source: {
      name: "Google Play Help — Store listing best practices",
      url: "https://support.google.com/googleplay/android-developer/answer/9866151",
    },
  },

  // ---------- Screenshots / visual ASO ----------
  {
    topic: "screenshot-captions-indexed",
    summary:
      "Apple's semantic search reads the text rendered inside the first three screenshots (Apple's accessibility-ML pass). Screenshot caption copy is a ranking signal — not just a conversion signal.",
    source: {
      name: "Apple Developer — App previews and screenshots",
      url: "https://developer.apple.com/app-store/product-page/",
    },
  },

  // ---------- Localization ----------
  {
    topic: "localization-per-storefront",
    summary:
      "Each App Store locale gets its own title, subtitle, keyword field, and screenshots. Apps that ship only English forfeit ranking in the 80+ non-English storefronts, including high-LTV markets like Japan, Korea, Germany, and Brazil.",
    source: {
      name: "Apple App Store Connect Help — App localizations",
      url: "https://developer.apple.com/help/app-store-connect/manage-app-information/add-app-localizations/",
    },
  },

  // ---------- Ratings ----------
  {
    topic: "ratings-as-ranking-signal",
    summary:
      "Average star rating and review volume are weighted ranking signals on both iOS and Android. High-rating apps surface higher even for marginal keyword matches; low-rating apps need 2-3x the keyword density to compete.",
    source: {
      name: "Apple Search Ads — App Store algorithm",
      url: "https://searchads.apple.com/learn",
    },
  },

  // ---------- Promotional text ----------
  {
    topic: "promotional-text-refreshable",
    summary:
      "iOS promotional text is 170 characters, sits above the description, is NOT indexed for ranking — but can be refreshed without an App Review submission. Use it for time-sensitive announcements (launches, sales, version notes) without burning a release.",
    source: {
      name: "Apple App Store Connect Help — Promotional text",
      url: "https://developer.apple.com/help/app-store-connect/manage-app-information/enter-app-information/",
    },
  },

  // ---------- Match granularity ----------
  {
    topic: "match-granularity-phrase-exact",
    summary:
      "Apple's ranking prefers exact-phrase matches over scattered-token matches: 'habit tracker' as one phrase ranks higher than 'habit' and 'tracker' separately, even when both tokens are in the title.",
    source: {
      name: "Apple Search Ads — Choosing keywords",
      url: "https://searchads.apple.com/learn",
    },
  },
];

// Matchers in priority order — first match wins. Patterns are intentionally
// conservative to avoid false positives across topics. Test coverage in
// tests/scoring/aso-knowledge.test.ts exercises each topic's intended text
// vs. neighbors' to lock down the priorities.
const MATCHERS: ReadonlyArray<{ topic: string; pattern: RegExp }> = [
  // Title — most specific first so generic "title" doesn't swallow these.
  {
    topic: "title-30-char-cap",
    pattern: /\btitle\b.*(length|cap|over|under|chars?|30)/i,
  },
  {
    topic: "title-keyword-weight",
    pattern: /\btitle\b.*(keyword|missing|exact|phrase|primary)/i,
  },

  // Subtitle
  {
    topic: "subtitle-distinct-keywords",
    pattern:
      /\bsubtitle\b.*(duplicate|repeat|overlap|distinct|wast|same|share)/i,
  },

  // Keyword field — comma/space rule first, then redundant-terms rule.
  {
    topic: "keyword-field-no-spaces",
    pattern: /(keyword|keywords?)\s*field.*(space|comma|byte|format)/i,
  },
  {
    topic: "keyword-field-no-redundant-terms",
    pattern:
      /(keyword|keywords?)\s*field.*(app\b|free\b|category|brand|competitor|your\s*app|app\s*name|own)/i,
  },

  // Description
  {
    topic: "description-indexed-android",
    pattern:
      /(android|play|google)\s*(\w+\s+){0,3}(description|short|density|mention)/i,
  },
  {
    topic: "description-not-indexed-ios",
    pattern:
      /(description|ios|apple)\s*(\w+\s+){0,3}(conversion|not indexed|search)/i,
  },

  // Screenshots
  {
    topic: "screenshot-captions-indexed",
    pattern: /screenshot.*(caption|text|frame|visual|first\s*three)/i,
  },

  // Localization
  {
    topic: "localization-per-storefront",
    pattern:
      /(localiz|locale|storefront|translate|language|german|japan|korea|brazil)/i,
  },

  // Ratings
  {
    topic: "ratings-as-ranking-signal",
    pattern: /(rating|review)s?.*(rank|signal|weight|score|count|average)/i,
  },

  // Promotional text
  {
    topic: "promotional-text-refreshable",
    pattern: /promotional\s*text|promo\s*text/i,
  },

  // Match granularity
  {
    topic: "match-granularity-phrase-exact",
    pattern: /(exact|phrase)\s*match|match\s*granularity|all\s*words/i,
  },
];

// Build the index once at module load. Stable insertion order; constant-time
// lookup by topic key.
const INDEX: ReadonlyMap<string, KnowledgeEntry> = new Map(
  ASO_KNOWLEDGE_BASE.map((e) => [e.topic, e]),
);

// Returns the topic key that most strongly matches the supplied text, or null
// when nothing matches. Caller-facing.
export function inferKnowledgeTopic(text: string): string | null {
  for (const { topic, pattern } of MATCHERS) {
    if (pattern.test(text)) return topic;
  }
  return null;
}

// Lookup by exact topic key. Used by tests and by future MCP integrations
// that want a direct query path.
export function getKnowledgeByTopic(topic: string): KnowledgeEntry | null {
  return INDEX.get(topic) ?? null;
}

// Higher-level helper: given a recommendation's text fields, return the best
// knowledge citation or null. Concatenates action + rationale and runs the
// inference. Null = "no clear topic match; don't fabricate a citation."
export function getKnowledgeForRecommendation(input: {
  action: string;
  rationale: string;
}): KnowledgeEntry | null {
  const combined = `${input.action} ${input.rationale}`;
  const topic = inferKnowledgeTopic(combined);
  if (!topic) return null;
  return INDEX.get(topic) ?? null;
}
