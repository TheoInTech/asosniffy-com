import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseUnits } from "viem";

import { PaymentRequiredError } from "../../src/errors.js";
import { computePricing } from "../../src/payment/pricing.js";
import { buildPaymentRequirements } from "../../src/payment/requirements.js";
import { FacilitatorError } from "../../src/payment/facilitator/index.js";
import type {
  DiagnoseUnpaidResponse,
  Pricing,
  RequestId,
  SniffId,
} from "../../src/schemas/index.js";

// Mock the facilitator singleton before importing the helper module so the
// helper sees the test's controlled instance per call.
const verifyMock = vi.fn();
const settleMock = vi.fn();
const getFacilitatorMock = vi.fn();

vi.mock("../../src/services/facilitator.js", () => ({
  getFacilitator: () => getFacilitatorMock(),
  __resetFacilitatorForTests: () => {},
}));

const { settleX402Payment, verifyX402Payment } = await import(
  "../../src/payment/settlement.js"
);

const MERCHANT = "0x000000000000000000000000000000000000c0de";
const PAYER = `0x${"11".repeat(20)}`;
const REQUEST_ID = "req_settlement_test_001" as RequestId;
const SNIFF_ID = "sniff_settlement_test_001" as SniffId;

interface HeaderOpts {
  network?: string;
  value?: string;
  to?: string;
  validBeforeOffsetSec?: number;
}

function buildAuthHeader(opts: HeaderOpts = {}): string {
  const network = opts.network ?? "eip155:2910";
  // tests/setup.ts pins SNIFFY_PAYMENT_ASSET_DECIMALS=18 — match it.
  const value = opts.value ?? parseUnits("0.04", 18).toString();
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

function buildUnpaid(): DiagnoseUnpaidResponse {
  const pricing = computePricing({ keywords: ["a"] });
  return buildPaymentRequirements({
    sniffId: SNIFF_ID,
    pricing,
    resourceUrl: "/api/v1/aso/diagnose",
  });
}

function basePricing(): Pricing {
  return computePricing({ keywords: ["a"] });
}

beforeEach(() => {
  verifyMock.mockReset();
  settleMock.mockReset();
  getFacilitatorMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("verifyX402Payment — error mapping", () => {
  it("throws payment_required when header is missing", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const unpaidBody = buildUnpaid();
    await expect(
      verifyX402Payment({ paymentHeader: undefined, unpaidBody }),
    ).rejects.toMatchObject({
      name: "PaymentRequiredError",
      code: "payment_required",
    });
  });

  it("throws payment_required when header is whitespace-only", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const unpaidBody = buildUnpaid();
    await expect(
      verifyX402Payment({ paymentHeader: "   ", unpaidBody }),
    ).rejects.toMatchObject({ code: "payment_required" });
  });

  it("throws malformed_payment_header when header is not base64", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const unpaidBody = buildUnpaid();
    await expect(
      verifyX402Payment({
        paymentHeader: "!!!not-base64!!!",
        unpaidBody,
      }),
    ).rejects.toMatchObject({ code: "malformed_payment_header" });
  });

  it("throws wrong_network when payload network differs from MORPH_NETWORK env", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const unpaidBody = buildUnpaid();
    await expect(
      verifyX402Payment({
        paymentHeader: buildAuthHeader({ network: "eip155:1" }),
        unpaidBody,
      }),
    ).rejects.toMatchObject({ code: "wrong_network" });
  });

  it("throws expired_authorization when validBefore is in the past", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const unpaidBody = buildUnpaid();
    await expect(
      verifyX402Payment({
        paymentHeader: buildAuthHeader({ validBeforeOffsetSec: -10 }),
        unpaidBody,
      }),
    ).rejects.toMatchObject({ code: "expired_authorization" });
  });

  it("throws amount_mismatch when authorization.value differs from required", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const unpaidBody = buildUnpaid();
    await expect(
      verifyX402Payment({
        paymentHeader: buildAuthHeader({ value: "1" }),
        unpaidBody,
      }),
    ).rejects.toMatchObject({ code: "amount_mismatch" });
  });

  it("throws amount_mismatch when authorization.to does not match payTo", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const unpaidBody = buildUnpaid();
    await expect(
      verifyX402Payment({
        paymentHeader: buildAuthHeader({
          to: "0xdeadbeef00000000000000000000000000000000",
        }),
        unpaidBody,
      }),
    ).rejects.toMatchObject({ code: "amount_mismatch" });
  });

  it("throws verification_failed when facilitator returns isValid:false", async () => {
    verifyMock.mockResolvedValue({ isValid: false, invalidReason: "bad sig" });
    getFacilitatorMock.mockReturnValue({
      verify: verifyMock,
      settle: settleMock,
      baseUrl: "https://test.example.com/x402",
      getSupported: vi.fn(),
    });
    const unpaidBody = buildUnpaid();
    await expect(
      verifyX402Payment({
        paymentHeader: buildAuthHeader(),
        unpaidBody,
      }),
    ).rejects.toMatchObject({ code: "verification_failed" });
  });

  it("throws verification_failed when facilitator.verify throws FacilitatorError", async () => {
    verifyMock.mockRejectedValue(
      new FacilitatorError(500, { message: "boom" }, "morph 500"),
    );
    getFacilitatorMock.mockReturnValue({
      verify: verifyMock,
      settle: settleMock,
      baseUrl: "https://test.example.com/x402",
      getSupported: vi.fn(),
    });
    const unpaidBody = buildUnpaid();
    await expect(
      verifyX402Payment({
        paymentHeader: buildAuthHeader(),
        unpaidBody,
      }),
    ).rejects.toMatchObject({ code: "verification_failed" });
  });
});

