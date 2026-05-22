import { env } from "../env.js";
import { InternalError, PaymentRequiredError } from "../errors.js";
import type {
  AcceptsItem,
  DiagnoseUnpaidResponse,
  FacilitatorMode,
  Pricing,
  Receipt,
  RequestId,
  SniffId,
} from "../schemas/index.js";
import { getFacilitator } from "../services/facilitator.js";
import {
  FacilitatorError,
  type FacilitatorClient,
  type SettleResponseType,
} from "./facilitator/index.js";
import {
  ExpiredAuthorizationError,
  MalformedHeaderError,
  WrongNetworkError,
  parsePaymentHeader,
  type PaymentPayload,
} from "./header.js";
import { assembleReceipt } from "./receipt.js";

// Sprint C cleanup — shared x402 verify/settle chain. Before this module
// existed, the diagnose and sniff-pack/buy routes each carried their own
// copy of the parse → amount-check → verify path and the settle → receipt
// path. The duplication risked the two routes drifting on error codes,
// wire-payload shape, or facilitator semantics.
//
// The chain is split into TWO helpers (not one) because the call sites have
// different work to do BETWEEN verify and settle:
//
//   /diagnose          — verify, then run generateReport (slow), then settle
//   /sniff-pack/buy    — verify, then settle immediately
//
// Callers stitch them together themselves. The shared helpers own only the
// payment plumbing, not the business work in between.

// Cross-realm fallback for FacilitatorError identification. Vitest can hand
// a route a FacilitatorError instance from a different module realm than
// the one this module statically imported, breaking the `instanceof` check.
// The `.name === "FacilitatorError"` fallback keeps the production path
// (single-realm) unchanged while letting integration tests inject errors.
export function isFacilitatorError(err: unknown): err is FacilitatorError {
  return (
    err instanceof FacilitatorError ||
    (err instanceof Error && err.name === "FacilitatorError")
  );
}

export interface VerifyX402Input {
  paymentHeader: string | undefined;
  unpaidBody: DiagnoseUnpaidResponse;
}

export interface VerifiedX402Context {
  payload: PaymentPayload;
  // Authorization block extracted from the parsed payload — already
  // amount + payTo-validated against unpaidBody.
  auth: PaymentPayload["payload"]["authorization"];
  // Wire payload to forward to facilitator.settle. Reconstructed here so
  // the AcceptedRequirement matches what facilitator.verify saw — Morph's
  // Go parser checks `paymentPayload.accepted.scheme` and 500s when it's
  // missing, so the shape must round-trip byte-for-byte.
  wirePaymentPayload: {
    x402Version: 2;
    accepted: AcceptsItem;
    payload: PaymentPayload["payload"];
  };
  wireRequirements: AcceptsItem;
  // Captured at verify time and threaded into settle so both calls hit the
  // same facilitator instance (or both skip together in fixture mode).
  facilitator: FacilitatorClient | null;
}

