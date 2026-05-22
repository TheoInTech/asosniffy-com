import { describe, expect, it } from "vitest";
import { redactForShowcase } from "../../src/lib/redact-for-showcase.js";
import type { DiagnosePaidResponse } from "../../src/schemas/index.js";

// Pre-built paid-response fixture with every PII / correlation field set
// to a recognizable sentinel. Tests below assert each sentinel is absent
// from the redacted output — protects against regressions where a new
// PII field on DiagnosePaidResponse silently leaks into the showcase.
function buildPaidWithSentinels(): DiagnosePaidResponse {
  return {
    requestId: "req_SENTINEL_REQ",
    sniffId: "sniff_SENTINEL_SNIFF",
    reportVersion: "2026-05-mvp-4",
    receipt: {
      network: "eip155:2910",
      facilitator: "morph-official",
      facilitatorMode: "morph-official",
      amount: "0.20",
      atomicAmount: "200000",
      asset: "0x0000000000000000000000000000000000000001",
      transactionHash: "0xSENTINELTX",
      settledAt: "2026-05-22T12:00:00.000Z",
      payer: "0xSENTINELPAYER0000000000000000000000000000",
    },
    dataProvenance: {
      appMetadata: "live",
      keywordRank: "live",
      competitors: "live",
      recommendations: "inferred",
    },
    summary: "Test summary",
    keywordDiagnosis: [],
    competitorTrail: [],
    metadataScore: {
      overall: 72,
      weights: {
        title: 20,
        subtitle: 15,
        keywords: 20,
        screenshots: 10,
        ratingsAndReviews: 15,
        keywordRankings: 20,
      },
      title: { score: 80, notes: "ok" },
      subtitle: { score: 70, notes: "ok" },
      keywords: { score: 65, notes: "ok" },
      screenshots: { score: 60, notes: "ok" },
      ratingsAndReviews: { score: 75, notes: "ok" },
      keywordRankings: { score: 80, notes: "ok" },
      descriptionDensity: [],
    },
    keywordDistribution: [],
    recommendations: [],
    readyToPaste: {
      title: { current: "T", recommended: null, changeReason: null, charCount: 1, charLimit: 30 },
      subtitle: { current: "S", recommended: null, changeReason: null, charCount: 1, charLimit: 30 },
      keywordsField: { current: "K", recommended: null, changeReason: null, charCount: 1, charLimit: 100 },
      promotionalText: null,
      androidShortDescription: null,
      shortDescription: { current: "SD", recommended: null, changeReason: null, charCount: 2, charLimit: 240 },
      source: "deterministic",
    },
    suggestedKeywords: [],
    regressions: [],
    historySignature: "SENTINEL_HMAC_SIGNATURE",
    localizationAnalysis: null,
    targetAppSignals: null,
    packCredit: {
      wallet: "0xSENTINELWALLET00000000000000000000000000",
      creditsConsumed: 1,
      balanceRemaining: 4,
    },
  };
}

const REDACT_INPUT = {
  store: "ios" as const,
  country: "US",
  appId: "123456789",
  appName: "Test App",
  appDeveloper: "Test Studio",
  iconUrl: null,
  now: new Date("2026-05-22T12:00:00.000Z"),
};

describe("redactForShowcase — PII removal", () => {
  it("strips requestId / sniffId / receipt / historySignature / packCredit", () => {
    const { report } = redactForShowcase({
      ...REDACT_INPUT,
      report: buildPaidWithSentinels(),
    });

    // Type-level guarantee: TS would complain if any of these were on the
    // PublicShowcaseReport type. Runtime check belt-and-suspenders against
    // a future schema slip.
    const asAny = report as unknown as Record<string, unknown>;
    expect(asAny.requestId).toBeUndefined();
    expect(asAny.sniffId).toBeUndefined();
    expect(asAny.receipt).toBeUndefined();
    expect(asAny.historySignature).toBeUndefined();
    expect(asAny.packCredit).toBeUndefined();
  });

  it("serialized output contains no sentinel strings", () => {
    const { report } = redactForShowcase({
      ...REDACT_INPUT,
      report: buildPaidWithSentinels(),
    });
    const serialized = JSON.stringify(report);

    const sentinels = [
      "req_SENTINEL_REQ",
      "sniff_SENTINEL_SNIFF",
      "0xSENTINELTX",
      "0xSENTINELPAYER",
      "0xSENTINELWALLET",
      "SENTINEL_HMAC_SIGNATURE",
    ];
    for (const sentinel of sentinels) {
      expect(serialized).not.toContain(sentinel);
    }
  });

  it("retains the public report content (summary, score, dataProvenance)", () => {
    const paid = buildPaidWithSentinels();
    const { report } = redactForShowcase({ ...REDACT_INPUT, report: paid });
    expect(report.summary).toBe(paid.summary);
    expect(report.metadataScore.overall).toBe(72);
    expect(report.dataProvenance.appMetadata).toBe("live");
  });

  it("populates store/country/appId/showcasedAt and detectedApp identity", () => {
    const { report } = redactForShowcase({
      ...REDACT_INPUT,
      report: buildPaidWithSentinels(),
    });
    expect(report.store).toBe("ios");
    expect(report.country).toBe("US");
    expect(report.appId).toBe("123456789");
    expect(report.detectedApp.id).toBe("123456789");
    expect(report.detectedApp.name).toBe("Test App");
    expect(report.detectedApp.developer).toBe("Test Studio");
    expect(report.detectedApp.iconUrl).toBeNull();
    expect(report.showcasedAt).toBe("2026-05-22T12:00:00.000Z");
  });
});

describe("redactForShowcase — companion entry shape", () => {
  it("produces a ShowcaseEntry with same identity + score + settledAt", () => {
    const { entry } = redactForShowcase({
      ...REDACT_INPUT,
      report: buildPaidWithSentinels(),
    });
    expect(entry.store).toBe("ios");
    expect(entry.country).toBe("US");
    expect(entry.appId).toBe("123456789");
    expect(entry.appName).toBe("Test App");
    expect(entry.appDeveloper).toBe("Test Studio");
    expect(entry.overallScore).toBe(72);
    expect(entry.settledAt).toBe("2026-05-22T12:00:00.000Z");
  });

  it("entry never carries a PII field by accident", () => {
    const { entry } = redactForShowcase({
      ...REDACT_INPUT,
      report: buildPaidWithSentinels(),
    });
    const asAny = entry as unknown as Record<string, unknown>;
    expect(asAny.wallet).toBeUndefined();
    expect(asAny.payer).toBeUndefined();
    expect(asAny.transactionHash).toBeUndefined();
    expect(asAny.sniffId).toBeUndefined();
  });
});
