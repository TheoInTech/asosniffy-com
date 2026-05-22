import { beforeEach, describe, expect, it } from "vitest";
import { resetCacheClientForTests } from "../../src/cache/redis.js";
import {
  getBalance,
  incrementBalance,
  tryDecrementBalance,
} from "../../src/wallet/sniff-pack-balance.js";

// Use all-lowercase 20-byte hex so viem's checksum-aware isAddress accepts
// them as valid. Anything mixed-case would need a real EIP-55 checksum.
const WALLET_A = "0x0000000000000000000000000000000000000001";
const WALLET_B = "0x0000000000000000000000000000000000000002";

describe("sniff-pack-balance", () => {
  beforeEach(() => {
    resetCacheClientForTests();
  });

  describe("getBalance", () => {
    it("returns 0 for an unknown wallet", async () => {
      const balance = await getBalance(WALLET_A);
      expect(balance).toBe(0);
    });

    it("returns 0 for a malformed wallet address (fail-closed)", async () => {
      const balance = await getBalance("not-a-wallet");
      expect(balance).toBe(0);
    });

    it("normalizes case — checksum and lower-case resolve to the same balance", async () => {
      // Use a checksum-correct mixed-case address (viem zero-address has no
      // distinct checksum form, so use a known one).
      const checksumWallet = "0x71C7656EC7ab88b098defB751B7401B5f6d8976F";
      const lowercaseWallet = checksumWallet.toLowerCase();
      await incrementBalance(checksumWallet, 10);
      expect(await getBalance(checksumWallet)).toBe(10);
      expect(await getBalance(lowercaseWallet)).toBe(10);
    });
  });

  describe("incrementBalance", () => {
    it("returns the new balance and persists the increment", async () => {
      const snapshot = await incrementBalance(WALLET_A, 10);
      expect(snapshot.balance).toBe(10);
      expect(snapshot.wallet).toBe(WALLET_A.toLowerCase());
      const readback = await getBalance(WALLET_A);
      expect(readback).toBe(10);
    });

    it("adds to existing balance on subsequent calls", async () => {
      await incrementBalance(WALLET_A, 10);
      const snapshot = await incrementBalance(WALLET_A, 50);
      expect(snapshot.balance).toBe(60);
      const readback = await getBalance(WALLET_A);
      expect(readback).toBe(60);
    });

    it("keeps wallet balances independent", async () => {
      await incrementBalance(WALLET_A, 10);
      await incrementBalance(WALLET_B, 250);
      expect(await getBalance(WALLET_A)).toBe(10);
      expect(await getBalance(WALLET_B)).toBe(250);
    });

    it("rejects zero credits", async () => {
      await expect(incrementBalance(WALLET_A, 0)).rejects.toThrow(
        /Invalid credit delta/,
      );
    });

    it("rejects negative credits", async () => {
      await expect(incrementBalance(WALLET_A, -5)).rejects.toThrow(
        /Invalid credit delta/,
      );
    });

    it("rejects non-integer credits", async () => {
      await expect(incrementBalance(WALLET_A, 1.5)).rejects.toThrow(
        /Invalid credit delta/,
      );
    });

    it("rejects a malformed wallet (would corrupt the key)", async () => {
      await expect(incrementBalance("not-a-wallet", 10)).rejects.toThrow();
    });
  });

  describe("tryDecrementBalance", () => {
    it("returns success:false with balance:0 for a wallet that has never funded", async () => {
      const result = await tryDecrementBalance(WALLET_A, 1);
      expect(result).toEqual({
        success: false,
        wallet: WALLET_A,
        balance: 0,
      });
    });

    it("decrements an existing balance and returns the new value", async () => {
      await incrementBalance(WALLET_A, 10);
      const result = await tryDecrementBalance(WALLET_A, 1);
      expect(result.success).toBe(true);
      expect(result.balance).toBe(9);
      expect(await getBalance(WALLET_A)).toBe(9);
    });

    it("can decrement by an amount greater than 1", async () => {
      await incrementBalance(WALLET_A, 50);
      const result = await tryDecrementBalance(WALLET_A, 10);
      expect(result.success).toBe(true);
      expect(result.balance).toBe(40);
    });

    it("refuses to go below zero and leaves the stored balance untouched", async () => {
      await incrementBalance(WALLET_A, 3);
      const result = await tryDecrementBalance(WALLET_A, 5);
      expect(result.success).toBe(false);
      expect(result.balance).toBe(3);
      // Critical invariant: the failed attempt did not consume credits.
      expect(await getBalance(WALLET_A)).toBe(3);
    });

    it("supports draining a balance exactly to zero", async () => {
      await incrementBalance(WALLET_A, 3);
      const first = await tryDecrementBalance(WALLET_A, 3);
      expect(first.success).toBe(true);
      expect(first.balance).toBe(0);
      const second = await tryDecrementBalance(WALLET_A, 1);
      expect(second.success).toBe(false);
      expect(second.balance).toBe(0);
    });

    it("keeps wallet ledgers independent under decrement", async () => {
      await incrementBalance(WALLET_A, 5);
      await incrementBalance(WALLET_B, 5);
      const aDec = await tryDecrementBalance(WALLET_A, 1);
      expect(aDec.success).toBe(true);
      expect(aDec.balance).toBe(4);
      // B's balance must not have moved.
      expect(await getBalance(WALLET_B)).toBe(5);
    });

    it("fail-closes (success:false) on invalid credit amount", async () => {
      await incrementBalance(WALLET_A, 5);
      // Decrement primitive returns failure rather than throwing — keeps the
      // hot /diagnose path's error-handling tight.
      const zero = await tryDecrementBalance(WALLET_A, 0);
      expect(zero.success).toBe(false);
      const negative = await tryDecrementBalance(WALLET_A, -1);
      expect(negative.success).toBe(false);
      const fraction = await tryDecrementBalance(WALLET_A, 1.5);
      expect(fraction.success).toBe(false);
      // Balance unchanged after all rejected calls.
      expect(await getBalance(WALLET_A)).toBe(5);
    });

    it("fail-closes (success:false) on a malformed wallet address", async () => {
      const result = await tryDecrementBalance("not-a-wallet", 1);
      expect(result.success).toBe(false);
      expect(result.wallet).toBeNull();
    });

    it("survives many sequential decrements without drift (10 → 0)", async () => {
      await incrementBalance(WALLET_A, 10);
      for (let i = 0; i < 10; i++) {
        const result = await tryDecrementBalance(WALLET_A, 1);
        expect(result.success).toBe(true);
        expect(result.balance).toBe(9 - i);
      }
      expect(await getBalance(WALLET_A)).toBe(0);
    });
  });
});
