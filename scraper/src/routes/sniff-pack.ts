import { Hono } from "hono";
import {
  SniffPackBuyRequest,
  SniffPackBuyResponse,
  type SniffPackBuyResponse as SniffPackBuyResponseType,
  SniffPackTiersResponse,
  type SniffPackTiersResponse as SniffPackTiersResponseType,
  type FacilitatorMode,
} from "../schemas/index.js";
import { validateBody } from "../middleware/validate-body.js";
import { siweAuth } from "../middleware/siwe-auth.js";
import { InternalError, PaymentRequiredError } from "../errors.js";
import { env } from "../env.js";
import {
  buildPackPricing,
  getSniffPack,
  listSniffPackQuotes,
} from "../payment/pricing.js";
import { buildPaymentRequirements } from "../payment/requirements.js";
import { assembleReceipt } from "../payment/receipt.js";
import {
  ExpiredAuthorizationError,
  MalformedHeaderError,
  WrongNetworkError,
  parsePaymentHeader,
} from "../payment/header.js";
import {
  FacilitatorError,
  type SettleResponseType,
} from "../payment/facilitator/index.js";
import { getFacilitator } from "../services/facilitator.js";
import { newSniffId } from "../utils/ids.js";
import { getBalance, incrementBalance } from "../wallet/sniff-pack-balance.js";

// Sprint A/B — Sniff Pack purchase + balance routes. Three endpoints:
//
//   GET  /tiers     Public        → { tiers[] } public pack catalog
//   POST /buy       x402-paid     → 402 then 200 with receipt + new balance
//   GET  /balance   SIWE-auth     → { wallet, balance }
//
// /buy intentionally mirrors the diagnose-route x402 flow (parse → amount
// check → verify → settle → assemble receipt) rather than extracting a shared
// helper — the two flows differ in step 6 (report generation vs balance
// increment) and downstream metadata (sniffId vs packId), and a premature
// helper here would obscure that the verify+settle path is on the critical
// payment-safety surface. A focused extraction lands when a third payment
// site joins.

// Cross-realm fallback for FacilitatorError identification — mirrors the
// matching helper in routes/diagnose.ts. Vitest can hand the route a
// FacilitatorError from a different module realm than the one statically
// imported here, so an `instanceof` check on its own is brittle.
function isFacilitatorError(err: unknown): err is FacilitatorError {
  return (
    err instanceof FacilitatorError ||
    (err instanceof Error && err.name === "FacilitatorError")
  );
}

export const sniffPackRoute = new Hono();

// ---------- Public pack catalog ----------
sniffPackRoute.get("/tiers", (c) => {
  const response: SniffPackTiersResponseType = {
    tiers: listSniffPackQuotes(),
  };
  return c.json(SniffPackTiersResponse.parse(response));
});

// ---------- Authenticated balance read ----------
sniffPackRoute.get("/balance", siweAuth(), async (c) => {
  const address = c.get("walletAddress");
  if (!address) {
    // Defensive: siweAuth() set this on success. Mirror the wallet route's
    // 401 shape so frontends can branch consistently.
    return c.json(
      {
        error: {
          code: "session_invalid",
          message: "Session missing on context",
        },
      },
      401,
    );
  }
  const balance = await getBalance(address);
  return c.json({ wallet: address, balance });
});

// ---------- Pack purchase ----------
sniffPackRoute.post("/buy", validateBody(SniffPackBuyRequest), async (c) => {
  const body = c.get("parsedBody") as import("zod").infer<
    typeof SniffPackBuyRequest
  >;
  const requestId = c.get("requestId");

  // 1) Resolve the pack and compute its pricing. The pack id is already Zod-
  //    validated, but getSniffPack() guards against any future drift between
  //    the schema enum and the pricing table.
  const pack = getSniffPack(body.packId);
  if (!pack) {
    throw new InternalError(`Unknown sniff pack id: ${body.packId}`);
  }
  const pricing = buildPackPricing(body.packId);

  // 2) Use a synthetic sniff id for the 402 envelope. Pack purchases don't
  //    have a preceding /quote, but buildPaymentRequirements requires a
  //    SniffId-shaped identifier. The id is short-lived (only present in the
  //    402 body + receipt for this request) and never persists.
  const syntheticSniffId = newSniffId();

  const unpaidBody = buildPaymentRequirements({
    sniffId: syntheticSniffId,
    pricing,
    resourceUrl: `${env.RESOURCE_BASE_URL}/api/v1/aso/sniff-pack/buy`,
    resourceDescription: `Sniffy Sniff Pack: ${pack.label} (${pack.credits} prepaid sniffs)`,
  });

  // 3) Read PAYMENT-SIGNATURE header.
  const rawHeader = c.req.header("payment-signature");
  if (!rawHeader || rawHeader.trim().length === 0) {
    throw new PaymentRequiredError(
      "payment_required",
      "PAYMENT-SIGNATURE header is required",
      unpaidBody,
    );
  }

  // 4) Parse header, mapping typed errors back to the taxonomy.
  let payload: NonNullable<ReturnType<typeof parsePaymentHeader>>;
  try {
    const parsed = parsePaymentHeader(rawHeader, env.MORPH_NETWORK);
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

  // 5) Strict amount/payTo match. Pack price is fixed server-side; reject any
  //    client trying to settle a Pack 250 by signing a Pack 10 amount.
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

  // 6) Facilitator verify (skip in fixture mode).
  const facilitator = getFacilitator();
  let settleResponse: SettleResponseType | undefined;
  let mode: FacilitatorMode = "fixture-receipt";

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

    // 7) Settle.
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

  // 8) Receipt assembly + balance increment. We use auth.from as the payer
  //    fallback in the same fashion as /diagnose, so fixture-receipt mode
  //    still gets a meaningful payer onto the balance ledger.
  const receipt = assembleReceipt({
    mode,
    pricing,
    sniffId: syntheticSniffId,
    requestId,
    payerFallback: auth.from,
    ...(settleResponse !== undefined ? { settleResponse } : {}),
  });

  const payer = receipt.payer ?? auth.from;
  const snapshot = await incrementBalance(payer, pack.credits);

  const response: SniffPackBuyResponseType = {
    requestId,
    packId: body.packId,
    creditsGranted: pack.credits,
    newBalance: snapshot.balance,
    receipt,
  };

  return c.json(SniffPackBuyResponse.parse(response));
});
