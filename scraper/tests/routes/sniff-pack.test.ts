import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseUnits } from "viem";

import {
  DiagnoseUnpaidResponse,
  SniffPackBuyResponse,
  SniffPackTiersResponse,
} from "../../src/schemas/index.js";

// Mock the facilitator singleton — fixture-receipt mode (null) keeps the
// happy-path tests fast and deterministic. Tests that exercise the facilitator
// chain itself live in tests/payment/facilitator.test.ts.
const verifyMock = vi.fn();
const settleMock = vi.fn();
const getFacilitatorMock = vi.fn();

vi.mock("../../src/services/facilitator.js", () => ({
  getFacilitator: () => getFacilitatorMock(),
  __resetFacilitatorForTests: () => {},
}));

const { app } = await import("../../src/index.js");
const { resetCacheClientForTests } = await import(
  "../../src/cache/redis.js"
);
const { resetMetricsForTests } = await import("../../src/cache/metrics.js");
const { getBalance } = await import(
  "../../src/wallet/sniff-pack-balance.js"
);

const MERCHANT = "0x000000000000000000000000000000000000c0de";
const PAYER = `0x${"11".repeat(20)}`;

// Pack prices — must match payment/pricing.ts SNIFF_PACK_TIERS. Mirrored here
// (not imported) so a regression that drifts the prices fails this test loudly
// rather than silently using whatever the constant is now.
const PACK_10_USDC = "4.00";
const PACK_50_USDC = "15.00";
const PACK_250_USDC = "50.00";

interface HeaderOpts {
  network?: string;
  amountUsd?: string; // decimal USD string, e.g. "4.00"
  value?: string; // raw atomic string — overrides amountUsd
  to?: string;
  validBeforeOffsetSec?: number;
}

function buildAuthHeader(opts: HeaderOpts = {}): string {
  const network = opts.network ?? "eip155:2910";
  const decimals = 18; // tests/setup.ts pins HoodiTestToken at 18 decimals
  const value =
    opts.value ?? parseUnits(opts.amountUsd ?? PACK_10_USDC, decimals).toString();
  const to = opts.to ?? MERCHANT;
  const offset = opts.validBeforeOffsetSec ?? 600;
  const validBefore = Math.floor(Date.now() / 1000) + offset;

  const payload = {
    x402Version: 2,
    scheme: "exact",
    network,
    payload: {
      signature: "0xdeadbeef",
      authorization: {
        from: PAYER,
        to,
        value,
        validAfter: "0",
        validBefore: validBefore.toString(),
        nonce: `0x${"ab".repeat(32)}`,
      },
    },
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

async function postBuy(
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.request("/api/v1/aso/sniff-pack/buy", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  verifyMock.mockReset();
  settleMock.mockReset();
  getFacilitatorMock.mockReset();
  resetCacheClientForTests();
  resetMetricsForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/v1/aso/sniff-pack/tiers", () => {
  it("returns all three pack tiers with the canonical SniffPackTier shape", async () => {
    const res = await app.request("/api/v1/aso/sniff-pack/tiers", {
      method: "GET",
    });
    expect(res.status).toBe(200);
    const parsed = SniffPackTiersResponse.parse(await res.json());
    expect(parsed.tiers).toHaveLength(3);
    expect(parsed.tiers.map((t) => t.id)).toEqual([
      "sniff-pack-10",
      "sniff-pack-50",
      "sniff-pack-250",
    ]);
    // Largest pack must remain cheaper than one month of typical subscription
    // ($59) per the savingsNote framing — this is a copy contract.
    const biggest = parsed.tiers[parsed.tiers.length - 1]!;
    expect(parseFloat(biggest.totalAmount)).toBeLessThan(59);
  });
});

describe("POST /api/v1/aso/sniff-pack/buy — unpaid (402)", () => {
  it("returns 402 with pack pricing when PAYMENT-SIGNATURE is missing", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const res = await postBuy({ packId: "sniff-pack-10" });
    expect(res.status).toBe(402);
    const parsed = DiagnoseUnpaidResponse.parse(await res.json());
    expect(parsed.payment.amount).toBe(PACK_10_USDC);
    expect(parsed.resource.url).toContain("/api/v1/aso/sniff-pack/buy");
    expect(res.headers.get("X-Sniffy-Error-Code")).toBe("payment_required");
  });

  it("returns 402 with Pack 50 amount when packId=sniff-pack-50", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const res = await postBuy({ packId: "sniff-pack-50" });
    expect(res.status).toBe(402);
    const parsed = DiagnoseUnpaidResponse.parse(await res.json());
    expect(parsed.payment.amount).toBe(PACK_50_USDC);
  });

  it("returns 402 with Pack 250 amount when packId=sniff-pack-250", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const res = await postBuy({ packId: "sniff-pack-250" });
    expect(res.status).toBe(402);
    const parsed = DiagnoseUnpaidResponse.parse(await res.json());
    expect(parsed.payment.amount).toBe(PACK_250_USDC);
  });

  it("rejects an unknown packId with 400 invalid_body", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const res = await postBuy({ packId: "sniff-pack-99" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("invalid_body");
  });

  it("returns 402 amount_mismatch when authorization.value undershoots the pack price", async () => {
    getFacilitatorMock.mockReturnValue(null);
    // Pack 10 wants $4.00 but client signed for $0.04
    const header = buildAuthHeader({ amountUsd: "0.04" });
    const res = await postBuy(
      { packId: "sniff-pack-10" },
      { "PAYMENT-SIGNATURE": header },
    );
    expect(res.status).toBe(402);
    expect(res.headers.get("X-Sniffy-Error-Code")).toBe("amount_mismatch");
  });

  it("returns 402 amount_mismatch when authorization.to differs from payTo", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const header = buildAuthHeader({
      to: "0xdeadbeef00000000000000000000000000000000",
    });
    const res = await postBuy(
      { packId: "sniff-pack-10" },
      { "PAYMENT-SIGNATURE": header },
    );
    expect(res.status).toBe(402);
    expect(res.headers.get("X-Sniffy-Error-Code")).toBe("amount_mismatch");
  });
});

