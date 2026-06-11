import {
  type DiagnosePaidResponse,
  type QuoteResponse,
} from "../schemas/index.js";

// Runtime fixtures for the /sample endpoint and fixture-fallback paths.
//
// These are embedded as TypeScript literals (not loaded from disk) so the
// production image doesn't need to ship scraper/fixtures/. Avoids a Railway
// Metal-builder snapshot quirk where the COPY of scraper/fixtures/
// intermittently fails with "/scraper/fixtures: not found" even when the
// directory is on origin/main.
//
// scraper/fixtures/sample-quote.json and sample-report.json remain the
// human-readable source for tests (which read them via fs) and for
// documentation. If you edit the JSON, mirror the change here.

export const sampleQuote: QuoteResponse = {
  requestId: "req_sample_2026_05_mvp_quote",
  sniffId: "sniff_sample_001",
  store: "ios",
  country: "US",
  detectedApp: {
    id: "1000000001",
    name: "Pawprint Habits",
    developer: "Sample Studio LLC",
  },
  pricing: {
    currency: "USDC",
    network: "morph-hoodi",
    estimatedTotal: "0.05",
    breakdown: [
      { label: "base diagnosis", amount: "0.03" },
      { label: "2 keywords", amount: "0.02" },
    ],
  },
  coverage: {
    appMetadata: "high",
    keywordRank: "medium",
    competitorTrail: "medium",
    reviews: "low",
  },
  shallowScan: {
    title: "Pawprint Habits",
    subtitle: "Daily Routine & Streaks",
    primaryCategory: "Productivity",
    ratingsSummary: { average: 4.5, count: 1287 },
    previewKeyword: {
      keyword: "habit tracker",
      rankBucket: "11-30",
      confidence: "medium",
      provenance: "fixture",
    },
    metadataLengths: [
      {
        field: "title",
        used: 15,
        max: 30,
        note: "indexed for search",
      },
      {
        field: "subtitle",
        used: 23,
        max: 30,
        note: "indexed for search; should not repeat title keywords",
      },
    ],
    ratingBandVerdict: {
      band: "top-cluster",
      note: "Rating 4.50 is inside the 4.5+ band where vendor analyses report top-3 positions for competitive keywords cluster (AppFollow ASO ranking-factors guide, 2026). Community-tested claim, not store-documented policy.",
    },
    aiMention: {
      mentioned: false,
      model: "gpt-5.4-mini",
      intent: "habit tracker",
      checkedAt: "2026-05-17T09:45:00.000Z",
      provenance: "fixture",
    },
    webPlumbing: {
      smartAppBanner: true,
      appSchema: false,
      deepLinking: true,
    },
  },
  savingsNote: {
    message:
      "This sniff: $0.05 USDC. Typical ASO subscription: $59/month (or $589/year). Pay only when you sniff — no subscription, no seats, no card on file.",
    estimatedSniffCost: "0.05",
    typicalSubscriptionMonthlyUSD: 59,
    typicalSubscriptionAnnualUSD: 589,
  },
  next: {
    paidEndpoint: "/api/v1/aso/diagnose",
  },
} as unknown as QuoteResponse;

