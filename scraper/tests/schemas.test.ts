import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DiagnosePaidResponse,
  DiagnoseUnpaidResponse,
  QuoteResponse,
  SampleResponse,
  SCHEMA_VERSION,
} from "../src/schemas/index.js";
import { renderProbePrompt } from "../src/scoring/ai-visibility.js";
import {
  sampleQuote as sampleQuoteTs,
  sampleReport as sampleReportTs,
} from "../src/data/fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = (name: string) => resolve(here, "../fixtures", name);
const readFixture = (name: string): unknown =>
  JSON.parse(readFileSync(fixturePath(name), "utf8"));

const exampleQuote = {
  requestId: "req_example_001",
  sniffId: "sniff_example_001",
  store: "ios" as const,
  country: "US",
  detectedApp: {
    id: "123456789",
    name: "Example App",
    developer: "Example Studio",
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
    appMetadata: "high" as const,
    keywordRank: "medium" as const,
    competitorTrail: "medium" as const,
    reviews: "low" as const,
  },
  shallowScan: {
    title: "Example App",
    subtitle: "Habit & Routine Tracker",
    primaryCategory: "Productivity",
    ratingsSummary: { average: 4.6, count: 1240 },
    previewKeyword: {
      keyword: "habit tracker",
      rankBucket: "11-30" as const,
      confidence: "medium" as const,
      provenance: "live" as const,
    },
  },
  savingsNote: {
    message:
      "This sniff: $0.05 USDC. Typical ASO subscription: $59/month (or $589/year). Pay only when you sniff — no subscription, no seats, no card on file.",
    estimatedSniffCost: "0.05",
    typicalSubscriptionMonthlyUSD: 59,
    typicalSubscriptionAnnualUSD: 589,
  },
  next: { paidEndpoint: "/api/v1/aso/diagnose" },
};

const hoodiTestToken = "0xEcF966Cc754BC411E1F1106fbb4e343b835E85E4";
const merchant = "0x000000000000000000000000000000000000dEaD";
const atomic005 = "50000000000000000"; // 0.05 @ 18 decimals

const exampleUnpaid = {
  x402Version: 2 as const,
  error: "payment_required" as const,
  sniffId: "sniff_example_001",
  resource: { url: "/api/v1/aso/diagnose" },
  payment: {
    x402Version: 2 as const,
    scheme: "exact" as const,
    network: "eip155:2910",
    facilitator: "https://morph-rails.morph.network/x402",
    amount: "0.05",
    atomicAmount: atomic005,
    decimals: 18,
    asset: hoodiTestToken,
    payTo: merchant,
    maxTimeoutSeconds: 60,
    extra: { name: "HoodiTestToken", version: "1.0" },
  },
  accepts: [
    {
      scheme: "exact" as const,
      network: "eip155:2910",
      amount: atomic005,
      asset: hoodiTestToken,
      payTo: merchant,
      maxTimeoutSeconds: 60,
      extra: { name: "HoodiTestToken", version: "1.0" },
    },
  ],
};

describe("schema constants", () => {
  it("exports the expected SCHEMA_VERSION", () => {
    expect(SCHEMA_VERSION).toBe("2026-06-mvp-6");
  });
});

describe("QuoteResponse", () => {
  it("parses the §9 example payload", () => {
    expect(() => QuoteResponse.parse(exampleQuote)).not.toThrow();
  });

  it("rejects an empty breakdown", () => {
    const bad = structuredClone(exampleQuote);
    bad.pricing.breakdown = [];
    expect(() => QuoteResponse.parse(bad)).toThrow();
  });
});

describe("DiagnoseUnpaidResponse", () => {
  it("parses the dual-shape 402 example payload", () => {
    expect(() => DiagnoseUnpaidResponse.parse(exampleUnpaid)).not.toThrow();
  });

  it("rejects a non-CAIP-2 network", () => {
    const bad = structuredClone(exampleUnpaid);
    bad.payment.network = "morph-hoodi";
    expect(() => DiagnoseUnpaidResponse.parse(bad)).toThrow();
  });

  it("keeps payment.atomicAmount and accepts[0].amount in sync", () => {
    const parsed = DiagnoseUnpaidResponse.parse(exampleUnpaid);
    expect(parsed.accepts[0]?.amount).toBe(parsed.payment.atomicAmount);
  });
});

