import { describe, expect, it } from "vitest";

import { computePricing } from "../../src/payment/pricing.js";
import { buildPaymentRequirements } from "../../src/payment/requirements.js";
import { DiagnoseUnpaidResponse } from "../../src/schemas/index.js";

const MERCHANT = "0x000000000000000000000000000000000000dEaD";
const HOODI_TOKEN = "0xEcF966Cc754BC411E1F1106fbb4e343b835E85E4";

const TEST_ENV = {
  MORPH_NETWORK: "eip155:2910",
  MORPH_FACILITATOR_URL: "https://morph-rails.morph.network/x402",
  SNIFFY_MERCHANT_ADDRESS: MERCHANT,
  SNIFFY_PAYMENT_ASSET_ADDRESS: HOODI_TOKEN,
  SNIFFY_PAYMENT_ASSET_DECIMALS: "18",
  SNIFFY_PAYMENT_ASSET_EIP712_NAME: "HoodiTestToken",
  SNIFFY_PAYMENT_ASSET_EIP712_VERSION: "1.0",
};

describe("buildPaymentRequirements", () => {
  it("returns a payload that passes DiagnoseUnpaidResponse.parse()", () => {
    const pricing = computePricing({ keywords: ["a", "b"] });
    const payload = buildPaymentRequirements({
      sniffId: "sniff_example_001",
      pricing,
      resourceUrl: "/api/v1/aso/diagnose",
      env: TEST_ENV,
    });
    expect(() => DiagnoseUnpaidResponse.parse(payload)).not.toThrow();
  });

  it("keeps the dual-shape amounts in sync (accepts[0].amount === payment.atomicAmount)", () => {
    const pricing = computePricing({ keywords: ["a", "b"] });
    const payload = buildPaymentRequirements({
      sniffId: "sniff_example_001",
      pricing,
      resourceUrl: "/api/v1/aso/diagnose",
      env: TEST_ENV,
    });
    expect(payload.accepts[0]?.amount).toBe(payload.payment.atomicAmount);
  });

  it("computes the canonical atomic amount for $0.05 @ 18 decimals", () => {
    const pricing = computePricing({ keywords: ["a", "b"] });
    const payload = buildPaymentRequirements({
      sniffId: "sniff_example_001",
      pricing,
      resourceUrl: "/api/v1/aso/diagnose",
      env: TEST_ENV,
    });
    expect(payload.payment.amount).toBe("0.05");
    expect(payload.payment.atomicAmount).toBe("50000000000000000");
    expect(payload.payment.decimals).toBe(18);
  });

  it("carries the HoodiTestToken EIP-712 domain hints from env", () => {
    const pricing = computePricing({ keywords: ["a"] });
    const payload = buildPaymentRequirements({
      sniffId: "sniff_example_002",
      pricing,
      resourceUrl: "/api/v1/aso/diagnose",
      env: TEST_ENV,
    });
    expect(payload.payment.extra).toEqual({
      name: "HoodiTestToken",
      version: "1.0",
    });
    expect(payload.accepts[0]?.extra).toEqual({
      name: "HoodiTestToken",
      version: "1.0",
    });
  });

  it("sets payment.network and accepts[0].network to the env CAIP-2 (eip155:2910)", () => {
    const pricing = computePricing({ keywords: ["a"] });
    const payload = buildPaymentRequirements({
      sniffId: "sniff_example_003",
      pricing,
      resourceUrl: "/api/v1/aso/diagnose",
      env: TEST_ENV,
    });
    expect(payload.payment.network).toBe("eip155:2910");
    expect(payload.accepts[0]?.network).toBe("eip155:2910");
    expect(payload.x402Version).toBe(2);
    expect(payload.payment.x402Version).toBe(2);
  });

  it("populates the merchant address and asset address from env", () => {
    const pricing = computePricing({ keywords: ["a"] });
    const payload = buildPaymentRequirements({
      sniffId: "sniff_example_004",
      pricing,
      resourceUrl: "/api/v1/aso/diagnose",
      env: TEST_ENV,
    });
    expect(payload.payment.payTo).toBe(MERCHANT);
    expect(payload.payment.asset).toBe(HOODI_TOKEN);
    expect(payload.accepts[0]?.payTo).toBe(MERCHANT);
    expect(payload.accepts[0]?.asset).toBe(HOODI_TOKEN);
  });

  it("throws if SNIFFY_MERCHANT_ADDRESS is missing", () => {
    const pricing = computePricing({ keywords: ["a"] });
    const env = { ...TEST_ENV, SNIFFY_MERCHANT_ADDRESS: undefined };
    expect(() =>
      buildPaymentRequirements({
        sniffId: "sniff_example_005",
        pricing,
        resourceUrl: "/api/v1/aso/diagnose",
        env,
      }),
    ).toThrow(/SNIFFY_MERCHANT_ADDRESS/);
  });

  it("respects custom maxTimeoutSeconds and resource description", () => {
    const pricing = computePricing({ keywords: ["a"] });
    const payload = buildPaymentRequirements({
      sniffId: "sniff_example_006",
      pricing,
      resourceUrl: "/api/v1/aso/diagnose",
      resourceDescription: "Sniffy ASO diagnosis",
      resourceMimeType: "application/json",
      maxTimeoutSeconds: 120,
      env: TEST_ENV,
    });
    expect(payload.payment.maxTimeoutSeconds).toBe(120);
    expect(payload.accepts[0]?.maxTimeoutSeconds).toBe(120);
    expect(payload.resource.description).toBe("Sniffy ASO diagnosis");
    expect(payload.resource.mimeType).toBe("application/json");
  });
});
