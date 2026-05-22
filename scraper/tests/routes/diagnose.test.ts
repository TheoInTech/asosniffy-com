import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseUnits } from "viem";
import {
  AcceptsItem,
  DiagnosePaidResponse,
  DiagnoseUnpaidResponse,
  Receipt,
} from "../../src/schemas/index.js";
import { FacilitatorError } from "../../src/payment/facilitator/index.js";

// Mock the facilitator singleton before importing the app. Each test swaps in
// its own behavior via mockReturnValue / mockResolvedValue.
const verifyMock = vi.fn();
const settleMock = vi.fn();
const getFacilitatorMock = vi.fn();

vi.mock("../../src/services/facilitator.js", () => ({
  getFacilitator: () => getFacilitatorMock(),
  __resetFacilitatorForTests: () => {},
}));

// Force every Apple call to fail so the data layer falls back to fixture.
// Real provider behavior is covered in providers/apple/* and the
// orchestrator fallback integration test.
vi.mock("../../src/providers/apple/itunes.js", () => ({
  lookupApp: vi.fn(async () => ({ error: "network_error" })),
  searchApps: vi.fn(async () => ({ error: "network_error" })),
}));
vi.mock("../../src/providers/apple/keyword-rank.js", () => ({
  sampleKeywordRank: vi.fn(async () => ({ error: "network_error" })),
}));
// Mock gplay so we can drive the relatedTerms path deterministically — by
// default everything errors (matching what the test env would get without
// network), and individual tests can override via the exported mock fns.
const suggestKeywordsMock = vi.fn(async () => ({
  error: "network_error" as const,
}));
vi.mock("../../src/providers/android/play-store.js", () => ({
  lookupApp: vi.fn(async () => ({ error: "network_error" })),
  searchApps: vi.fn(async () => ({ error: "network_error" })),
  similarApps: vi.fn(async () => ({ error: "network_error" })),
  suggestKeywords: (input: unknown) => suggestKeywordsMock(input),
  fetchAndroidReviews: vi.fn(async () => ({ error: "network_error" })),
  lookupAppPreview: vi.fn(async () => ({ error: "network_error" })),
  searchAppsPreview: vi.fn(async () => ({ error: "network_error" })),
}));

const { app } = await import("../../src/index.js");
const { resetCacheClientForTests } = await import("../../src/cache/redis.js");
const { resetMetricsForTests } = await import("../../src/cache/metrics.js");

const MERCHANT = "0x000000000000000000000000000000000000c0de";

interface HeaderOpts {
  network?: string;
  value?: string;
  to?: string;
  validBeforeOffsetSec?: number;
}