describe("fixtures round-trip", () => {
  it("sample-quote.json parses as a QuoteResponse", () => {
    const payload = readFixture("sample-quote.json");
    expect(() => QuoteResponse.parse(payload)).not.toThrow();
  });

  it("sample-report.json parses as a DiagnosePaidResponse", () => {
    const payload = readFixture("sample-report.json");
    expect(() => DiagnosePaidResponse.parse(payload)).not.toThrow();
  });

  it("sample-report.json with sample:true parses as a SampleResponse", () => {
    const payload = readFixture("sample-report.json") as Record<string, unknown>;
    expect(() =>
      SampleResponse.parse({ ...payload, sample: true })
    ).not.toThrow();
  });

  it("sample-report.json carries reportVersion matching SCHEMA_VERSION", () => {
    const payload = readFixture("sample-report.json") as { reportVersion: string };
    expect(payload.reportVersion).toBe(SCHEMA_VERSION);
  });
});

// Wave 1+2 demo surface — the /sample fixtures must populate every new
// report section with internally-consistent values, never schema-default
// nulls. Arithmetic invariants mirror the producing modules so the demo
// numbers could plausibly have come from a real run.
describe("Wave 1+2 sample fixture sections", () => {
  const report = () =>
    DiagnosePaidResponse.parse(readFixture("sample-report.json"));
  const quote = () => QuoteResponse.parse(readFixture("sample-quote.json"));
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

  it("metadataMechanics is populated and arithmetically consistent", () => {
    const mm = report().metadataMechanics;
    expect(mm).not.toBeNull();
    expect(mm!.provenance).toBe("inferred");
    expect(mm!.keywordsFieldProvided).toBe(true);
    expect(mm!.findings.length).toBeGreaterThanOrEqual(2);
    expect(mm!.findings.length).toBeLessThanOrEqual(4);
    const wasted = mm!.findings.reduce((sum, f) => sum + f.charsWasted, 0);
    expect(mm!.totalCharsWasted).toBe(wasted);
    expect(mm!.phrasePermutationsIfFixed).toBeGreaterThan(
      mm!.phrasePermutations,
    );
    expect(mm!.reviewSafety).toHaveLength(1);
    expect(mm!.reviewSafety[0]!.severity).toBe("warning");
    expect(mm!.reviewSafety[0]!.store).toBe("ios");
  });

  it("conversionAudit ranges multiply through (index = multiplier x baseline)", () => {
    const ca = report().conversionAudit;
    expect(ca).not.toBeNull();
    expect(ca!.provenance).toBe("inferred");
    const { ratingMultiplier, categoryCvrBaseline, estimatedConversionIndex } =
      ca!.ratingEconomics;
    expect(ratingMultiplier).not.toBeNull();
    expect(categoryCvrBaseline).not.toBeNull();
    expect(estimatedConversionIndex).not.toBeNull();
    expect(estimatedConversionIndex!.low).toBe(
      round1(ratingMultiplier!.low * categoryCvrBaseline!.low),
    );
    expect(estimatedConversionIndex!.high).toBe(
      round1(ratingMultiplier!.high * categoryCvrBaseline!.high),
    );
    // Fixture app sits at 4.5 stars — at/above the 4.0 credibility floor
    // the reset advisor must say "avoid".
    expect(ca!.ratingReset?.stance).toBe("avoid");
    expect(ca!.experimentPlan.feasible).toBe(true);
    expect(ca!.experimentPlan.daysToSignificance).not.toBeNull();
    expect(ca!.experimentPlan.assumptions.length).toBeGreaterThanOrEqual(2);
    expect(ca!.experimentPlan.suggestedFirstTest).toBe("screenshots");
  });

  it("aiVisibility mention arithmetic holds and prompts are real v5-10 renders", () => {
    const parsed = report();
    const ai = parsed.aiVisibility;
    expect(ai).not.toBeNull();
    expect(ai!.provenance).toBe("fixture");
    expect(ai!.promptSetVersion).toBe("v5-10");
    expect(ai!.modelsUsed).toEqual(["gpt-5.4-mini"]);
    expect(ai!.totalCalls).toBe(20);
    expect(ai!.failedCalls).toBe(0);
    expect(ai!.sovBand).toEqual({ plusMinusPp: 8.1, basis: "v5-pilot-2026-06" });
    for (const entry of ai!.shareOfVoice) {
      expect(entry.mentionRate).toBe(round4(entry.mentions / ai!.totalCalls));
    }
    const target = ai!.shareOfVoice.find((e) => e.isTarget);
    expect(target?.name).toBe("Pawprint Habits");
    expect(ai!.targetSov).toBe(target!.mentionRate);
    // Every non-target SOV entry must be a competitor from the trail.
    const competitorNames = parsed.competitorTrail.map((c) => c.name);
    for (const entry of ai!.shareOfVoice.filter((e) => !e.isTarget)) {
      expect(competitorNames).toContain(entry.name);
    }
    // Prompt strings must be the calibrated v5-10 templates, verbatim.
    for (const row of ai!.promptTable) {
      expect(row.prompt).toBe(
        renderProbePrompt(row.templateIdx, row.intent, "ios"),
      );
    }
    expect(ai!.promptTable.length).toBeGreaterThanOrEqual(4);
    expect(ai!.promptTable.length).toBeLessThanOrEqual(6);
    expect(ai!.deterministicMisses.length).toBeGreaterThanOrEqual(1);
    for (const miss of ai!.deterministicMisses) {
      expect(miss.prompt).toBe(
        renderProbePrompt(miss.templateIdx, miss.intent, "ios"),
      );
      const row = ai!.promptTable.find(
        (r) => r.templateIdx === miss.templateIdx && r.intent === miss.intent,
      );
      expect(row?.mentionRate).toBe(0);
    }
  });

  it("webDiscoverability tells a coherent fixture story on a fictional domain", () => {
    const web = report().webDiscoverability;
    expect(web).not.toBeNull();
    expect(web!.provenance).toBe("fixture");
    expect(web!.url).toMatch(/^https:\/\/[^/]+\.example(\/|$)/);
    expect(web!.smartAppBanner.present).toBe(true);
    expect(web!.smartAppBanner.hasAppArgument).toBe(false);
    expect(web!.smartAppBanner.appId).toBe(quote().detectedApp.id);
    expect(web!.universalLinks).toEqual({
      present: true,
      valid: true,
      bundleIdListed: true,
    });
    expect(web!.androidAppLinks).toEqual({ present: false });
    expect(web!.aiCrawlerAccess.robotsTxtPresent).toBe(true);
    expect(web!.aiCrawlerAccess.gptBot).toBe("allowed");
    expect(web!.aiCrawlerAccess.perplexityBot).toBe("allowed");
    expect(web!.aiCrawlerAccess.googleExtended).toBe("blocked");
    // ratingDrift mirrors assembleWebDiscoverability: schema − store,
    // rounded to 2dp, sourced from the appSchema aggregateRating.
    expect(web!.ratingDrift).not.toBeNull();
    expect(web!.ratingDrift!.schemaValue).toBe(
      web!.appSchema.aggregateRatingValue,
    );
    expect(web!.ratingDrift!.storeValue).toBe(
      quote().shallowScan.ratingsSummary.average,
    );
    expect(web!.ratingDrift!.drift).toBe(
      Math.round(
        (web!.ratingDrift!.schemaValue - web!.ratingDrift!.storeValue) * 100,
      ) / 100,
    );
  });

  it("sample-quote shallowScan carries the Wave 1+2 teasers", () => {
    const scan = quote().shallowScan;
    // 4.5-star fixture average ⇒ top-cluster band (>= 4.5 threshold).
    expect(scan.ratingBandVerdict?.band).toBe("top-cluster");
    expect(scan.ratingBandVerdict?.note).toContain("4.5");
    expect(scan.aiMention).not.toBeNull();
    expect(scan.aiMention?.mentioned).toBe(false);
    expect(scan.aiMention?.model).toBe("gpt-5.4-mini");
    // Teaser intent = first fixture keyword.
    expect(scan.aiMention?.intent).toBe(scan.previewKeyword.keyword);
    expect(scan.aiMention?.provenance).toBe("fixture");
    expect(scan.webPlumbing).toEqual({
      smartAppBanner: true,
      appSchema: false,
      deepLinking: true,
    });
  });

  it("TS fixture literals mirror the JSON twins (fixtures.ts sync discipline)", () => {
    expect(sampleQuoteTs).toEqual(readFixture("sample-quote.json"));
    expect(sampleReportTs).toEqual(readFixture("sample-report.json"));
  });
});
