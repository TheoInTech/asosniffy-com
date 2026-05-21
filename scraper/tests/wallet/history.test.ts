import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetCacheClientForTests } from "../../src/cache/redis.js";
import {
  buildDedupeKey,
  getSniff,
  listSniffs,
  recordSniff,
  walletSniffsKey,
} from "../../src/wallet/history.js";
import { normalizeAddress } from "../../src/lib/address.js";
import type { DiagnosePaidResponse } from "../../src/schemas/index.js";

const WALLET_A = normalizeAddress("0x1111111111111111111111111111111111111111");
const WALLET_B = normalizeAddress("0x2222222222222222222222222222222222222222");

function makePaidResponse(sniffId: string, overall = 54): DiagnosePaidResponse {
  return {
    requestId: "req_test",
    sniffId,
    reportVersion: "test",
    receipt: {
      network: "eip155:2910",
      facilitator: "morph-official",
      facilitatorMode: "morph-official",
      amount: "0.10",
      atomicAmount: "100000",
      asset: "0x0000000000000000000000000000000000000001",
      transactionHash: "0xdeadbeef",
      settledAt: "2026-05-20T12:00:00.000Z",
      payer: WALLET_A,
    },
    dataProvenance: {
      appMetadata: "live",
      keywordRank: "live",
      competitors: "live",
      recommendations: "inferred",
    },
    summary: "test summary",
    keywordDiagnosis: [],
    competitorTrail: [],
    metadataScore: {
      overall,
      title: { score: 80, notes: "ok" },
      subtitle: { score: 25, notes: "empty" },
      keywords: { score: 50, notes: "ok" },
      screenshots: { score: 78, notes: "ok" },
    },
    recommendations: [],
    readyToPaste: {
      title: "",
      subtitle: "",
      keywordsField: "",
      shortDescription: "",
    },
    suggestedKeywords: [],
    regressions: [],
    historySignature: "",
    localizationAnalysis: null,
  } as DiagnosePaidResponse;
}

beforeEach(() => resetCacheClientForTests());
afterEach(() => resetCacheClientForTests());

describe("buildDedupeKey", () => {
  it("hashes (wallet, store, country, appId, keywords) — keyword order doesn't matter", () => {
    const a = buildDedupeKey({
      address: WALLET_A,
      store: "ios",
      country: "US",
      appId: "1",
      keywords: ["habit", "tracker"],
    });
    const b = buildDedupeKey({
      address: WALLET_A,
      store: "ios",
      country: "US",
      appId: "1",
      keywords: ["tracker", "habit"], // reordered
    });
    expect(a).toBe(b);
  });

  it("changes when wallet changes", () => {
    const a = buildDedupeKey({
      address: WALLET_A,
      store: "ios",
      country: "US",
      appId: "1",
      keywords: ["habit"],
    });
    const b = buildDedupeKey({
      address: WALLET_B,
      store: "ios",
      country: "US",
      appId: "1",
      keywords: ["habit"],
    });
    expect(a).not.toBe(b);
  });
});

