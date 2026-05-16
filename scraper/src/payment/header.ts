import { z } from "zod";
import { CAIP2, PaymentScheme } from "../schemas/index.js";

// PaymentPayload v2 schema per x402-payments/references/http-protocol.md
// lines 117–141. We keep the inner payload narrowly typed for the EIP-3009
// `transferWithAuthorization` shape — the only path Morph's `exact` scheme
// uses on Hoodi today. If/when Permit2 lands we'll widen this to a union.

const HexBytes = z.string().regex(/^0x[a-fA-F0-9]+$/, "0x-prefixed hex");
const EvmAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "EVM address");
const UnixSecondsString = z
  .string()
  .regex(/^\d+$/, "decimal-string unix seconds");

const Eip3009Authorization = z.object({
  from: EvmAddress,
  to: EvmAddress,
  value: z.string().regex(/^\d+$/, "atomic units (integer string)"),
  validAfter: UnixSecondsString,
  validBefore: UnixSecondsString,
  nonce: HexBytes,
});
export type Eip3009Authorization = z.infer<typeof Eip3009Authorization>;

const ExactEvmPayload = z.object({
  signature: HexBytes,
  authorization: Eip3009Authorization,
});
export type ExactEvmPayload = z.infer<typeof ExactEvmPayload>;

export const PaymentPayload = z.object({
  x402Version: z.literal(2),
  scheme: PaymentScheme,
  network: CAIP2,
  payload: ExactEvmPayload,
});
export type PaymentPayload = z.infer<typeof PaymentPayload>;

abstract class PaymentHeaderError extends Error {
  abstract readonly code: string;
}

export class MalformedHeaderError extends PaymentHeaderError {
  readonly code = "malformed_payment_header";
  constructor(message: string) {
    super(message);
    this.name = "MalformedHeaderError";
  }
}

export class WrongNetworkError extends PaymentHeaderError {
  readonly code = "wrong_network";
  readonly expected: string;
  readonly actual: string;
  constructor(expected: string, actual: string) {
    super(
      `Payment header network mismatch: expected ${expected}, got ${actual}`,
    );
    this.name = "WrongNetworkError";
    this.expected = expected;
    this.actual = actual;
  }
}

export class ExpiredAuthorizationError extends PaymentHeaderError {
  readonly code = "expired_authorization";
  readonly validBefore: number;
  readonly now: number;
  constructor(validBefore: number, now: number) {
    super(
      `Payment authorization expired: validBefore=${validBefore} < now=${now}`,
    );
    this.name = "ExpiredAuthorizationError";
    this.validBefore = validBefore;
    this.now = now;
  }
}

export interface ParsePaymentHeaderOptions {
  // Injection point for tests; defaults to Date.now() in seconds.
  nowSeconds?: () => number;
}

export function parsePaymentHeader(
  raw: string | undefined | null,
  expectedNetwork: string,
  options: ParsePaymentHeaderOptions = {},
): PaymentPayload | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  let jsonText: string;
  try {
    jsonText = Buffer.from(trimmed, "base64").toString("utf8");
  } catch {
    throw new MalformedHeaderError("PAYMENT-SIGNATURE is not valid base64");
  }
  // Buffer.from(invalid, 'base64') doesn't throw — it silently truncates.
  // Re-encode and compare to ensure we received real base64.
  if (Buffer.from(jsonText, "utf8").toString("base64").replace(/=+$/, "") !==
      trimmed.replace(/=+$/, "") && jsonText.length === 0) {
    throw new MalformedHeaderError("PAYMENT-SIGNATURE decoded to empty payload");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new MalformedHeaderError(
      "PAYMENT-SIGNATURE body is not valid JSON after base64-decode",
    );
  }

  const result = PaymentPayload.safeParse(parsed);
  if (!result.success) {
    throw new MalformedHeaderError(
      `PAYMENT-SIGNATURE failed schema validation: ${result.error.issues
        .map((i) => i.message)
        .join("; ")}`,
    );
  }
  const payload = result.data;

  if (payload.network !== expectedNetwork) {
    throw new WrongNetworkError(expectedNetwork, payload.network);
  }

  const nowSec = options.nowSeconds
    ? options.nowSeconds()
    : Math.floor(Date.now() / 1000);
  const validBefore = Number(payload.payload.authorization.validBefore);
  if (!Number.isFinite(validBefore) || validBefore <= nowSec) {
    throw new ExpiredAuthorizationError(validBefore, nowSec);
  }

  return payload;
}