export const sampleReport: DiagnosePaidResponse = {
  requestId: "req_sample_2026_05_mvp",
  sniffId: "sniff_sample_001",
  reportVersion: "2026-06-mvp-6",
  receipt: {
    network: "eip155:2910",
    facilitator: "fixture-receipt",
    facilitatorMode: "fixture-receipt",
    amount: "0.05",
    atomicAmount: "50000000000000000",
    asset: "0xEcF966Cc754BC411E1F1106fbb4e343b835E85E4",
    transactionHash:
      "0x5a991e00000000000000000000000000000000000000000000000000000001",
    settledAt: "2026-05-17T10:00:00.000Z",
  },
  dataProvenance: {
    appMetadata: "fixture",
    keywordRank: "fixture",
    competitors: "fixture",
    recommendations: "fixture",
  },
  summary:
    "Pawprint Habits ranks mid-pack for its highest-intent keyword and is leaking discovery to two competitors with stronger subtitles. The fastest unlock is a subtitle rewrite that pulls 'habit tracker' to the front; the keywords field has three low-value slots that should be reclaimed.",
  keywordDiagnosis: [
    {
      keyword: "habit tracker",
      rankBucket: "11-30",
      intentScore: 0.82,
      confidence: "medium",
      provenance: "fixture",
      recommendation:
        "Move 'habit tracker' from the keywords field into the subtitle — high intent, currently ranking below the fold. Difficulty 71/100 (high). Tokens are in the title but not as an exact phrase — promoting to a contiguous phrase is the cheapest single fix.",
      difficulty: 71,
      minDifficulty: 38,
      difficultyIsFallback: false,
      matchKind: "subtitleAllWords",
    },
    {
      keyword: "daily routine",
      rankBucket: "51-100",
      intentScore: 0.61,
      confidence: "medium",
      provenance: "fixture",
      recommendation:
        "Keep in the keywords field; pair with 'streaks' in the next screenshot caption to reinforce intent. Difficulty 44/100 (medium).",
      difficulty: 44,
      minDifficulty: 21,
      difficultyIsFallback: false,
      matchKind: "subtitleExactPhrase",
    },
  ],
  competitorTrail: [
    {
      appId: "1000000101",
      name: "Streakly",
      overlapKeywords: ["habit tracker", "daily routine"],
      notes:
        "Outranks Pawprint Habits on both shared keywords. Subtitle leads with 'Habit Tracker', which Pawprint Habits buries.",
      provenance: "fixture",
    },
    {
      appId: "1000000102",
      name: "RoutineLab",
      overlapKeywords: ["daily routine"],
      notes:
        "Lower ratings volume but tighter keyword field — three high-intent terms, no filler.",
      provenance: "fixture",
    },
  ],
  metadataScore: {
    overall: 63,
    weights: {
      title: 20,
      subtitle: 15,
      keywords: 20,
      screenshots: 10,
      ratingsAndReviews: 15,
      keywordRankings: 20,
    },
    title: {
      score: 70,
      notes: "Strong brand recall, but doesn't carry a category keyword.",
    },
    subtitle: {
      score: 55,
      notes:
        "'Daily Routine & Streaks' uses one medium-intent term — leaves the highest-intent keyword on the table.",
    },
    keywords: {
      score: 48,
      notes:
        "Three of seven slots spent on near-duplicates of words already in the subtitle or on auto-indexed terms.",
    },
    screenshots: {
      score: 72,
      notes:
        "Description-density proxy — Sniffy doesn't extract screenshot caption text. Apple's semantic search does index captions; cross-check yours by hand.",
    },
    ratingsAndReviews: {
      score: 80,
      notes: "4.5★ across 1,200 ratings — strong social proof.",
    },
    keywordRankings: {
      score: 60,
      notes:
        "1 in top 10, 1 in 11-30, 0 in 31-50, 0 beyond / not found. Mid-pack — push for top-10 on the strongest keywords.",
    },
  },
  recommendations: [
    {
      rank: 1,
      action: "Rewrite subtitle to lead with 'Habit Tracker'.",
      impact: "high",
      effort: "low",
      rationale:
        "Highest-intent keyword is currently in the keywords field where it competes for surface area. Moving it to the subtitle is a one-character-budget change.",
    },
    {
      rank: 2,
      action: "Reclaim three filler keyword slots.",
      impact: "medium",
      effort: "low",
      rationale:
        "Two slots duplicate words already in the title/subtitle and 'app' is auto-indexed for every app — none of the three adds rank coverage.",
    },
    {
      rank: 3,
      action: "Promote the streak feature to screenshot frame 1.",
      impact: "medium",
      effort: "medium",
      rationale:
        "Streakly's lead with streaks correlates with its higher conversion on shared keywords; first-frame promotion is the cheapest test.",
    },
  ],
  readyToPaste: {
    title: {
      current: "Pawprint Habits",
      recommended: null,
      changeReason: null,
      charCount: 15,
      charLimit: 30,
    },
    subtitle: {
      current: "Track your daily routine",
      recommended: "Habit Tracker · Streaks & Routines",
      changeReason:
        'Promotes "habit tracker" (rank 11-30) into the subtitle, paired with a category cue.',
      charCount: 34,
      charLimit: 30,
    },
    keywordsField: {
      current: "habit,daily,routine,streak,morning,journal,app",
      recommended:
        "daily,routine,streak,morning,evening,checklist,journal,calendar,productivity",
      changeReason:
        "Adds competitor-coverage terms (evening, checklist, calendar, productivity) and drops the auto-indexed 'app' token flagged by the mechanics lint.",
      charCount: 76,
      charLimit: 100,
    },
    shortDescription: {
      current: "",
      recommended:
        "Pawprint Habits: habit tracker and streaks for daily routines that stick.",
      changeReason:
        "Leads with your top-intent keywords (habit tracker, streaks) instead of generic copy.",
      charCount: 74,
      charLimit: 240,
    },
    source: "deterministic",
  },
  targetAppSignals: {
    ratingsPerDay: 12.4,
    momentumLabel: "growing",
    daysSinceFirstRelease: 412,
    daysSinceLastRelease: 9,
  },
  // Wave 1 (roadmap 1.4) — real lintMetadataMechanics output for the fixture
  // listing (title "Pawprint Habits", subtitle "Track your daily routine",
  // paste-in keywords field above). Numbers are the linter's, not invented.
  metadataMechanics: {
    totalCharsWasted: 25,
    findings: [
      {
        kind: "auto-indexed-word",
        field: "keywordsField",
        token: "app",
        detail:
          '"app" is indexed automatically for every app per Apple\'s keyword guidance (generic terms add no value) — remove it from the keywords field.',
        charsWasted: 4,
        ruleProvenance: "apple-documented",
      },
      {
        kind: "cross-field-duplicate",
        field: "keywordsField",
        token: "daily",
        detail:
          '"daily" already appears in subtitle; Apple documents that words repeated across name, subtitle, and keywords are duplicates — remove it from keywordsField.',
        charsWasted: 6,
        ruleProvenance: "apple-documented",
      },
      {
        kind: "cross-field-duplicate",
        field: "keywordsField",
        token: "routine",
        detail:
          '"routine" already appears in subtitle; Apple documents that words repeated across name, subtitle, and keywords are duplicates — remove it from keywordsField.',
        charsWasted: 8,
        ruleProvenance: "apple-documented",
      },
      {
        kind: "plural-duplicate",
        field: "title",
        token: "habits",
        detail:
          '"habits" is a plural variant of "habit" (keywordsField); Apple treats plurals as duplicates — keep only "habit".',
        charsWasted: 7,
        ruleProvenance: "apple-documented",
      },
    ],
    distinctIndexedTokens: 10,
    phrasePermutations: 90,
    phrasePermutationsIfFixed: 156,
    notes: [
      "Token-combination model (words from title, subtitle, and the keywords field combine into search phrases within one locale) is community-tested (aso.dev); Apple does not publish permutation mechanics.",
      "phrasePermutations is an illustrative upper bound — ordered two-token pairs of distinct indexed stems (n*(n-1)); not every pair is a plausible user query, and no rank outcome is implied.",
      "phrasePermutationsIfFixed assumes wasted characters are repurposed as new distinct keywords of average length 7 plus a 1-char comma separator (8 chars per reclaimed keyword).",
      "Plural detection uses naive English stemming only (trailing s/es, ies→y); non-English plural systems are not modeled.",
    ],
    keywordsFieldProvided: true,
    reviewSafety: [
      {
        field: "keywordsField",
        term: "productivity",
        rule: "Category names are already indexed; using them as keywords wastes characters and reads as padding (Apple keyword guidance / 2.3.7)",
        severity: "warning",
        store: "ios",
      },
    ],
    provenance: "inferred",
  },
  // Wave 1 (roadmap 1.2) — real computeConversionIndex / adviseRatingReset /
  // planZeroBudgetExperiment outputs for 4.5★ × 1287 ratings, Productivity,
  // 120 impressions/day. estimatedConversionIndex = multiplier × baseline.
  conversionAudit: {
    ratingEconomics: {
      ratingMultiplier: {
        low: 0.96,
        high: 0.96,
        source: "NP Digital 49-company study",
        year: 2026,
      },
      ratingBand: "top-cluster",
      bandNote:
        "Rating 4.50 is inside the 4.5+ band where vendor analyses report top-3 positions for competitive keywords cluster (AppFollow ASO ranking-factors guide, 2026). Community-tested claim, not store-documented policy.",
      categoryCvrBaseline: {
        low: 50.7,
        high: 68.7,
        source: "AppTweak H1 2024 (via Adapty)",
        year: 2024,
      },
      estimatedConversionIndex: {
        low: 48.7,
        high: 66,
        source:
          "Rating multiplier (NP Digital 49-company study) x category baseline (AppTweak H1 2024 (via Adapty))",
        year: 2026,
      },
      thinVolume: false,
    },
    ratingReset: {
      stance: "avoid",
      rationale:
        "Lifetime average 4.5 is at or above the 4.0 credibility threshold (community-tested, AppFollow 2026); a reset would erase the social proof of 1287 lifetime ratings for little displayed-number upside.",
      mechanics:
        "Apple-documented: App Store Connect lets you reset the summary rating when releasing a new version, applied per territory (written reviews persist and Apple advises using it sparingly); Android has no equivalent reset - Google Play's displayed rating is automatically weighted toward recent ratings (Google-documented).",
    },
    experimentPlan: {
      feasible: true,
      daysToSignificance: { low: 5, high: 9 },
      assumptions: [
        "[statistics] Two-proportion sample size: n per arm = 2*p*(1-p)*(z_alpha+z_beta)^2 / (p*MDE)^2 with z_alpha=1.645 (90% confidence, two-sided), z_beta=0.8416 (80% power), relative MDE=15%.",
        "[benchmark] Baseline CVR 50.7%-68.7% (AppTweak H1 2024 (via Adapty), 2024).",
        "[input] estDailyImpressions = 120; days = ceil(samples / impressions) per range end.",
      ],
      recommendation:
        "Run a 2-arm test (original + 1 treatment) changing only the first 1-3 screenshots (the #1 conversion element in large A/B corpora); expect roughly 5-9 days to 90% confidence at 120 impressions/day. Test one element at a time; icon is the evidence-backed second test, preview video third.",
      suggestedFirstTest: "screenshots",
      platformPath:
        "Apple Product Page Optimization (App Store Connect -> Product Page Optimization): free native A/B test of the default product page; up to 3 treatments vs the original, 90-day cap, results reported at 90% confidence; treatment assets pass App Review and alternate icons must ship in the binary.",
    },
    provenance: "inferred",
  },
  // Wave 2.1 — synthetic-but-consistent SOV: 10 templates × 2 replicates,
  // intent "habit tracker", 11/20 target mentions. Prompts are verbatim
  // renderProbePrompt(idx, "habit tracker", "ios") output (v5-10 set).
  aiVisibility: {
    targetSov: 0.55,
    sovBand: { plusMinusPp: 8.1, basis: "v5-pilot-2026-06" },
    shareOfVoice: [
      {
        name: "Streakly",
        isTarget: false,
        mentions: 16,
        mentionRate: 0.8,
      },
      {
        name: "Pawprint Habits",
        isTarget: true,
        mentions: 11,
        mentionRate: 0.55,
      },
      {
        name: "RoutineLab",
        isTarget: false,
        mentions: 5,
        mentionRate: 0.25,
      },
    ],
    promptTable: [
      {
        templateIdx: 0,
        intent: "habit tracker",
        prompt:
          "What's the best iPhone app for habit tracker? Answer in 2-3 sentences.",
        mentionRate: 1,
      },
      {
        templateIdx: 1,
        intent: "habit tracker",
        prompt:
          "Recommend a mobile app for habit tracker. Answer in 2-3 sentences.",
        mentionRate: 0.5,
      },
      {
        templateIdx: 2,
        intent: "habit tracker",
        prompt: "What are the top 3 apps for habit tracker? One line each.",
        mentionRate: 1,
      },
      {
        templateIdx: 4,
        intent: "habit tracker",
        prompt:
          "Which app do most people actually use to habit tracker? Answer in 2-3 sentences.",
        mentionRate: 0,
      },
      {
        templateIdx: 8,
        intent: "habit tracker",
        prompt:
          "If you could only pick ONE app for habit tracker, which would it be and why? Two sentences.",
        mentionRate: 0,
      },
      {
        templateIdx: 9,
        intent: "habit tracker",
        prompt:
          "Which habit tracker app has the best reputation among users? Answer in 2-3 sentences.",
        mentionRate: 0.5,
      },
    ],
    deterministicMisses: [
      {
        templateIdx: 4,
        intent: "habit tracker",
        prompt:
          "Which app do most people actually use to habit tracker? Answer in 2-3 sentences.",
      },
      {
        templateIdx: 8,
        intent: "habit tracker",
        prompt:
          "If you could only pick ONE app for habit tracker, which would it be and why? Two sentences.",
      },
    ],
    modelsUsed: ["gpt-5.4-mini"],
    promptSetVersion: "v5-10",
    totalCalls: 20,
    failedCalls: 0,
    provenance: "fixture",
  },
  // Wave 2.2 — coherent web-plumbing story on a reserved .example domain:
  // banner present but missing app-argument, JSON-LD missing offers.price,
  // AASA valid, no assetlinks, Gemini-training opt-out, stale schema rating.
  webDiscoverability: {
    url: "https://pawprinthabits.example",
    smartAppBanner: {
      present: true,
      appId: "1000000001",
      hasAppArgument: false,
    },
    appSchema: {
      present: true,
      type: "SoftwareApplication",
      missingRequiredFields: ["offers.price"],
      aggregateRatingValue: 4.6,
    },
    universalLinks: {
      present: true,
      valid: true,
      bundleIdListed: true,
    },
    androidAppLinks: { present: false },
    aiCrawlerAccess: {
      robotsTxtPresent: true,
      gptBot: "allowed",
      perplexityBot: "allowed",
      googleExtended: "blocked",
    },
    openGraph: {
      title: true,
      description: true,
      image: false,
    },
    ratingDrift: {
      schemaValue: 4.6,
      storeValue: 4.5,
      drift: 0.1,
    },
    checkedAt: "2026-05-17T09:45:00.000Z",
    provenance: "fixture",
  },
} as unknown as DiagnosePaidResponse;
