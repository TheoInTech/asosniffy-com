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
  reportVersion: "2026-06-mvp-5",
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
    "Pawprint Habits ranks mid-pack for its highest-intent keyword and is leaking discovery to two competitors with stronger subtitles. The fastest unlock is a subtitle rewrite that pulls 'habit tracker' to the front; the keywords field has two low-value slots that should be reclaimed.",
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
        "Two of ten slots spent on near-duplicates of words already in the subtitle.",
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
      action: "Reclaim two filler keyword slots.",
      impact: "medium",
      effort: "low",
      rationale:
        "Two slots duplicate words already in the title/subtitle and yield no additional rank coverage.",
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
      current: "habit,daily,routine,streak,morning,journal",
      recommended:
        "daily,routine,streak,morning,evening,checklist,journal,calendar",
      changeReason:
        "Adds competitor-coverage terms (evening, checklist, calendar) and drops tokens already in title/subtitle.",
      charCount: 64,
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
} as unknown as DiagnosePaidResponse;