describe("recordSniff + listSniffs", () => {
  it("indexes a sniff under the payer wallet and surfaces it in the list", async () => {
    const report = makePaidResponse("sniff_abc");
    await recordSniff({
      payer: WALLET_A,
      sniffId: "sniff_abc",
      store: "ios",
      country: "US",
      keywords: ["pickleball"],
      appId: "6762223327",
      appName: "Tally",
      appDeveloper: "Vincent Theo Roque",
      appIconUrl: null,
      overallScore: 54,
      appMetadataProvenance: "live",
      settledAt: "2026-05-20T12:00:00.000Z",
      report,
    });
    const list = await listSniffs({ address: WALLET_A });
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.sniffId).toBe("sniff_abc");
    expect(list.items[0]?.app.id).toBe("6762223327");
  });

  it("dedupes same (wallet, store, country, appId, keywordSet) into one entry", async () => {
    const r1 = makePaidResponse("sniff_first");
    await recordSniff({
      payer: WALLET_A,
      sniffId: "sniff_first",
      store: "ios",
      country: "US",
      keywords: ["habit", "tracker"],
      appId: "1",
      appName: "App",
      appDeveloper: "Dev",
      appIconUrl: null,
      overallScore: 50,
      appMetadataProvenance: "live",
      settledAt: "2026-05-20T12:00:00.000Z",
      report: r1,
    });
    // Same wallet re-runs same app+keywords — should reuse sniffId.
    const r2 = makePaidResponse("sniff_second");
    const canonical = await recordSniff({
      payer: WALLET_A,
      sniffId: "sniff_second",
      store: "ios",
      country: "US",
      keywords: ["tracker", "habit"], // reordered to test stability
      appId: "1",
      appName: "App",
      appDeveloper: "Dev",
      appIconUrl: null,
      overallScore: 55,
      appMetadataProvenance: "live",
      settledAt: "2026-05-20T13:00:00.000Z",
      report: r2,
    });
    expect(canonical).toBe("sniff_first");
    const list = await listSniffs({ address: WALLET_A });
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.sniffId).toBe("sniff_first");
  });

  it("isolates two wallets' histories", async () => {
    await recordSniff({
      payer: WALLET_A,
      sniffId: "sniff_a",
      store: "ios",
      country: "US",
      keywords: ["habit"],
      appId: "1",
      appName: "X",
      appDeveloper: "Y",
      appIconUrl: null,
      overallScore: 50,
      appMetadataProvenance: "live",
      settledAt: "2026-05-20T12:00:00.000Z",
      report: makePaidResponse("sniff_a"),
    });
    await recordSniff({
      payer: WALLET_B,
      sniffId: "sniff_b",
      store: "ios",
      country: "US",
      keywords: ["habit"],
      appId: "1",
      appName: "X",
      appDeveloper: "Y",
      appIconUrl: null,
      overallScore: 50,
      appMetadataProvenance: "live",
      settledAt: "2026-05-20T12:00:00.000Z",
      report: makePaidResponse("sniff_b"),
    });
    const listA = await listSniffs({ address: WALLET_A });
    const listB = await listSniffs({ address: WALLET_B });
    expect(listA.items.map((s) => s.sniffId)).toEqual(["sniff_a"]);
    expect(listB.items.map((s) => s.sniffId)).toEqual(["sniff_b"]);
  });

  it("returns empty list for unknown wallet (no existence oracle)", async () => {
    const list = await listSniffs({ address: WALLET_A });
    expect(list).toEqual({ items: [], nextCursor: null });
  });

  it("paginates with cursor (newest first)", async () => {
    // Insert 3 sniffs with increasing timestamps.
    for (let i = 0; i < 3; i++) {
      await recordSniff({
        payer: WALLET_A,
        sniffId: `sniff_${i}`,
        store: "ios",
        country: "US",
        keywords: [`kw${i}`],
        appId: String(i),
        appName: `App ${i}`,
        appDeveloper: "Dev",
        appIconUrl: null,
        overallScore: 50,
        appMetadataProvenance: "live",
        settledAt: new Date(2026, 4, 20, 12 + i).toISOString(),
        report: makePaidResponse(`sniff_${i}`),
      });
    }
    const page1 = await listSniffs({ address: WALLET_A, limit: 2 });
    expect(page1.items.map((s) => s.sniffId)).toEqual(["sniff_2", "sniff_1"]);
    expect(page1.nextCursor).toBeTruthy();
    const page2 = await listSniffs({
      address: WALLET_A,
      limit: 2,
      cursor: page1.nextCursor!,
    });
    expect(page2.items.map((s) => s.sniffId)).toEqual(["sniff_0"]);
    expect(page2.nextCursor).toBeNull();
  });
});

describe("getSniff", () => {
  it("returns the full report when the caller owns the sniff", async () => {
    const report = makePaidResponse("sniff_owned");
    await recordSniff({
      payer: WALLET_A,
      sniffId: "sniff_owned",
      store: "ios",
      country: "US",
      keywords: ["habit"],
      appId: "1",
      appName: "App",
      appDeveloper: "Dev",
      appIconUrl: null,
      overallScore: 50,
      appMetadataProvenance: "live",
      settledAt: "2026-05-20T12:00:00.000Z",
      report,
    });
    const fetched = await getSniff({ address: WALLET_A, sniffId: "sniff_owned" });
    expect(fetched?.sniffId).toBe("sniff_owned");
  });

  it("returns null (404) when another wallet tries to fetch — no enumeration oracle", async () => {
    await recordSniff({
      payer: WALLET_A,
      sniffId: "sniff_a_owned",
      store: "ios",
      country: "US",
      keywords: ["habit"],
      appId: "1",
      appName: "App",
      appDeveloper: "Dev",
      appIconUrl: null,
      overallScore: 50,
      appMetadataProvenance: "live",
      settledAt: "2026-05-20T12:00:00.000Z",
      report: makePaidResponse("sniff_a_owned"),
    });
    expect(
      await getSniff({ address: WALLET_B, sniffId: "sniff_a_owned" }),
    ).toBeNull();
  });

  it("returns null for non-existent sniffId", async () => {
    expect(
      await getSniff({ address: WALLET_A, sniffId: "sniff_does_not_exist" }),
    ).toBeNull();
  });
});

describe("key shape", () => {
  it("walletSniffsKey is lowercased + suffixed", () => {
    expect(walletSniffsKey(WALLET_A)).toBe(`wallet:${WALLET_A}:sniffs`);
  });
});
