// Canonical ASO knowledge corpus for the @sniffy/aso-knowledge MCP package.
//
// **Dual source-of-truth note.** This file is mirrored at
// scraper/src/scoring/aso-knowledge.ts, where the scraper's orchestrator
// uses the same matchers to enrich /diagnose recommendations. Both copies
// must agree on topic keys, summaries, and source URLs — the scraper test
// suite includes a sync-guard test that reads this file and asserts
// equality across the two. When you edit one, edit the other in the same
// commit, and bump ASO_KNOWLEDGE_VERSION below.
//
// Sources are always PRIMARY (Apple HIG, Apple Search Ads docs, App Store
// Connect Help, Play Store Help, App Store Review Guidelines). Summaries
// paraphrase the source — never verbatim quotes. Third-party ASO blogs and
// competing tool-vendor docs are explicitly excluded from this list.

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

// Bumped manually any time the corpus changes so SDK consumers and the
// public showcase can branch on "is this report's citation block still
// current?". MUST match the value in scraper/src/scoring/aso-knowledge.ts.
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

// Matchers in priority order — first match wins. Mirror of the matchers in
// scraper/src/scoring/aso-knowledge.ts. Both copies MUST agree.
const MATCHERS: ReadonlyArray<{ topic: string; pattern: RegExp }> = [
  {
    topic: "title-30-char-cap",
    pattern: /\btitle\b.*(length|cap|over|under|chars?|30)/i,
  },
  {
    topic: "title-keyword-weight",
    pattern: /\btitle\b.*(keyword|missing|exact|phrase|primary)/i,
  },
  {
    topic: "subtitle-distinct-keywords",
    pattern:
      /\bsubtitle\b.*(duplicate|repeat|overlap|distinct|wast|same|share)/i,
  },
  {
    topic: "keyword-field-no-spaces",
    pattern: /(keyword|keywords?)\s*field.*(space|comma|byte|format)/i,
  },
  {
    topic: "keyword-field-no-redundant-terms",
    pattern:
      /(keyword|keywords?)\s*field.*(app\b|free\b|category|brand|competitor|your\s*app|app\s*name|own)/i,
  },
  {
    topic: "description-indexed-android",
    pattern:
      /(android|play|google)\b.{1,80}?\b(description|short[\s-]?desc|density|mention)/i,
  },
  {
    topic: "description-not-indexed-ios",
    pattern: /(description|ios|apple)\b.{1,80}?\b(conversion|not\s*indexed)/i,
  },
  {
    topic: "screenshot-captions-indexed",
    pattern: /screenshot.*(caption|text|frame|visual|first\s*three)/i,
  },
  {
    topic: "localization-per-storefront",
    pattern:
      /(localiz|locale|storefront|translate|language|german|japan|korea|brazil)/i,
  },
  {
    topic: "ratings-as-ranking-signal",
    pattern: /(rating|review)s?.*(rank|signal|weight|score|count|average)/i,
  },
  {
    topic: "promotional-text-refreshable",
    pattern: /promotional\s*text|promo\s*text/i,
  },
  {
    topic: "match-granularity-phrase-exact",
    pattern: /(exact|phrase)\s*match|match\s*granularity|all\s*words/i,
  },
];

const INDEX: ReadonlyMap<string, KnowledgeEntry> = new Map(
  ASO_KNOWLEDGE_BASE.map((e) => [e.topic, e]),
);

export function inferKnowledgeTopic(text: string): string | null {
  for (const { topic, pattern } of MATCHERS) {
    if (pattern.test(text)) return topic;
  }
  return null;
}

export function getKnowledgeByTopic(topic: string): KnowledgeEntry | null {
  return INDEX.get(topic) ?? null;
}

export function listKnowledgeTopics(): readonly KnowledgeEntry[] {
  return ASO_KNOWLEDGE_BASE;
}