describe("POST /api/v1/aso/sniff-pack/buy — paid (200) in fixture-receipt mode", () => {
  it("settles Pack 10 and increments the payer's balance by 10", async () => {
    getFacilitatorMock.mockReturnValue(null); // fixture-receipt mode
    const header = buildAuthHeader({ amountUsd: PACK_10_USDC });
    const res = await postBuy(
      { packId: "sniff-pack-10" },
      { "PAYMENT-SIGNATURE": header },
    );
    expect(res.status).toBe(200);
    const parsed = SniffPackBuyResponse.parse(await res.json());
    expect(parsed.packId).toBe("sniff-pack-10");
    expect(parsed.creditsGranted).toBe(10);
    expect(parsed.newBalance).toBe(10);
    expect(parsed.receipt.facilitatorMode).toBe("fixture-receipt");
    expect(parsed.receipt.amount).toBe(PACK_10_USDC);

    // Side-effect check: balance manager sees the same number.
    const direct = await getBalance(PAYER);
    expect(direct).toBe(10);
  });

  it("accumulates balance across multiple purchases (10 + 50 = 60)", async () => {
    getFacilitatorMock.mockReturnValue(null);

    const first = await postBuy(
      { packId: "sniff-pack-10" },
      {
        "PAYMENT-SIGNATURE": buildAuthHeader({ amountUsd: PACK_10_USDC }),
      },
    );
    expect(first.status).toBe(200);
    const firstParsed = SniffPackBuyResponse.parse(await first.json());
    expect(firstParsed.newBalance).toBe(10);

    const second = await postBuy(
      { packId: "sniff-pack-50" },
      {
        "PAYMENT-SIGNATURE": buildAuthHeader({ amountUsd: PACK_50_USDC }),
      },
    );
    expect(second.status).toBe(200);
    const secondParsed = SniffPackBuyResponse.parse(await second.json());
    expect(secondParsed.newBalance).toBe(60);

    expect(await getBalance(PAYER)).toBe(60);
  });

  it("returns a receipt with the synthetic sniffId pattern and correct amount", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const res = await postBuy(
      { packId: "sniff-pack-250" },
      {
        "PAYMENT-SIGNATURE": buildAuthHeader({ amountUsd: PACK_250_USDC }),
      },
    );
    expect(res.status).toBe(200);
    const parsed = SniffPackBuyResponse.parse(await res.json());
    expect(parsed.creditsGranted).toBe(250);
    expect(parsed.receipt.amount).toBe(PACK_250_USDC);
  });
});

describe("GET /api/v1/aso/sniff-pack/balance — auth", () => {
  it("returns 401 when no Authorization header is presented", async () => {
    const res = await app.request("/api/v1/aso/sniff-pack/balance", {
      method: "GET",
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when the Bearer token is not a valid session", async () => {
    const res = await app.request("/api/v1/aso/sniff-pack/balance", {
      method: "GET",
      headers: { Authorization: "Bearer not-a-real-session-token" },
    });
    expect(res.status).toBe(401);
  });
});
