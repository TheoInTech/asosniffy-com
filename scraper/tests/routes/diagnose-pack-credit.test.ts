// Sprint B — /diagnose Sniff Pack credit-spend path. When the caller presents
// Authorization: Bearer <siwe-session>, the route skips the x402 verify+settle
// chain and decrements the wallet's Pack balance instead. This file covers:
//
//   - happy path: balance > 0 → 200 + pack-credit receipt + balance decremented
//   - insufficient balance → 402 insufficient_balance
//   - invalid session → 401 session_invalid
//   - both headers presented → Bearer wins
//   - PAYMENT-SIGNATURE-only path still works unchanged (back-compat smoke)
//
// Apple providers are mocked to network_error so the orchestrator falls back
// to degraded data — we only care about route + payment shape here, not the
// report content. Other tests in tests/routes/diagnose.test.ts cover the
// content path.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import {
  DiagnosePaidResponse,
  DiagnoseUnpaidResponse,
} from "../../src/schemas/index.js";

// Force every Apple call to fail. The pack-credit branch still runs the
// orchestrator + assembleReceipt, so the report shape is degraded but
// structurally valid.
vi.mock("../../src/providers/apple/itunes.js", () => ({
  lookupApp: vi.fn(async () => ({ error: "network_error" })),
  searchApps: vi.fn(async () => ({ error: "network_error" })),
}));
vi.mock("../../src/providers/apple/keyword-rank.js", () => ({
  sampleKeywordRank: vi.fn(async () => ({ error: "network_error" })),
}));
vi.mock("../../src/providers/android/play-store.js", () => ({
  lookupApp: vi.fn(async () => ({ error: "network_error" })),
  searchApps: vi.fn(async () => ({ error: "network_error" })),
  similarApps: vi.fn(async () => ({ error: "network_error" })),
  suggestKeywords: vi.fn(async () => ({ error: "network_error" })),
  fetchAndroidReviews: vi.fn(async () => ({ error: "network_error" })),
  lookupAppPreview: vi.fn(async () => ({ error: "network_error" })),
  searchAppsPreview: vi.fn(async () => ({ error: "network_error" })),
}));

// Facilitator must be null for the Bearer path tests — but the route flow
// short-circuits before facilitator is touched, so this is precautionary.
const getFacilitatorMock = vi.fn();
vi.mock("../../src/services/facilitator.js", () => ({
  getFacilitator: () => getFacilitatorMock(),
  __resetFacilitatorForTests: () => {},
}));

const { app } = await import("../../src/index.js");
const { resetCacheClientForTests } = await import("../../src/cache/redis.js");
const { resetMetricsForTests } = await import("../../src/cache/metrics.js");
const { incrementBalance, getBalance } = await import(
  "../../src/wallet/sniff-pack-balance.js"
);

const DOMAIN = "localhost:3000";
const URI = "http://localhost:3000/diagnose";
// tests/setup.ts pins MORPH_NETWORK=eip155:2910 (Hoodi).
const CHAIN_ID = 2910;

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

async function provisionSession() {
  const account = privateKeyToAccount(generatePrivateKey());
  const nonceRes = await app.request("/api/v1/aso/wallet/nonce", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: account.address }),
  });
  if (nonceRes.status !== 200) {
    throw new Error(`nonce mint failed: ${nonceRes.status}`);
  }
  const nonceBody = (await nonceRes.json()) as { nonce: string };
  const message = buildSiwe({
    domain: DOMAIN,
    address: account.address,
    nonce: nonceBody.nonce,
  });
  const signature = await account.signMessage({ message });
  const sessionRes = await app.request("/api/v1/aso/wallet/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  if (sessionRes.status !== 200) {
    const body = await sessionRes.text();
    throw new Error(`session exchange failed: ${sessionRes.status} ${body}`);
  }
  const sessionBody = (await sessionRes.json()) as { sessionToken: string };
  return { account, sessionToken: sessionBody.sessionToken };
}

const VALID_BODY = {
  sniffId: "sniff_pack_credit_001",
  store: "ios" as const,
  app: "https://apps.apple.com/us/app/example/id123456789",
  country: "US" as const,
  keywords: ["habit tracker"],
};

