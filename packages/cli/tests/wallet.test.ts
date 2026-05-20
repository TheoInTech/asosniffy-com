import { describe, expect, it } from "vitest";
import { loadWallet, WalletConfigError } from "../src/wallet.js";

const VALID = "0x".concat("a".repeat(64));

describe("loadWallet", () => {
  it("throws WalletConfigError when SNIFFY_PRIVATE_KEY is missing", () => {
    expect(() => loadWallet({})).toThrow(WalletConfigError);
  });

  it("throws WalletConfigError when SNIFFY_PRIVATE_KEY is blank", () => {
    expect(() => loadWallet({ SNIFFY_PRIVATE_KEY: "   " })).toThrow(WalletConfigError);
  });

  it("throws WalletConfigError when key is malformed", () => {
    expect(() => loadWallet({ SNIFFY_PRIVATE_KEY: "0xnotahexstring" })).toThrow(
      WalletConfigError,
    );
  });

  it("returns a PrivateKeyAccount for a valid key", () => {
    const account = loadWallet({ SNIFFY_PRIVATE_KEY: VALID });
    expect(account.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(typeof account.signTypedData).toBe("function");
  });
});
