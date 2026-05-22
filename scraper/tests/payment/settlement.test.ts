import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseUnits } from "viem";

import { resetCacheClientForTests } from "../../src/cache/redis.js";
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
  nonce?: string;
}

function buildAuthHeader(opts: HeaderOpts = {}): string {
  const network = opts.network ?? "eip155:2910";
  // tests/setup.ts pins SNIFFY_PAYMENT_ASSET_DECIMALS=18 — match it.
  const value = opts.value ?? parseUnits("0.04", 18).toString();
  const to = opts.to ?? MERCHANT;
  const offset = opts.validBeforeOffsetSec ?? 600;
  const validBefore = Math.floor(Date.now() / 1000) + offset;
  const nonce = opts.nonce ?? `0x${"ab".repeat(32)}`;

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
        nonce,
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
  // The settle idempotency layer caches (auth.from, auth.nonce) results in
  // the shared CacheClient singleton — reset between tests so per-test
  // assertions about facilitator call counts aren't polluted by a prior
  // test's cached success/failure entry.
  resetCacheClientForTests();
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

  it("surfaces nonce-conflict errorReason verbatim when facilitator returns success:false with empty fields", async () => {
    // Production repro: Morph returns the failure body
    //   { success:false, errorReason:"transaction exists, from nonce conflict: …",
    //     transaction:"", network:"" }
    // The discriminated-union schema must allow this to parse so the
    // existing success-false branch surfaces errorReason verbatim in the
    // PaymentRequiredError.message — replacing the previous
    // "transaction: Invalid; network: CAIP-2 identifier" schema-drift mask.
    const errorReason =
      "transaction exists, from nonce conflict: from=0xd259649c98B416E4D898c34a1C8206f676E06D40, nonce=0x283455a367ead982ca743572aefc0159664b431310449048d086072c843d7109";
    verifyMock.mockResolvedValue({ isValid: true });
    settleMock.mockResolvedValue({
      success: false,
      errorReason,
      transaction: "",
      network: "",
    });
    getFacilitatorMock.mockReturnValue({
      verify: verifyMock,
      settle: settleMock,
      baseUrl: "https://test.example.com/x402",
      getSupported: vi.fn(),
    });
    const unpaidBody = buildUnpaid();
    const context = await verifyX402Payment({
      paymentHeader: buildAuthHeader({ nonce: `0x${"01".repeat(32)}` }),
      unpaidBody,
    });
    let captured: unknown;
    try {
      await settleX402Payment({
        context,
        pricing: basePricing(),
        sniffId: SNIFF_ID,
        requestId: REQUEST_ID,
        unpaidBody,
      });
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(PaymentRequiredError);
    const err = captured as PaymentRequiredError;
    expect(err.code).toBe("settlement_failed");
    expect(err.message).toContain("transaction exists, from nonce conflict");
    expect(err.message).toContain("nonce=0x283455a3");
  });
});

