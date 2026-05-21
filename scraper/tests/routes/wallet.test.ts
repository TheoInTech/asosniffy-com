import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { app } from "../../src/index.js";
import { resetCacheClientForTests } from "../../src/cache/redis.js";
import { recordSniff } from "../../src/wallet/history.js";
import { normalizeAddress } from "../../src/lib/address.js";
import type { DiagnosePaidResponse } from "../../src/schemas/index.js";

// Routes integration tests for /api/v1/aso/wallet/*. Exercises the full
// HTTP layer end-to-end: nonce mint, SIWE exchange, list, sniff replay,
// logout. SIWE messages are constructed and signed in-test via viem.

const DOMAIN = "localhost:3000";
const URI = "http://localhost:3000/trail";
// tests/setup.ts pins MORPH_NETWORK=eip155:2910 (Hoodi) — chainId follows.
const CHAIN_ID = 2910;

beforeEach(() => resetCacheClientForTests());
afterEach(() => resetCacheClientForTests());

interface SiweArgs {
  domain: string;
  address: string;
  nonce: string;
  chainId?: number;
  uri?: string;
  issuedAt?: string;
}

function buildSiwe(a: SiweArgs): string {
  return [
    `${a.domain} wants you to sign in with your Ethereum account:`,
    a.address,
    "",
    `URI: ${a.uri ?? URI}`,
    "Version: 1",
    `Chain ID: ${a.chainId ?? CHAIN_ID}`,
    `Nonce: ${a.nonce}`,
    `Issued At: ${a.issuedAt ?? new Date().toISOString()}`,
  ].join("\n");
}

async function provisionSession(domain = DOMAIN, chainId = CHAIN_ID) {
  const account = privateKeyToAccount(generatePrivateKey());
  const nonceRes = await app.request("/api/v1/aso/wallet/nonce", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: account.address }),
  });
  expect(nonceRes.status).toBe(200);
  const nonceBody = (await nonceRes.json()) as { nonce: string };
  const message = buildSiwe({
    domain,
    address: account.address,
    nonce: nonceBody.nonce,
    chainId,
  });
  const signature = await account.signMessage({ message });
  const sessionRes = await app.request("/api/v1/aso/wallet/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  return { account, sessionRes };
}

