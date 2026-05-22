import { z } from "zod";
import { Receipt } from "./diagnose.js";
import { RequestId } from "./shared.js";

// Sprint A/B — Sniff Pack purchase + balance schemas. The pack id mirrors the
// stable identifiers exported as SNIFF_PACK_TIERS from payment/pricing.ts —
// keeping the union here (not a forward import) means schema validation
// catches typos at the API boundary without runtime cost.
export const SniffPackId = z.enum([
  "sniff-pack-10",
  "sniff-pack-50",
  "sniff-pack-250",
]);
export type SniffPackId = z.infer<typeof SniffPackId>;

// POST /api/v1/aso/sniff-pack/buy request body. Only the packId; everything
// else (price, asset, payTo) comes from the server-side pack table and the
// shared payment-requirements builder.
export const SniffPackBuyRequest = z.object({
  packId: SniffPackId,
});
export type SniffPackBuyRequest = z.infer<typeof SniffPackBuyRequest>;

// 200 response after a successful purchase + balance increment.
export const SniffPackBuyResponse = z.object({
  requestId: RequestId,
  packId: SniffPackId,
  // Credits granted by this purchase (mirrors the pack tier's `credits` field).
  creditsGranted: z.number().int().positive(),
  // Wallet's new balance after this increment. Returned so the client can
  // surface "you now have N sniffs available" without a follow-up call.
  newBalance: z.number().int().positive(),
  // The same x402 receipt shape returned by /diagnose. Lets agents run the
  // five-check on-chain forensic verification against pack purchases too.
  receipt: Receipt,
});
export type SniffPackBuyResponse = z.infer<typeof SniffPackBuyResponse>;

// GET /api/v1/aso/sniff-pack/balance response (SIWE-authenticated). Surfaces
// the same checksum-lowered wallet the server uses for keying.
export const SniffPackBalanceResponse = z.object({
  wallet: z.string().regex(/^0x[a-f0-9]{40}$/),
  balance: z.number().int().nonnegative(),
});
export type SniffPackBalanceResponse = z.infer<typeof SniffPackBalanceResponse>;

// Public pack-tier shape surfaced via GET /api/v1/aso/sniff-pack/tiers. Mirrors
// the SniffPackQuote shape from payment/pricing.ts so a strict Zod parse at the
// boundary catches drift before the response reaches the client.
export const SniffPackTier = z.object({
  id: SniffPackId,
  label: z.string().min(1),
  credits: z.number().int().positive(),
  totalAmount: z.string().regex(/^\d+(\.\d+)?$/),
  avgPerSniffAmount: z.string().regex(/^\d+(\.\d+)?$/),
  discountPercent: z.number().int().min(0).max(100),
});
export type SniffPackTier = z.infer<typeof SniffPackTier>;

export const SniffPackTiersResponse = z.object({
  tiers: z.array(SniffPackTier).length(3),
});
export type SniffPackTiersResponse = z.infer<typeof SniffPackTiersResponse>;