describe("settleX402Payment — idempotency", () => {
  function mockSuccessfulFacilitator(): void {
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
  }

  it("short-circuits to the cached receipt on a duplicate settle with the same auth nonce", async () => {
    mockSuccessfulFacilitator();
    const unpaidBody = buildUnpaid();
    const nonce = `0x${"02".repeat(32)}`;

    const firstContext = await verifyX402Payment({
      paymentHeader: buildAuthHeader({ nonce }),
      unpaidBody,
    });
    const first = await settleX402Payment({
      context: firstContext,
      pricing: basePricing(),
      sniffId: SNIFF_ID,
      requestId: REQUEST_ID,
      unpaidBody,
    });
    expect(settleMock).toHaveBeenCalledOnce();
    expect(first.mode).toBe("morph-official");
    expect(first.receipt.transactionHash).toBe("0x" + "ab".repeat(32));

    const secondContext = await verifyX402Payment({
      paymentHeader: buildAuthHeader({ nonce }),
      unpaidBody,
    });
    const second = await settleX402Payment({
      context: secondContext,
      pricing: basePricing(),
      sniffId: SNIFF_ID,
      requestId: REQUEST_ID,
      unpaidBody,
    });
    // Facilitator must NOT have been called a second time — the cached
    // receipt was replayed. Same tx hash + same payer.
    expect(settleMock).toHaveBeenCalledOnce();
    expect(second.receipt.transactionHash).toBe("0x" + "ab".repeat(32));
    expect(second.payer).toBe(first.payer);
  });

  it("replays the cached settlement_failed error on a duplicate settle, without re-hitting the facilitator", async () => {
    verifyMock.mockResolvedValue({ isValid: true });
    settleMock.mockResolvedValue({
      success: false,
      errorReason: "insufficient balance",
      transaction: "",
      network: "",
    });
    getFacilitatorMock.mockReturnValue({
      verify: verifyMock,
      settle: settleMock,
      baseUrl: "https://test.example.com/x402",
      getSupported: vi.fn(),
    });
    const unpaidBody = buildUnpaid();
    const nonce = `0x${"03".repeat(32)}`;

    const firstContext = await verifyX402Payment({
      paymentHeader: buildAuthHeader({ nonce }),
      unpaidBody,
    });
    await expect(
      settleX402Payment({
        context: firstContext,
        pricing: basePricing(),
        sniffId: SNIFF_ID,
        requestId: REQUEST_ID,
        unpaidBody,
      }),
    ).rejects.toMatchObject({ code: "settlement_failed" });

    const secondContext = await verifyX402Payment({
      paymentHeader: buildAuthHeader({ nonce }),
      unpaidBody,
    });
    await expect(
      settleX402Payment({
        context: secondContext,
        pricing: basePricing(),
        sniffId: SNIFF_ID,
        requestId: REQUEST_ID,
        unpaidBody,
      }),
    ).rejects.toMatchObject({
      code: "settlement_failed",
      message: expect.stringContaining("insufficient balance"),
    });
    // Failure was cached — only one facilitator call across both attempts.
    expect(settleMock).toHaveBeenCalledOnce();
  });

  it("concurrent settles with the same auth nonce: one wins, the other gets in_flight 402", async () => {
    // Hold the facilitator response open so both calls are in-flight at the
    // same moment. Without idempotency both would hit settle and the second
    // would 'succeed' twice with the same nonce — in production Morph
    // would reject the second submission with "transaction exists, from
    // nonce conflict".
    let releaseSettle!: (value: unknown) => void;
    const settlePending = new Promise((resolve) => {
      releaseSettle = resolve;
    });
    verifyMock.mockResolvedValue({ isValid: true });
    settleMock.mockReturnValue(settlePending);
    getFacilitatorMock.mockReturnValue({
      verify: verifyMock,
      settle: settleMock,
      baseUrl: "https://test.example.com/x402",
      getSupported: vi.fn(),
    });

    const unpaidBody = buildUnpaid();
    const nonce = `0x${"04".repeat(32)}`;

    const ctxA = await verifyX402Payment({
      paymentHeader: buildAuthHeader({ nonce }),
      unpaidBody,
    });
    const ctxB = await verifyX402Payment({
      paymentHeader: buildAuthHeader({ nonce }),
      unpaidBody,
    });

    const aPromise = settleX402Payment({
      context: ctxA,
      pricing: basePricing(),
      sniffId: SNIFF_ID,
      requestId: REQUEST_ID,
      unpaidBody,
    });
    // Yield so A has time to take the in_flight slot before B starts.
    await new Promise((r) => setImmediate(r));
    const bPromise = settleX402Payment({
      context: ctxB,
      pricing: basePricing(),
      sniffId: SNIFF_ID,
      requestId: REQUEST_ID,
      unpaidBody,
    });

    // B should reject immediately with the in_flight 402 — A's settle is
    // still pending so this can be awaited first.
    await expect(bPromise).rejects.toMatchObject({
      code: "settlement_failed",
      message: expect.stringContaining("already in flight"),
    });

    // Now let A complete.
    releaseSettle({
      success: true,
      transaction: "0x" + "ef".repeat(32),
      network: "eip155:2910",
      payer: PAYER,
    });
    const a = await aPromise;
    expect(a.receipt.transactionHash).toBe("0x" + "ef".repeat(32));
    expect(settleMock).toHaveBeenCalledOnce();
  });

  it("fails open when the cache backend throws — settle still proceeds against the facilitator", async () => {
    mockSuccessfulFacilitator();

    // Inject a failing cache by monkey-patching the singleton. The
    // idempotency layer wraps every cache call in try/catch and treats
    // any throw as a miss, so settle should still hit the facilitator
    // exactly once and return the receipt.
    const cacheModule = await import("../../src/cache/redis.js");
    const realCache = cacheModule.getCacheClient();
    const boom = (label: string) =>
      async (..._args: unknown[]): Promise<never> => {
        throw new Error(`redis ${label} boom`);
      };
    const originals = {
      get: realCache.get.bind(realCache),
      set: realCache.set.bind(realCache),
      setIfNotExists: realCache.setIfNotExists.bind(realCache),
      delete: realCache.delete.bind(realCache),
    };
    realCache.get = boom("get") as typeof realCache.get;
    realCache.set = boom("set") as typeof realCache.set;
    realCache.setIfNotExists = boom("setnx") as typeof realCache.setIfNotExists;
    realCache.delete = boom("del") as typeof realCache.delete;

    try {
      const unpaidBody = buildUnpaid();
      const context = await verifyX402Payment({
        paymentHeader: buildAuthHeader({ nonce: `0x${"05".repeat(32)}` }),
        unpaidBody,
      });
      const result = await settleX402Payment({
        context,
        pricing: basePricing(),
        sniffId: SNIFF_ID,
        requestId: REQUEST_ID,
        unpaidBody,
      });
      expect(result.mode).toBe("morph-official");
      expect(settleMock).toHaveBeenCalledOnce();
    } finally {
      realCache.get = originals.get;
      realCache.set = originals.set;
      realCache.setIfNotExists = originals.setIfNotExists;
      realCache.delete = originals.delete;
    }
  });
});