describe("verifyX402Payment — success paths", () => {
  it("returns a VerifiedX402Context with auth + wirePayload + null facilitator in fixture mode", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const unpaidBody = buildUnpaid();
    const ctx = await verifyX402Payment({
      paymentHeader: buildAuthHeader(),
      unpaidBody,
    });
    expect(ctx.facilitator).toBeNull();
    expect(ctx.auth.from).toBe(PAYER);
    expect(ctx.wireRequirements).toEqual(unpaidBody.accepts[0]);
    // Wire payload shape: accepted MUST equal paymentRequirements deep-equal.
    expect(ctx.wirePaymentPayload.accepted).toEqual(unpaidBody.accepts[0]);
    expect(ctx.wirePaymentPayload.x402Version).toBe(2);
  });

  it("calls facilitator.verify with the exact paymentRequirements deep-equal to accepted", async () => {
    verifyMock.mockResolvedValue({ isValid: true });
    getFacilitatorMock.mockReturnValue({
      verify: verifyMock,
      settle: settleMock,
      baseUrl: "https://test.example.com/x402",
      getSupported: vi.fn(),
    });
    const unpaidBody = buildUnpaid();
    await verifyX402Payment({
      paymentHeader: buildAuthHeader(),
      unpaidBody,
    });
    expect(verifyMock).toHaveBeenCalledOnce();
    const call = verifyMock.mock.calls[0]?.[0] as {
      paymentPayload: { accepted: unknown };
      paymentRequirements: unknown;
    };
    expect(call.paymentPayload.accepted).toEqual(call.paymentRequirements);
  });
});