function makePaidResponse(sniffId: string, payer: string): DiagnosePaidResponse {
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
      payer,
    },
    dataProvenance: {
      appMetadata: "live",
      keywordRank: "live",
      competitors: "live",
      recommendations: "inferred",
    },
    summary: "test",
    keywordDiagnosis: [],
    competitorTrail: [],
    metadataScore: {
      overall: 54,
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

describe("POST /api/v1/aso/wallet/nonce", () => {
  it("returns a nonce + domain", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const res = await app.request("/api/v1/aso/wallet/nonce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: account.address }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { nonce: string; domain: string; expiresAt: string };
    expect(body.nonce.length).toBeGreaterThanOrEqual(8);
    expect(body.domain).toBeTruthy();
    expect(body.expiresAt).toBeTruthy();
  });

  it("400 on invalid address", async () => {
    const res = await app.request("/api/v1/aso/wallet/nonce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "not-a-real-address" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/aso/wallet/session", () => {
  it("issues a session token on valid SIWE", async () => {
    const { sessionRes } = await provisionSession();
    expect(sessionRes.status).toBe(200);
    const body = (await sessionRes.json()) as {
      sessionToken: string;
      address: string;
      expiresAt: string;
    };
    expect(body.sessionToken).toMatch(/^sniffy_sess_/);
  });

  it("401 chain_mismatch on wrong chainId", async () => {
    // Use ETH Mainnet (1) — guaranteed to differ from the active Morph chain
    // pinned by tests/setup.ts.
    const { sessionRes } = await provisionSession(DOMAIN, 1);
    expect(sessionRes.status).toBe(401);
    const body = (await sessionRes.json()) as { error: { code: string } };
    expect(body.error.code).toBe("chain_mismatch");
  });

  it("401 domain_mismatch on unknown domain", async () => {
    const { sessionRes } = await provisionSession("phishing.example.com");
    expect(sessionRes.status).toBe(401);
    const body = (await sessionRes.json()) as { error: { code: string } };
    expect(body.error.code).toBe("domain_mismatch");
  });

  it("401 on replayed (consumed) nonce", async () => {
    const { account } = await provisionSession();
    // First call consumed the nonce; mint a new one for a fresh attempt.
    const account2 = account; // same wallet, new nonce
    const nonceRes = await app.request("/api/v1/aso/wallet/nonce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: account2.address }),
    });
    const nonceBody = (await nonceRes.json()) as { nonce: string };
    const message = buildSiwe({
      domain: DOMAIN,
      address: account2.address,
      nonce: nonceBody.nonce,
    });
    const signature = await account2.signMessage({ message });
    const a = await app.request("/api/v1/aso/wallet/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
    expect(a.status).toBe(200);
    const b = await app.request("/api/v1/aso/wallet/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
    expect(b.status).toBe(401);
    const body = (await b.json()) as { error: { code: string } };
    expect(body.error.code).toBe("nonce_invalid");
  });
});

describe("GET /api/v1/aso/wallet/sniffs (bearer-auth list)", () => {
  it("401 without a Bearer token", async () => {
    const res = await app.request("/api/v1/aso/wallet/sniffs");
    expect(res.status).toBe(401);
  });

  it("returns an empty list for a fresh wallet (no existence oracle)", async () => {
    const { sessionRes } = await provisionSession();
    const { sessionToken } = (await sessionRes.json()) as { sessionToken: string };
    const res = await app.request("/api/v1/aso/wallet/sniffs", {
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], nextCursor: null });
  });

  it("surfaces an indexed sniff for the owning wallet", async () => {
    const { account, sessionRes } = await provisionSession();
    const { sessionToken } = (await sessionRes.json()) as { sessionToken: string };
    const payer = normalizeAddress(account.address);
    await recordSniff({
      payer,
      sniffId: "sniff_routed",
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
      report: makePaidResponse("sniff_routed", payer),
    });
    const res = await app.request("/api/v1/aso/wallet/sniffs", {
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    const body = (await res.json()) as { items: Array<{ sniffId: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.sniffId).toBe("sniff_routed");
  });
});

describe("GET /api/v1/aso/wallet/sniff/:sniffId", () => {
  it("404 (not 403) when another wallet tries to fetch", async () => {
    // Wallet A records a sniff.
    const accountA = privateKeyToAccount(generatePrivateKey());
    const payerA = normalizeAddress(accountA.address);
    await recordSniff({
      payer: payerA,
      sniffId: "sniff_A",
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
      report: makePaidResponse("sniff_A", payerA),
    });
    // Wallet B tries to read it.
    const { sessionRes } = await provisionSession();
    const { sessionToken } = (await sessionRes.json()) as { sessionToken: string };
    const res = await app.request("/api/v1/aso/wallet/sniff/sniff_A", {
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    expect(res.status).toBe(404);
  });

  it("returns the full report for the owning wallet", async () => {
    const { account, sessionRes } = await provisionSession();
    const { sessionToken } = (await sessionRes.json()) as { sessionToken: string };
    const payer = normalizeAddress(account.address);
    await recordSniff({
      payer,
      sniffId: "sniff_owned",
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
      report: makePaidResponse("sniff_owned", payer),
    });
    const res = await app.request("/api/v1/aso/wallet/sniff/sniff_owned", {
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as DiagnosePaidResponse;
    expect(body.sniffId).toBe("sniff_owned");
  });
});

describe("DELETE /api/v1/aso/wallet/session", () => {
  it("revokes the session so subsequent calls return 401", async () => {
    const { sessionRes } = await provisionSession();
    const { sessionToken } = (await sessionRes.json()) as { sessionToken: string };
    const del = await app.request("/api/v1/aso/wallet/session", {
      method: "DELETE",
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    expect(del.status).toBe(204);
    const after = await app.request("/api/v1/aso/wallet/sniffs", {
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    expect(after.status).toBe(401);
  });
});
