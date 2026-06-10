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
export const ASO_KNOWLEDGE_VERSION = "2026-06-2";

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
      "Screenshot captions are the strongest creative conversion lever — most visitors decide from the first three screenshots without scrolling. Whether Apple ALSO indexes caption text for search ranking is contested: industry reports of caption-derived ranking after the June 2025 algorithm update were followed by reported denials from Apple, and independent controlled testing found no broad caption ranking. Write captions for conversion and listing consistency; do not count them as guaranteed keyword surface.",
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
  {
    // Apple-documented (developer.apple.com, confirmed in
    // docs/research/2026-06-discoverability/research-ratings-reviews-lever.md,
    // 2026). Feeds the Wave-1 conversionAudit rating-reset advisor.
    topic: "ios-rating-reset-per-version",
    summary:
      "The iOS summary rating is specific to each App Store territory and can be reset when releasing a new version; written reviews are never reset and keep displaying. A reset erases the accumulated rating volume — Apple advises using it sparingly because few ratings discourage downloads — so it only pays off when the current version's rating trends materially better than the lifetime average.",
    source: {
      name: "Apple Developer — Ratings, reviews, and responses",
      url: "https://developer.apple.com/app-store/ratings-and-reviews/",
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

  // ---------- Play quality gates ----------
  {
    // Google-published policy thresholds (V2 verdict, verification-verdicts.md
    // 2026-06: CONFIRMED on two official Google properties). The summary keeps
    // the three caveats V2 requires: enforcement is discretionary ("may"),
    // some treatments are staged, and the bars apply only above a minimum
    // user volume. It does NOT claim a measured ranking penalty size.
    topic: "play-core-value-gates",
    summary:
      "Google Play publishes quality bars for its Core Value metrics: DAU/MAU below 8% or a user-loss rate above 5% may trigger a warning on the store listing and make the app ineligible to appear on some Play surfaces, and user-perceived crash rates above 1.09% or ANR rates above 0.47% reduce discoverability. Enforcement is discretionary ('may'), some treatments are staged, and the bars apply only above a minimum user volume.",
    source: {
      name: "Google Play Console Help — Core Value quality thresholds",
      url: "https://support.google.com/googleplay/android-developer/answer/9844486",
    },
  },

  // ---------- Native listing experiments ----------
  {
    // Apple-documented constraints (developer.apple.com PPO page, cited in
    // research-store-conversion.md 2026). Feeds the Wave-1 zero-budget
    // experiment planner. Deliberately does NOT promise a conversion lift —
    // PPO is the measurement instrument, not the lever.
    topic: "ios-ppo-product-page-optimization",
    summary:
      "Apple's Product Page Optimization (PPO) is the free native A/B test for the default App Store page: up to 3 treatments against the original, a 90-day maximum duration, and results reported at 90% confidence in App Analytics. Whether 90% confidence is reachable depends on existing traffic, so low-traffic apps should run a single treatment changing only the highest-impact element first.",
    source: {
      name: "Apple Developer — Product Page Optimization",
      url: "https://developer.apple.com/app-store/product-page-optimization/",
    },
  },
  {
    // Google-published feature page with first-party case studies
    // (research-store-conversion.md 2026). Case-study lifts are
    // Google-published but promotional — the summary stays qualitative
    // ("double-digit") rather than quoting a point-estimate lift as a norm.
    topic: "play-store-listing-experiments",
    summary:
      "Google Play Console store listing experiments are free native A/B tests that can be localized per country; Google's own published case studies report double-digit install lifts from icon and screenshot tests. Test one element at a time and run for at least a week to absorb weekday/weekend traffic patterns.",
    source: {
      name: "Google Play Console — Store listing experiments",
      url: "https://play.google.com/console/about/store-listing-experiments/",
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

  // Description — android matcher checked first so a sentence that mentions
  // both Android and iOS routes to the Android indexed path. Non-greedy
  // `.{1,80}?` between the anchor words tolerates punctuation, articles, and
  // brief intervening phrases without exploding the matcher into a regex
  // sequence per joiner shape.
  {
    topic: "description-indexed-android",
    pattern:
      /(android|play|google)\b.{1,80}?\b(description|short[\s-]?desc|density|mention)/i,
  },
  {
    topic: "description-not-indexed-ios",
    pattern: /(description|ios|apple)\b.{1,80}?\b(conversion|not\s*indexed)/i,
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

  // Ratings — the reset matcher MUST precede the generic ratings signal:
  // reset advice also mentions averages/counts and would otherwise be
  // swallowed by the ratings-as-ranking-signal pattern.
  {
    topic: "ios-rating-reset-per-version",
    pattern: /\brating\b.{0,80}?\breset|\breset\b.{0,80}?\brating/i,
  },
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

  // Play quality gates — threshold vocabulary (DAU/MAU, user-loss, crash
  // rate, ANR) is unique to this topic, so the pattern can be appended last
  // without shadowing anything above.
  {
    topic: "play-core-value-gates",
    pattern:
      /\bdau\b\s*\/?\s*\bmau\b|user[\s-]?loss|core\s+value|crash\s*rate|\banr\b/i,
  },

  // Native listing experiments — PPO requires the explicit feature name or
  // acronym (generic "product page" copy advice must NOT route here); the
  // Play matcher anchors on "listing experiment" or a Play/Android qualifier
  // near "experiment" so iOS PPO text never routes to the Android topic.
  {
    topic: "ios-ppo-product-page-optimization",
    pattern: /\bppo\b|product[\s-]?page\s+optimi[sz]ation/i,
  },
  {
    topic: "play-store-listing-experiments",
    pattern:
      /(store[\s-]?listing|listing)\s+experiments?\b|\b(play|android)\b.{1,80}?\bexperiments?\b/i,
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
