import { describe, expect, it } from "vitest";

import { computePricing } from "../../src/payment/pricing.js";
import { assembleReceipt, formatExplorerLink } from "../../src/payment/receipt.js";
import type { SettleResponse } from "../../src/payment/facilitator/index.js";
import { Receipt } from "../../src/schemas/index.js";

const TEST_ENV = {
  MORPH_NETWORK: "eip155:2910",
  SNIFFY_PAYMENT_ASSET_ADDRESS: "0xEcF966Cc754BC411E1F1106fbb4e343b835E85E4",
  SNIFFY_PAYMENT_ASSET_DECIMALS: "18",
};

const TX_HASH =
  "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";

const settleSuccess: SettleResponse = {
  success: true,
  errorReason: "",
  payer: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  transaction: TX_HASH,
  network: "eip155:2910",
};

describe("assembleReceipt", () => {
  it("produces a morph-official receipt that passes Receipt.parse()", () => {
    const pricing = computePricing({ keywords: ["a", "b"] });
    const receipt = assembleReceipt({
      mode: "morph-official",
      pricing,
      sniffId: "sniff_example_001",
      settleResponse: settleSuccess,
      env: TEST_ENV,
    });
    expect(() => Receipt.parse(receipt)).not.toThrow();
    expect(receipt.transactionHash).toBe(TX_HASH);
    expect(receipt.facilitator).toBe("morph-official");
    expect(receipt.facilitatorMode).toBe("morph-official");
    expect(receipt.network).toBe("eip155:2910");
    expect(receipt.amount).toBe("0.05");
    expect(receipt.atomicAmount).toBe("50000000000000000");
    expect(receipt.asset).toBe(TEST_ENV.SNIFFY_PAYMENT_ASSET_ADDRESS);
    // settledAt is an ISO-8601 datetime string
    expect(() => new Date(receipt.settledAt).toISOString()).not.toThrow();
  });

  it("respects an injected settledAt", () => {
    const pricing = computePricing({ keywords: ["a"] });
    const receipt = assembleReceipt({
      mode: "morph-official",
      pricing,
      sniffId: "sniff_example_002",
      settleResponse: settleSuccess,
      settledAt: "2026-05-18T10:00:00.000Z",
      env: TEST_ENV,
    });
    expect(receipt.settledAt).toBe("2026-05-18T10:00:00.000Z");
  });

  it("throws on morph-official without a transaction hash", () => {
    const pricing = computePricing({ keywords: ["a"] });
    expect(() =>
      assembleReceipt({
        mode: "morph-official",
        pricing,
        sniffId: "sniff_example_003",
        settleResponse: { success: true, transaction: undefined } as SettleResponse,
        env: TEST_ENV,
      }),
    ).toThrow();
  });

  it("fabricates a 0xsample tx hash in fixture-receipt mode", () => {
    const pricing = computePricing({ keywords: ["a", "b"] });
    const receipt = assembleReceipt({
      mode: "fixture-receipt",
      pricing,
      sniffId: "sniff_example_004",
      env: TEST_ENV,
    });
    expect(() => Receipt.parse(receipt)).not.toThrow();
    expect(receipt.facilitator).toBe("fixture-receipt");
    expect(receipt.facilitatorMode).toBe("fixture-receipt");
    expect(receipt.transactionHash).toMatch(/^0xsample[0-9a-f]{56}$/);
  });

  it("uses the random hook deterministically when provided", () => {
    const pricing = computePricing({ keywords: ["a"] });
    const fixedRandom = Buffer.from(
      "aabbccddeeff00112233445566778899aabbccddeeff001122334455",
      "hex",
    );
    const receipt = assembleReceipt({
      mode: "fixture-receipt",
      pricing,
      sniffId: "sniff_example_005",
      random: () => fixedRandom,
      env: TEST_ENV,
    });
    expect(receipt.transactionHash).toBe(
      "0xsampleaabbccddeeff00112233445566778899aabbccddeeff001122334455",
    );
  });

  it("labels self-hosted-fallback distinctly while still sourcing the tx hash from settleResponse", () => {
    const pricing = computePricing({ keywords: ["a"] });
    const receipt = assembleReceipt({
      mode: "self-hosted-fallback",
      pricing,
      sniffId: "sniff_example_006",
      settleResponse: settleSuccess,
      env: TEST_ENV,
    });
    expect(receipt.facilitator).toBe("self-hosted-fallback");
    expect(receipt.facilitatorMode).toBe("self-hosted-fallback");
    expect(receipt.transactionHash).toBe(TX_HASH);
  });
});

describe("formatExplorerLink", () => {
  it("returns the Hoodi explorer URL for eip155:2910", () => {
    expect(formatExplorerLink(TX_HASH, "eip155:2910")).toBe(
      `https://explorer-hoodi.morph.network/tx/${TX_HASH}`,
    );
  });

  it("returns the Mainnet explorer URL for eip155:2818", () => {
    expect(formatExplorerLink(TX_HASH, "eip155:2818")).toBe(
      `https://explorer.morph.network/tx/${TX_HASH}`,
    );
  });

  it("throws on an unknown CAIP-2 network", () => {
    expect(() => formatExplorerLink(TX_HASH, "eip155:1")).toThrow();
  });
});