// Runs the read-header → parse → amount-check → facilitator.verify chain.
// Throws PaymentRequiredError with the matching error code on any failure
// — caller's error handler renders 402 with the unpaid body. On success
// returns a VerifiedX402Context the caller passes to settleX402Payment
// after any between-step work (e.g. /diagnose runs generateReport here).
export async function verifyX402Payment(
  input: VerifyX402Input,
): Promise<VerifiedX402Context> {
  const { paymentHeader, unpaidBody } = input;

  // 1) Read header.
  if (!paymentHeader || paymentHeader.trim().length === 0) {
    throw new PaymentRequiredError(
      "payment_required",
      "PAYMENT-SIGNATURE header is required",
      unpaidBody,
    );
  }

  // 2) Parse header, mapping typed errors back to the taxonomy.
  let payload: PaymentPayload;
  try {
    const parsed = parsePaymentHeader(paymentHeader, env.MORPH_NETWORK);
    if (!parsed) {
      throw new PaymentRequiredError(
        "malformed_payment_header",
        "Could not parse PAYMENT-SIGNATURE header",
        unpaidBody,
      );
    }
    payload = parsed;
  } catch (err) {
    if (err instanceof MalformedHeaderError) {
      throw new PaymentRequiredError(
        "malformed_payment_header",
        err.message,
        unpaidBody,
      );
    }
    if (err instanceof WrongNetworkError) {
      throw new PaymentRequiredError("wrong_network", err.message, unpaidBody);
    }
    if (err instanceof ExpiredAuthorizationError) {
      throw new PaymentRequiredError(
        "expired_authorization",
        err.message,
        unpaidBody,
      );
    }
    throw err;
  }

  // 3) Strict amount/payTo match (decision #18). Asset address isn't carried
  //    in EIP-3009 authorization — the facilitator binds the asset by
  //    signature → so we don't re-check it here.
  const auth = payload.payload.authorization;
  if (auth.value !== unpaidBody.payment.atomicAmount) {
    throw new PaymentRequiredError(
      "amount_mismatch",
      `Payment authorization value ${auth.value} does not match required ${unpaidBody.payment.atomicAmount}`,
      unpaidBody,
    );
  }
  if (auth.to.toLowerCase() !== unpaidBody.payment.payTo.toLowerCase()) {
    throw new PaymentRequiredError(
      "amount_mismatch",
      `Payment authorization recipient ${auth.to} does not match required ${unpaidBody.payment.payTo}`,
      unpaidBody,
    );
  }

  // 4) Construct the wire payload. accepts[0] is the canonical x402 V2
  //    requirement — one entry from accepts[] with amount as atomic units
  //    string, no extended fields. Passing our internal PaymentRequirement
  //    (decimal amount) would 500 Morph's big.Int parser.
  const wireRequirements = unpaidBody.accepts[0];
  if (!wireRequirements) {
    throw new InternalError(
      "buildPaymentRequirements returned an empty accepts[]",
    );
  }

  const wirePaymentPayload = {
    x402Version: 2 as const,
    accepted: wireRequirements,
    payload: payload.payload,
  };

  // 5) Facilitator verify (skip in fixture mode).
  const facilitator = getFacilitator();
  if (facilitator !== null) {
    const verifyResponse = await facilitator
      .verify({
        x402Version: 2,
        paymentPayload: wirePaymentPayload,
        paymentRequirements: wireRequirements,
      })
      .catch((err: unknown) => {
        if (isFacilitatorError(err)) {
          throw new PaymentRequiredError(
            "verification_failed",
            `Facilitator verify failed: ${err.message}`,
            unpaidBody,
            { status: err.status, body: err.body },
          );
        }
        throw err;
      });

    if (!verifyResponse.isValid) {
      throw new PaymentRequiredError(
        "verification_failed",
        verifyResponse.invalidReason ?? "Facilitator rejected the payment",
        unpaidBody,
      );
    }
  }

  return {
    payload,
    auth,
    wirePaymentPayload,
    wireRequirements,
    facilitator,
  };
}

export interface SettleX402Input {
  context: VerifiedX402Context;
  pricing: Pricing;
  sniffId: SniffId;
  requestId: RequestId;
  unpaidBody: DiagnoseUnpaidResponse;
}

export interface SettleX402Result {
  receipt: Receipt;
  mode: FacilitatorMode;
  // settleResponse.payer (canonical) when present; auth.from fallback when
  // the facilitator omits payer in /v2/settle. Lowercased downstream by
  // assembleReceipt — caller can compare wallet addresses directly.
  payer: string;
  settleResponse: SettleResponseType | undefined;
}

// Runs facilitator.settle (skipped in fixture mode) and assembles the
// canonical Receipt. Throws PaymentRequiredError with "settlement_failed"
// on facilitator errors so the caller renders 402. Successful settle
// returns the receipt + mode + payer for the caller's post-settle work
// (wallet-history index, refresh-sniff marker, balance increment, showcase
// write, etc.).
export async function settleX402Payment(
  input: SettleX402Input,
): Promise<SettleX402Result> {
  const { context, pricing, sniffId, requestId, unpaidBody } = input;
  const { auth, wirePaymentPayload, wireRequirements, facilitator } = context;

  let settleResponse: SettleResponseType | undefined;
  let mode: FacilitatorMode = "fixture-receipt";

  if (facilitator !== null) {
    settleResponse = await facilitator
      .settle({
        x402Version: 2,
        paymentPayload: wirePaymentPayload,
        paymentRequirements: wireRequirements,
      })
      .catch((err: unknown) => {
        if (isFacilitatorError(err)) {
          throw new PaymentRequiredError(
            "settlement_failed",
            `Facilitator settle failed: ${err.message}`,
            unpaidBody,
            { status: err.status, body: err.body },
          );
        }
        throw err;
      });

    if (!settleResponse.success) {
      throw new PaymentRequiredError(
        "settlement_failed",
        settleResponse.errorReason ?? "Facilitator failed to settle",
        unpaidBody,
      );
    }
    mode =
      env.MORPH_FACILITATOR_MODE === "self-hosted-fallback"
        ? "self-hosted-fallback"
        : "morph-official";
  }

  // Receipt assembly. Always pass auth.from as payerFallback so the wallet-
  // history index can be written even when Morph's facilitator omits payer
  // from /v2/settle (it's optional in their response shape).
  const receipt = assembleReceipt({
    mode,
    pricing,
    sniffId,
    requestId,
    payerFallback: auth.from,
    ...(settleResponse !== undefined ? { settleResponse } : {}),
  });

  const payer = receipt.payer ?? auth.from;

  return { receipt, mode, payer, settleResponse };
}