function buildAuthHeader(opts: HeaderOpts = {}): string {
  const network = opts.network ?? "eip155:2910";
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
        from: `0x${"11".repeat(20)}`,
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

const VALID_BODY = {
  sniffId: "sniff_test_001",
  store: "ios" as const,
  app: "https://apps.apple.com/us/app/example/id123456789",
  country: "US" as const,
  keywords: ["habit tracker"],
};

async function postDiagnose(body: unknown, headers: Record<string, string> = {}) {
  return app.request("/api/v1/aso/diagnose", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  verifyMock.mockReset();
  settleMock.mockReset();
  getFacilitatorMock.mockReset();
  // Default behavior: pretend gplay.suggest errored (matches the prior test
  // env). Individual tests can override with mockResolvedValueOnce.
  suggestKeywordsMock.mockReset();
  suggestKeywordsMock.mockResolvedValue({
    error: "network_error" as const,
  });
  resetCacheClientForTests();
  resetMetricsForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/v1/aso/diagnose — unpaid paths", () => {
  it("returns HTTP 402 with a valid DiagnoseUnpaidResponse when PAYMENT-SIGNATURE is missing", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const res = await postDiagnose(VALID_BODY);
    expect(res.status).toBe(402);

    const body = await res.json();
    const parsed = DiagnoseUnpaidResponse.parse(body);
    expect(parsed.payment.network).toBe("eip155:2910");
    expect(parsed.payment.x402Version).toBe(2);
    expect(parsed.payment.payTo).toBe(MERCHANT);
    expect(parsed.payment.amount).toBe("0.04");
    expect(parsed.accepts.length).toBeGreaterThanOrEqual(1);
    expect(res.headers.get("X-Sniffy-Error-Code")).toBe("payment_required");
  });

  it("sets PAYMENT-REQUIRED header (Base64 JSON of canonical PaymentRequired) on 402 per x402 V2 spec", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const res = await postDiagnose(VALID_BODY);
    expect(res.status).toBe(402);

    const headerValue = res.headers.get("PAYMENT-REQUIRED");
    expect(headerValue).not.toBeNull();
    const decoded = JSON.parse(
      Buffer.from(headerValue as string, "base64").toString("utf8"),
    );
    expect(decoded.x402Version).toBe(2);
    expect(decoded.error).toBe("payment_required");
    expect(decoded.resource.url).toContain("/api/v1/aso/diagnose");
    const offer = AcceptsItem.parse(decoded.accepts[0]);
    expect(offer.network).toBe("eip155:2910");
    expect(offer.scheme).toBe("exact");
    expect(offer.payTo).toBe(MERCHANT);
  });

  it("advertises assetTransferMethod=eip3009 in accepts[].extra so facilitators don't misroute to Permit2", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const res = await postDiagnose(VALID_BODY);
    expect(res.status).toBe(402);
    const body = await res.json();
    const parsed = DiagnoseUnpaidResponse.parse(body);
    expect(parsed.accepts[0]?.extra.assetTransferMethod).toBe("eip3009");
    expect(parsed.payment.extra.assetTransferMethod).toBe("eip3009");
  });

  it("returns 402 with malformed_payment_header when the header is not base64", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const res = await postDiagnose(VALID_BODY, {
      "PAYMENT-SIGNATURE": "!!!not-base64!!!",
    });
    expect(res.status).toBe(402);
    expect(res.headers.get("X-Sniffy-Error-Code")).toBe("malformed_payment_header");
    DiagnoseUnpaidResponse.parse(await res.json());
  });

  it("returns 402 with wrong_network when the header advertises a different chain", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const header = buildAuthHeader({ network: "eip155:1" });
    const res = await postDiagnose(VALID_BODY, { "PAYMENT-SIGNATURE": header });
    expect(res.status).toBe(402);
    expect(res.headers.get("X-Sniffy-Error-Code")).toBe("wrong_network");
  });

  it("returns 402 with expired_authorization when validBefore is in the past", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const header = buildAuthHeader({ validBeforeOffsetSec: -10 });
    const res = await postDiagnose(VALID_BODY, { "PAYMENT-SIGNATURE": header });
    expect(res.status).toBe(402);
    expect(res.headers.get("X-Sniffy-Error-Code")).toBe("expired_authorization");
  });

  it("returns 402 with amount_mismatch when authorization.value differs from required", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const header = buildAuthHeader({ value: "1" });
    const res = await postDiagnose(VALID_BODY, { "PAYMENT-SIGNATURE": header });
    expect(res.status).toBe(402);
    expect(res.headers.get("X-Sniffy-Error-Code")).toBe("amount_mismatch");
  });

  it("returns 402 with amount_mismatch when authorization.to does not match payTo", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const header = buildAuthHeader({
      to: "0xdeadbeef00000000000000000000000000000000",
    });
    const res = await postDiagnose(VALID_BODY, { "PAYMENT-SIGNATURE": header });
    expect(res.status).toBe(402);
    expect(res.headers.get("X-Sniffy-Error-Code")).toBe("amount_mismatch");
  });

  it("returns 402 verification_failed when facilitator reports invalid", async () => {
    verifyMock.mockResolvedValue({ isValid: false, invalidReason: "bad sig" });
    getFacilitatorMock.mockReturnValue({
      verify: verifyMock,
      settle: settleMock,
      baseUrl: "https://test.example.com/x402",
      getSupported: vi.fn(),
    });
    const header = buildAuthHeader();
    const res = await postDiagnose(VALID_BODY, { "PAYMENT-SIGNATURE": header });
    expect(res.status).toBe(402);
    expect(res.headers.get("X-Sniffy-Error-Code")).toBe("verification_failed");
  });

  it("returns 402 settlement_failed when facilitator settle fails", async () => {
    verifyMock.mockResolvedValue({ isValid: true });
    settleMock.mockResolvedValue({ success: false, errorReason: "rpc down" });
    getFacilitatorMock.mockReturnValue({
      verify: verifyMock,
      settle: settleMock,
      baseUrl: "https://test.example.com/x402",
      getSupported: vi.fn(),
    });
    const header = buildAuthHeader();
    const res = await postDiagnose(VALID_BODY, { "PAYMENT-SIGNATURE": header });
    expect(res.status).toBe(402);
    expect(res.headers.get("X-Sniffy-Error-Code")).toBe("settlement_failed");
  });

  it("returns 402 settlement_failed when Morph returns 200 with malformed Settle body (parse-failure wrapped as FacilitatorError)", async () => {
    // Regression: Morph's /v2/settle was observed returning HTTP 200 with
    // `transaction: ""` and `network: "morph-hoodi"` — both failing
    // SettleResponse's regex/CAIP-2 validators. Pre-fix, the raw ZodError
    // leaked to the global handler and the user saw an opaque HTTP 400
    // "invalid_body" implying their request was bad. Post-fix, the client
    // wraps the parse failure as FacilitatorError so the diagnose route's
    // existing 402 settlement_failed branch handles it. The reported
    // facilitator status (200) and the failing field paths must propagate
    // into the response headers so the UI can show useful copy.
    verifyMock.mockResolvedValue({ isValid: true });
    // `mockRejectedValue` (async rejection) — a synchronous throw breaks the
    // route's `await facilitator.settle(...).catch(...)` chain, since the
    // .catch is on a promise that never gets returned.
    settleMock.mockRejectedValue(
      new FacilitatorError({
        status: 200,
        body: { success: true, transaction: "", network: "morph-hoodi" },
        path: "/x402/v2/settle",
        method: "POST",
        message:
          "Morph POST /x402/v2/settle returned HTTP 200 with body that failed schema validation: transaction: Invalid; network: CAIP-2 identifier, eip155:<chainId>",
      }),
    );
    getFacilitatorMock.mockReturnValue({
      verify: verifyMock,
      settle: settleMock,
      baseUrl: "https://test.example.com/x402",
      getSupported: vi.fn(),
    });
    const header = buildAuthHeader();
    const res = await postDiagnose(VALID_BODY, { "PAYMENT-SIGNATURE": header });
    expect(res.status).toBe(402);
    expect(res.headers.get("X-Sniffy-Error-Code")).toBe("settlement_failed");
    expect(res.headers.get("X-Sniffy-Facilitator-Status")).toBe("200");
    const errMessage = res.headers.get("X-Sniffy-Error-Message") ?? "";
    expect(errMessage).toContain("transaction");
    expect(errMessage).toContain("network");
    // Body must remain a valid DiagnoseUnpaidResponse so the client can
    // re-sign and retry with a fresh nonce.
    DiagnoseUnpaidResponse.parse(await res.json());
  });
});

