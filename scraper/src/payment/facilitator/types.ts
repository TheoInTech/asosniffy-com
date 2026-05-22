import { z } from "zod";
import { CAIP2, PaymentScheme } from "../../schemas/index.js";

// `paymentPayload` and `paymentRequirements` are passed through to Morph
// without us imposing a strict shape — they are scheme/network specific and
// will evolve. We validate the request envelope only and trust that the
// callers (the route handler in Phase 02, plus a request built from
// buildPaymentRequirements()) supply a well-formed inner shape.
export const VerifyRequest = z.object({
  x402Version: z.literal(2),
  paymentPayload: z.unknown(),
  paymentRequirements: z.unknown(),
});
export type VerifyRequest = z.infer<typeof VerifyRequest>;

export const SettleRequest = VerifyRequest;
export type SettleRequest = z.infer<typeof SettleRequest>;

const EvmAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "EVM address");

// Morph error envelopes always populate both pairs (isValid/invalidReason and
// success/errorReason) so SDK consumers always see something. We model the
// success cases here; permissive .passthrough() lets us surface any extra
// fields Morph adds without breaking parsing.
export const VerifyResponse = z
  .object({
    isValid: z.boolean(),
    invalidReason: z.string().optional(),
    payer: z.string().optional(),
  })
  .passthrough();
export type VerifyResponse = z.infer<typeof VerifyResponse>;

// Discriminated on `success` so a real settlement failure surfaces the
// facilitator's `errorReason` verbatim instead of being masked as schema
// drift. Morph returns `{ success: false, transaction: "", network: "", ... }`
// on settle failures (nonce conflict, insufficient balance, etc.). The old
// flat schema declared `transaction` / `network` as .optional() with regex
// validators — but .optional() only short-circuits `undefined`, not empty
// strings. The empty strings failed the regex / CAIP-2 check, the parse
// threw FacilitatorError("body failed schema validation"), and the
// existing settlement.ts `success: false` handler never ran.
//
// Strict-on-success: a `success: true` body without a real tx hash + CAIP-2
// network is still rejected — we don't want to silently accept a "successful"
// settle without proof of on-chain submission on the non-refundable Mainnet
// paid path.
const SettleResponseSuccess = z
  .object({
    success: z.literal(true),
    transaction: z.string().regex(/^0x[a-fA-F0-9]+$/),
    network: CAIP2,
    payer: EvmAddress.optional(),
    errorReason: z.string().optional(),
  })
  .passthrough();

const SettleResponseFailure = z
  .object({
    success: z.literal(false),
    errorReason: z.string(),
    // Morph populates these as "" on failure — accept any string, no regex.
    transaction: z.string().optional(),
    network: z.string().optional(),
    payer: z.string().optional(),
  })
  .passthrough();

export const SettleResponse = z.discriminatedUnion("success", [
  SettleResponseSuccess,
  SettleResponseFailure,
]);
export type SettleResponse = z.infer<typeof SettleResponse>;

export const SupportedKind = z
  .object({
    x402Version: z.literal(2),
    scheme: PaymentScheme,
    network: CAIP2,
  })
  .passthrough();
export type SupportedKind = z.infer<typeof SupportedKind>;

export const SupportedResponse = z
  .object({
    kinds: z.array(SupportedKind),
    extensions: z.array(z.unknown()).optional(),
    signers: z.record(z.string(), z.array(EvmAddress)).optional(),
  })
  .passthrough();
export type SupportedResponse = z.infer<typeof SupportedResponse>;
