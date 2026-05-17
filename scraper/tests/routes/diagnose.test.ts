import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseUnits } from "viem";
import {
  DiagnosePaidResponse,
  DiagnoseUnpaidResponse,
} from "../../src/schemas/index.js";

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
    expect(parsed.dataProvenance.appMetadata).toBe("fixture");
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