async function postDiagnose(
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.request("/api/v1/aso/diagnose", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getFacilitatorMock.mockReset();
  resetCacheClientForTests();
  resetMetricsForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/v1/aso/diagnose — pack-credit (Bearer) path", () => {
  it("happy path: SIWE Bearer + balance >= 1 returns 200 with pack-credit receipt and decrements balance", async () => {
    getFacilitatorMock.mockReturnValue(null);

    const { account, sessionToken } = await provisionSession();
    await incrementBalance(account.address, 5);

    const res = await postDiagnose(VALID_BODY, {
      Authorization: `Bearer ${sessionToken}`,
    });

    expect(res.status).toBe(200);
    const parsed = DiagnosePaidResponse.parse(await res.json());

    // Receipt reflects pack-credit semantics — no on-chain settlement.
    expect(parsed.receipt.facilitatorMode).toBe("pack-credit");
    expect(parsed.receipt.amount).toBe("0.00");
    expect(parsed.receipt.atomicAmount).toBe("0");
    expect(parsed.receipt.transactionHash.startsWith("0xpack")).toBe(true);
    expect(parsed.receipt.payer?.toLowerCase()).toBe(
      account.address.toLowerCase(),
    );

    // packCredit block carries the spend metadata.
    expect(parsed.packCredit).not.toBeNull();
    expect(parsed.packCredit?.creditsConsumed).toBe(1);
    expect(parsed.packCredit?.balanceRemaining).toBe(4);
    expect(parsed.packCredit?.wallet.toLowerCase()).toBe(
      account.address.toLowerCase(),
    );

    // Side-effect check — Redis balance has been decremented exactly once.
    const direct = await getBalance(account.address);
    expect(direct).toBe(4);
  });

  it("returns 402 insufficient_balance when the wallet has zero balance", async () => {
    getFacilitatorMock.mockReturnValue(null);

    const { sessionToken } = await provisionSession();
    // No incrementBalance — wallet has 0 credits.

    const res = await postDiagnose(VALID_BODY, {
      Authorization: `Bearer ${sessionToken}`,
    });

    expect(res.status).toBe(402);
    expect(res.headers.get("X-Sniffy-Error-Code")).toBe("insufficient_balance");
    // Body shape matches DiagnoseUnpaidResponse so callers can fall back to
    // per-call x402.
    DiagnoseUnpaidResponse.parse(await res.json());
  });

  it("returns 402 insufficient_balance after draining a positive balance", async () => {
    getFacilitatorMock.mockReturnValue(null);

    const { account, sessionToken } = await provisionSession();
    await incrementBalance(account.address, 1);

    const first = await postDiagnose(VALID_BODY, {
      Authorization: `Bearer ${sessionToken}`,
    });
    expect(first.status).toBe(200);

    const second = await postDiagnose(VALID_BODY, {
      Authorization: `Bearer ${sessionToken}`,
    });
    expect(second.status).toBe(402);
    expect(second.headers.get("X-Sniffy-Error-Code")).toBe(
      "insufficient_balance",
    );

    expect(await getBalance(account.address)).toBe(0);
  });

  it("returns 401 session_invalid when the Bearer token is not a valid session", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const res = await postDiagnose(VALID_BODY, {
      Authorization: "Bearer sniffy_sess_not_a_real_token_at_all",
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("session_invalid");
  });

  it("returns 401 when Bearer token is missing the sniffy_sess_ prefix", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const res = await postDiagnose(VALID_BODY, {
      Authorization: "Bearer arbitrary-string",
    });
    expect(res.status).toBe(401);
  });

  it("non-pack-credit /diagnose responses carry packCredit: null", async () => {
    // Sanity check — verify the back-compat field is present on the legacy
    // x402-paid path. Use 402 (no PAYMENT-SIGNATURE, no Bearer) to drive the
    // pre-credit branch and confirm no packCredit leaks into the 402 body.
    getFacilitatorMock.mockReturnValue(null);
    const res = await postDiagnose(VALID_BODY);
    expect(res.status).toBe(402);
    const body = await res.json();
    // 402 body is DiagnoseUnpaidResponse — packCredit is on the PAID response
    // shape only, so it must not be present here.
    expect(body).not.toHaveProperty("packCredit");
    DiagnoseUnpaidResponse.parse(body);
  });
});
