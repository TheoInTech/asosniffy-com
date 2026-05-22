import { Hono } from "hono";
import {
  SniffPackBuyRequest,
  SniffPackBuyResponse,
  type SniffPackBuyResponse as SniffPackBuyResponseType,
  SniffPackTiersResponse,
  type SniffPackTiersResponse as SniffPackTiersResponseType,
} from "../schemas/index.js";
import { validateBody } from "../middleware/validate-body.js";
import { siweAuth } from "../middleware/siwe-auth.js";
import { InternalError } from "../errors.js";
import { env } from "../env.js";
import {
  buildPackPricing,
  getSniffPack,
  listSniffPackQuotes,
} from "../payment/pricing.js";
import { buildPaymentRequirements } from "../payment/requirements.js";
import {
  settleX402Payment,
  verifyX402Payment,
} from "../payment/settlement.js";
import { newSniffId } from "../utils/ids.js";
import { getBalance, incrementBalance } from "../wallet/sniff-pack-balance.js";

// Sprint A/B — Sniff Pack purchase + balance routes. Three endpoints:
//
//   GET  /tiers     Public        → { tiers[] } public pack catalog
//   POST /buy       x402-paid     → 402 then 200 with receipt + new balance
//   GET  /balance   SIWE-auth     → { wallet, balance }
//
// /buy and /diagnose share the x402 verify+settle chain via the helpers in
// scraper/src/payment/settlement.ts. The shared module owns header parsing,
// amount-check, facilitator.verify, facilitator.settle, and receipt
// assembly; each route layers its own pre/post work (balance increment vs
// report generation) on top.

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

  // 3) Verify + settle. The shared helpers throw PaymentRequiredError on any
  //    failure (every 402 error code in the taxonomy) — error-handler
  //    middleware renders the canonical 402 body + X-Sniffy-Error-Code
  //    header. On success we get the assembled Receipt + payer wallet.
  const verifiedCtx = await verifyX402Payment({
    paymentHeader: c.req.header("payment-signature"),
    unpaidBody,
  });
  const { receipt, payer } = await settleX402Payment({
    context: verifiedCtx,
    pricing,
    sniffId: syntheticSniffId,
    requestId,
    unpaidBody,
  });

  // 4) Increment balance for the payer wallet. Pack-purchase is the only
  //    write path that's NOT fire-and-forget — a failure here means the
  //    user paid but didn't get credits, so we surface the error.
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
