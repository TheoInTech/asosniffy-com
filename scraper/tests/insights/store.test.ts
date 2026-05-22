import { beforeEach, describe, expect, it } from "vitest";

import { resetCacheClientForTests } from "../../src/cache/redis.js";
import {
  getShowcaseReport,
  listRecentShowcase,
  saveShowcase,
} from "../../src/insights/store.js";
import { redactForShowcase } from "../../src/lib/redact-for-showcase.js";
import type { DiagnosePaidResponse } from "../../src/schemas/index.js";

function buildPaidStub(appName = "Test App"): DiagnosePaidResponse {
  return {
    requestId: "req_test",
    sniffId: "sniff_test",
    reportVersion: "2026-05-mvp-4",
    receipt: {
      network: "eip155:2910",
      facilitator: "morph-official",
      facilitatorMode: "morph-official",
      amount: "0.20",
      atomicAmount: "200000",
      asset: "0x0000000000000000000000000000000000000001",
      transactionHash: "0xdeadbeef",
      settledAt: "2026-05-22T12:00:00.000Z",
    },
    dataProvenance: {
      appMetadata: "live",
      keywordRank: "live",
      competitors: "live",
      recommendations: "inferred",
    },
    summary: `Summary for ${appName}`,
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
    historySignature: "",
    localizationAnalysis: null,
    targetAppSignals: null,
    packCredit: null,
  };
}

function buildShowcase(appId: string, appName: string, settledAt: string) {
  return redactForShowcase({
    report: buildPaidStub(appName),
    store: "ios",
    country: "US",
    appId,
    appName,
    appDeveloper: "Test Studio",
    iconUrl: null,
    now: new Date(settledAt),
  });
}

describe("insights/store", () => {
  beforeEach(() => {
    resetCacheClientForTests();
  });

  describe("save + get round-trip", () => {
    it("round-trips a saved report via getShowcaseReport", async () => {
      const { entry, report } = buildShowcase(
        "111",
        "Round Trip",
        "2026-05-22T12:00:00.000Z",
      );
      await saveShowcase({ entry, report });
      const fetched = await getShowcaseReport("ios", "US", "111");
      expect(fetched).not.toBeNull();
      expect(fetched?.detectedApp.name).toBe("Round Trip");
      expect(fetched?.summary).toBe("Summary for Round Trip");
      expect(fetched?.showcasedAt).toBe("2026-05-22T12:00:00.000Z");
    });

    it("returns null for an unknown tuple", async () => {
      expect(await getShowcaseReport("ios", "US", "unknown-id")).toBeNull();
      expect(await getShowcaseReport("ios", "GB", "111")).toBeNull();
    });

    it("re-saving the same tuple overwrites the previous report", async () => {
      const first = buildShowcase("111", "First", "2026-05-22T11:00:00.000Z");
      const second = buildShowcase("111", "Second", "2026-05-22T13:00:00.000Z");
      await saveShowcase(first);
      await saveShowcase(second);
      const fetched = await getShowcaseReport("ios", "US", "111");
      expect(fetched?.detectedApp.name).toBe("Second");
      expect(fetched?.showcasedAt).toBe("2026-05-22T13:00:00.000Z");
    });
  });

  describe("listRecentShowcase ordering + filtering", () => {
    it("returns entries newest-first", async () => {
      await saveShowcase(
        buildShowcase("111", "Oldest", "2026-05-22T10:00:00.000Z"),
      );
      await saveShowcase(
        buildShowcase("222", "Middle", "2026-05-22T11:00:00.000Z"),
      );
      await saveShowcase(
        buildShowcase("333", "Newest", "2026-05-22T12:00:00.000Z"),
      );
      const { entries, freshestAt } = await listRecentShowcase({
        store: "ios",
        country: "US",
      });
      expect(entries.map((e) => e.appId)).toEqual(["333", "222", "111"]);
      expect(freshestAt).toBe("2026-05-22T12:00:00.000Z");
    });

    it("respects the limit param", async () => {
      for (let i = 0; i < 5; i++) {
        await saveShowcase(
          buildShowcase(
            `app_${i}`,
            `App ${i}`,
            new Date(2026, 0, 1, 12, i).toISOString(),
          ),
        );
      }
      const { entries } = await listRecentShowcase({
        store: "ios",
        country: "US",
        limit: 2,
      });
      expect(entries).toHaveLength(2);
    });

    it("returns empty list for an empty store/country bucket", async () => {
      const { entries, freshestAt } = await listRecentShowcase({
        store: "android",
        country: "GB",
      });
      expect(entries).toEqual([]);
      expect(freshestAt).toBeNull();
    });

    it("defaults to (ios, US) when no filters are passed", async () => {
      await saveShowcase(
        buildShowcase("111", "Default", "2026-05-22T12:00:00.000Z"),
      );
      const { entries } = await listRecentShowcase();
      expect(entries).toHaveLength(1);
      expect(entries[0]?.appId).toBe("111");
    });
  });
});