describe("settleX402Payment", () => {
  async function freshContext() {
    getFacilitatorMock.mockReturnValue(null);
    const unpaidBody = buildUnpaid();
    const context = await verifyX402Payment({
      paymentHeader: buildAuthHeader(),
      unpaidBody,
    });
    return { context, unpaidBody };
  }

  it("returns a fixture-receipt mode receipt when facilitator is null", async () => {
    const { context, unpaidBody } = await freshContext();
    const result = await settleX402Payment({
      context,
      pricing: basePricing(),
      sniffId: SNIFF_ID,
      requestId: REQUEST_ID,
      unpaidBody,
    });
    expect(result.mode).toBe("fixture-receipt");
    expect(result.receipt.facilitatorMode).toBe("fixture-receipt");
    expect(result.receipt.transactionHash.startsWith("0xsample")).toBe(true);
    expect(result.payer).toBe(PAYER.toLowerCase());
    expect(result.settleResponse).toBeUndefined();
  });

  it("calls facilitator.settle and returns morph-official mode on success", async () => {
    verifyMock.mockResolvedValue({ isValid: true });
    settleMock.mockResolvedValue({
      success: true,
      transaction: "0x" + "ab".repeat(32),
      network: "eip155:2910",
      payer: PAYER,
    });
    getFacilitatorMock.mockReturnValue({
      verify: verifyMock,
      settle: settleMock,
      baseUrl: "https://test.example.com/x402",
      getSupported: vi.fn(),
    });
    const unpaidBody = buildUnpaid();
    const context = await verifyX402Payment({
      paymentHeader: buildAuthHeader(),
      unpaidBody,
    });
    const result = await settleX402Payment({
      context,
      pricing: basePricing(),
      sniffId: SNIFF_ID,
      requestId: REQUEST_ID,
      unpaidBody,
    });
    expect(settleMock).toHaveBeenCalledOnce();
    expect(result.mode).toBe("morph-official");
    expect(result.receipt.facilitatorMode).toBe("morph-official");
    expect(result.receipt.transactionHash).toBe("0x" + "ab".repeat(32));
    expect(result.payer).toBe(PAYER.toLowerCase());
  });

  it("throws settlement_failed when facilitator.settle returns success:false", async () => {
    verifyMock.mockResolvedValue({ isValid: true });
    settleMock.mockResolvedValue({
      success: false,
      errorReason: "insufficient balance",
      network: "eip155:2910",
    });
    getFacilitatorMock.mockReturnValue({
      verify: verifyMock,
      settle: settleMock,
      baseUrl: "https://test.example.com/x402",
      getSupported: vi.fn(),
    });
    const unpaidBody = buildUnpaid();
    const context = await verifyX402Payment({
      paymentHeader: buildAuthHeader(),
      unpaidBody,
    });
    await expect(
      settleX402Payment({
        context,
        pricing: basePricing(),
        sniffId: SNIFF_ID,
        requestId: REQUEST_ID,
        unpaidBody,
      }),
    ).rejects.toMatchObject({
      code: "settlement_failed",
    });
  });

  it("throws settlement_failed when facilitator.settle throws FacilitatorError", async () => {
    verifyMock.mockResolvedValue({ isValid: true });
    settleMock.mockRejectedValue(
      new FacilitatorError(500, { message: "rpc dead" }, "morph 500"),
    );
    getFacilitatorMock.mockReturnValue({
      verify: verifyMock,
      settle: settleMock,
      baseUrl: "https://test.example.com/x402",
      getSupported: vi.fn(),
    });
    const unpaidBody = buildUnpaid();
    const context = await verifyX402Payment({
      paymentHeader: buildAuthHeader(),
      unpaidBody,
    });
    await expect(
      settleX402Payment({
        context,
        pricing: basePricing(),
        sniffId: SNIFF_ID,
        requestId: REQUEST_ID,
        unpaidBody,
      }),
    ).rejects.toBeInstanceOf(PaymentRequiredError);
  });

  it("falls back to auth.from as payer when settleResponse.payer is missing", async () => {
    verifyMock.mockResolvedValue({ isValid: true });
    settleMock.mockResolvedValue({
      success: true,
      transaction: "0x" + "cd".repeat(32),
      network: "eip155:2910",
      // payer omitted intentionally — Morph's /v2/settle treats it as optional.
    });
    getFacilitatorMock.mockReturnValue({
      verify: verifyMock,
      settle: settleMock,
      baseUrl: "https://test.example.com/x402",
      getSupported: vi.fn(),
    });
    const unpaidBody = buildUnpaid();
    const context = await verifyX402Payment({
      paymentHeader: buildAuthHeader(),
      unpaidBody,
    });
    const result = await settleX402Payment({
      context,
      pricing: basePricing(),
      sniffId: SNIFF_ID,
      requestId: REQUEST_ID,
      unpaidBody,
    });
    // payer falls back to auth.from (lowercased).
    expect(result.payer).toBe(PAYER.toLowerCase());
  });
});