describe("POST /api/v1/aso/diagnose — paid happy paths", () => {
  it("returns HTTP 200 with a DiagnosePaidResponse when verify + settle succeed (morph-official)", async () => {
    verifyMock.mockResolvedValue({ isValid: true });
    settleMock.mockResolvedValue({
      success: true,
      transaction: "0x1234567890abcdef1234567890abcdef12345678",
    });
    getFacilitatorMock.mockReturnValue({
      verify: verifyMock,
      settle: settleMock,
      baseUrl: "https://test.example.com/x402",
      getSupported: vi.fn(),
    });
    const header = buildAuthHeader();
    const res = await postDiagnose(VALID_BODY, { "PAYMENT-SIGNATURE": header });
    expect(res.status).toBe(200);
    const parsed = DiagnosePaidResponse.parse(await res.json());
    expect(parsed.receipt.facilitatorMode).toBe("morph-official");
    expect(parsed.receipt.transactionHash).toBe(
      "0x1234567890abcdef1234567890abcdef12345678",
    );
    // Phase 1 honest-floor: when providers fail and allowFixtureFallback is
    // false (the /diagnose default), provenance is 'degraded', not 'fixture'.
    expect(parsed.dataProvenance.appMetadata).toBe("degraded");
    expect(parsed.dataProvenance.recommendations).not.toBe("inferred");
    expect(parsed.keywordDiagnosis[0]?.keyword).toBe("habit tracker");
  });

  it("returns HTTP 200 with a fixture-receipt when facilitator is null (fixture mode)", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const header = buildAuthHeader();
    const res = await postDiagnose(VALID_BODY, { "PAYMENT-SIGNATURE": header });
    expect(res.status).toBe(200);
    const parsed = DiagnosePaidResponse.parse(await res.json());
    expect(parsed.receipt.facilitatorMode).toBe("fixture-receipt");
    expect(parsed.receipt.transactionHash).toMatch(/^0xsample/);
    // verify + settle should not have been called in fixture mode
    expect(verifyMock).not.toHaveBeenCalled();
    expect(settleMock).not.toHaveBeenCalled();
  });

  it("calls facilitator.verify/settle with the canonical accepts[0] shape (atomic amount, no extended fields)", async () => {
    // Regression: previously we sent unpaidBody.payment (decimal `amount`)
    // which made Morph's facilitator return HTTP 500 when it parsed `amount`
    // as a big.Int. The wire shape must be the AcceptsItem (atomic amount).
    verifyMock.mockResolvedValue({ isValid: true });
    settleMock.mockResolvedValue({
      success: true,
      transaction: "0x1234567890abcdef1234567890abcdef12345678",
    });
    getFacilitatorMock.mockReturnValue({
      verify: verifyMock,
      settle: settleMock,
      baseUrl: "https://test.example.com/x402",
      getSupported: vi.fn(),
    });
    const value = parseUnits("0.04", 18).toString();
    const header = buildAuthHeader({ value });
    const res = await postDiagnose(VALID_BODY, { "PAYMENT-SIGNATURE": header });
    expect(res.status).toBe(200);

    for (const captured of [verifyMock.mock.calls[0]?.[0], settleMock.mock.calls[0]?.[0]]) {
      expect(captured).toBeDefined();
      const req = captured as { paymentRequirements: Record<string, unknown> };
      // AcceptsItem is parseable from the captured paymentRequirements.
      const parsed = AcceptsItem.parse(req.paymentRequirements);
      // amount must be the same atomic string the wallet signed into authorization.value.
      expect(parsed.amount).toBe(value);
      expect(parsed.amount).toMatch(/^\d+$/);
      // No leakage of our internal extended fields.
      expect(req.paymentRequirements).not.toHaveProperty("x402Version");
      expect(req.paymentRequirements).not.toHaveProperty("facilitator");
      expect(req.paymentRequirements).not.toHaveProperty("decimals");
      expect(req.paymentRequirements).not.toHaveProperty("atomicAmount");
      // Extra carries the EIP-712 hints + EIP-3009 discriminator
      // (specs/schemes/exact/scheme_exact_evm.md).
      expect(parsed.extra.assetTransferMethod).toBe("eip3009");
    }
  });

  it("forwards canonical x402 V2 paymentPayload (with accepted block) to facilitator.verify/settle", async () => {
    // Regression: Morph's Go facilitator parser reads paymentPayload.accepted.scheme
    // and returns HTTP 500 when it's missing. The wire shape must be the
    // canonical V2 PaymentPayload (coinbase/x402 types/payments.ts) — our
    // header parser intentionally transforms incoming bodies to the flat
    // shape for internal use, so the route reconstructs canonical before
    // forwarding.
    verifyMock.mockResolvedValue({ isValid: true });
    settleMock.mockResolvedValue({
      success: true,
      transaction: "0x1234567890abcdef1234567890abcdef12345678",
    });
    getFacilitatorMock.mockReturnValue({
      verify: verifyMock,
      settle: settleMock,
      baseUrl: "https://test.example.com/x402",
      getSupported: vi.fn(),
    });
    const value = parseUnits("0.04", 18).toString();
    const header = buildAuthHeader({ value });
    const res = await postDiagnose(VALID_BODY, { "PAYMENT-SIGNATURE": header });
    expect(res.status).toBe(200);

    for (const captured of [verifyMock.mock.calls[0]?.[0], settleMock.mock.calls[0]?.[0]]) {
      expect(captured).toBeDefined();
      const req = captured as {
        paymentRequirements: Record<string, unknown>;
        paymentPayload: {
          x402Version: number;
          accepted: Record<string, unknown>;
          payload: {
            signature: string;
            authorization: Record<string, unknown>;
          };
        };
      };
      // paymentPayload MUST carry the canonical `accepted` block.
      expect(req.paymentPayload).toBeDefined();
      expect(req.paymentPayload.x402Version).toBe(2);
      expect(req.paymentPayload.accepted).toBeDefined();
      // accepted is deep-equal to paymentRequirements — same source of truth.
      expect(req.paymentPayload.accepted).toEqual(req.paymentRequirements);
      // accepted.extra carries the EIP-3009 discriminator.
      expect(
        (req.paymentPayload.accepted.extra as { assetTransferMethod?: string })
          .assetTransferMethod,
      ).toBe("eip3009");
      // The inner `payload` is the EIP-3009 exact shape (signature +
      // authorization) the wallet produced — kept intact.
      expect(req.paymentPayload.payload).toBeDefined();
      expect(req.paymentPayload.payload.signature).toMatch(/^0x[a-fA-F0-9]+$/);
      expect(req.paymentPayload.payload.authorization).toBeDefined();
      // No flat-shape leftovers — `scheme`/`network` must live inside `accepted`.
      expect(req.paymentPayload).not.toHaveProperty("scheme");
      expect(req.paymentPayload).not.toHaveProperty("network");
    }
  });

  it("filters empty/whitespace entries from gplay.suggest before they reach DiagnosePaidResponse.parse", async () => {
    // Regression: a single empty string in gplay.suggest() output used to
    // cause `relatedTerms.*: String must contain at least 1 character(s)`
    // in the final response schema parse → opaque HTTP 400. The data layer
    // now trims/filters/slices at the boundary.
    suggestKeywordsMock.mockResolvedValue([
      "habit tracker daily",
      "",
      "  ",
      "habit tracker pro",
      "habit",
    ]);
    getFacilitatorMock.mockReturnValue(null);
    const header = buildAuthHeader();
    const res = await postDiagnose(VALID_BODY, { "PAYMENT-SIGNATURE": header });
    expect(res.status).toBe(200);

    const parsed = DiagnosePaidResponse.parse(await res.json());
    const related = parsed.keywordDiagnosis[0]?.relatedTerms ?? [];
    // Order preserved, empties dropped.
    expect(related).toEqual(["habit tracker daily", "habit tracker pro", "habit"]);
    expect(related.every((t) => t.length > 0)).toBe(true);
  });

  it("sets PAYMENT-RESPONSE header (Base64 JSON of receipt) on 200 per x402 V2 spec", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const header = buildAuthHeader();
    const res = await postDiagnose(VALID_BODY, { "PAYMENT-SIGNATURE": header });
    expect(res.status).toBe(200);

    const headerValue = res.headers.get("PAYMENT-RESPONSE");
    expect(headerValue).not.toBeNull();
    const decoded = JSON.parse(
      Buffer.from(headerValue as string, "base64").toString("utf8"),
    );
    const receipt = Receipt.parse(decoded);
    expect(receipt.facilitatorMode).toBe("fixture-receipt");
    expect(receipt.transactionHash).toMatch(/^0xsample/);
  });

  it("indexes the sniff against auth.from when morph-official settle succeeds but omits payer", async () => {
    // Regression: the Trail page was permanently empty because Morph's
    // /v2/settle treats payer as optional and doesn't always echo it back.
    // The diagnose route used to gate the wallet-history write on
    // receipt.payer (sourced solely from settleResponse.payer), so the
    // recordSniff() call was silently skipped. The fix passes auth.from as
    // payerFallback so the index is still populated.
    verifyMock.mockResolvedValue({ isValid: true });
    settleMock.mockResolvedValue({
      success: true,
      transaction: "0x1234567890abcdef1234567890abcdef12345678",
      // NOTE: no `payer` field — mirrors the real Morph response shape.
    });
    getFacilitatorMock.mockReturnValue({
      verify: verifyMock,
      settle: settleMock,
      baseUrl: "https://test.example.com/x402",
      getSupported: vi.fn(),
    });

    const header = buildAuthHeader();
    const res = await postDiagnose(VALID_BODY, { "PAYMENT-SIGNATURE": header });
    expect(res.status).toBe(200);

    // 1) Receipt carries the payer derived from auth.from, lowercased.
    const parsed = DiagnosePaidResponse.parse(await res.json());
    const expectedPayer = `0x${"11".repeat(20)}`; // buildAuthHeader uses 0x1111... for authorization.from
    expect(parsed.receipt.payer).toBe(expectedPayer);

    // 2) listSniffs() returns the sniff against that wallet — the actual
    //    integration point the Trail page relies on.
    const { listSniffs } = await import("../../src/wallet/history.js");
    const { tryNormalizeAddress } = await import("../../src/lib/address.js");
    const lower = tryNormalizeAddress(expectedPayer);
    expect(lower).not.toBeNull();
    const list = await listSniffs({ address: lower! });
    expect(list.items.length).toBe(1);
    expect(list.items[0]?.sniffId).toBe(VALID_BODY.sniffId);
  });

  it("indexes the sniff against auth.from in fixture-receipt mode", async () => {
    // Fixture mode has no settleResponse at all, but the user still paid
    // (signed an EIP-3009 authorization) — the trail must still record it
    // so judges/agents using fixture mode see their history.
    getFacilitatorMock.mockReturnValue(null);
    const header = buildAuthHeader();
    const fixtureBody = { ...VALID_BODY, sniffId: "sniff_test_fixture_trail" };
    const res = await postDiagnose(fixtureBody, { "PAYMENT-SIGNATURE": header });
    expect(res.status).toBe(200);

    const parsed = DiagnosePaidResponse.parse(await res.json());
    const expectedPayer = `0x${"11".repeat(20)}`;
    expect(parsed.receipt.payer).toBe(expectedPayer);

    const { listSniffs } = await import("../../src/wallet/history.js");
    const { tryNormalizeAddress } = await import("../../src/lib/address.js");
    const lower = tryNormalizeAddress(expectedPayer);
    const list = await listSniffs({ address: lower! });
    expect(list.items.some((i) => i.sniffId === fixtureBody.sniffId)).toBe(true);
  });
});

describe("POST /api/v1/aso/diagnose — body validation", () => {
  it("rejects missing sniffId with 400", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const { sniffId: _drop, ...rest } = VALID_BODY;
    const res = await postDiagnose(rest);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_body");
  });

  it("rejects keyword arrays beyond 5 with 400 (Diagnose tighter than Quote)", async () => {
    getFacilitatorMock.mockReturnValue(null);
    const res = await postDiagnose({
      ...VALID_BODY,
      keywords: ["a", "b", "c", "d", "e", "f"],
    });
    expect(res.status).toBe(400);
  });
});
