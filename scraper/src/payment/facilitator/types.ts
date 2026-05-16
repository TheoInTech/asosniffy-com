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

export const SettleResponse = z
  .object({
    success: z.boolean(),
    errorReason: z.string().optional(),
    payer: EvmAddress.optional(),
    transaction: z.string().regex(/^0x[a-fA-F0-9]+$/).optional(),
    network: CAIP2.optional(),
  })
  .passthrough();
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
