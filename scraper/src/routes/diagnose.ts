import { Hono } from "hono";
import {
  DiagnoseRequest,
  DiagnosePaidResponse,
  type DiagnosePaidResponse as DiagnosePaidResponseType,
  type DiagnoseUnpaidResponse,
  type FacilitatorMode,
} from "../schemas/index.js";
import { validateBody } from "../middleware/validate-body.js";
import { PaymentRequiredError } from "../errors.js";
import { env } from "../env.js";
import { computePricing } from "../payment/pricing.js";
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
import { generateReport } from "../orchestrator/index.js";

export const diagnoseRoute = new Hono();

diagnoseRoute.post("/", validateBody(DiagnoseRequest), async (c) => {
  const body = c.get("parsedBody") as import("zod").infer<typeof DiagnoseRequest>;
  const requestId = c.get("requestId");

  // 1) Compute pricing + payment requirements up front so we can use them as
  //    the 402 body at any failure point.
  const pricing = computePricing({
    keywords: body.keywords,
    countries: [body.country],
    currency: "USDC",
    network: "morph-hoodi",
  });

  const unpaidBody: DiagnoseUnpaidResponse = buildPaymentRequirements({
    sniffId: body.sniffId,
    pricing,
    resourceUrl: `${env.RESOURCE_BASE_URL}/api/v1/aso/diagnose`,
    resourceDescription: "Sniffy ASO diagnosis report",
  });

  // 2) Read header. Hono normalizes header names to lower-case lookup keys.
  const rawHeader = c.req.header("payment-signature");
  if (!rawHeader || rawHeader.trim().length === 0) {
    throw new PaymentRequiredError(
      "payment_required",
      "PAYMENT-SIGNATURE header is required",
      unpaidBody,
    );
  }

  // 3) Parse header, mapping the typed errors back to our taxonomy.
  let payload: NonNullable<ReturnType<typeof parsePaymentHeader>>;
  try {
    const parsed = parsePaymentHeader(rawHeader, env.MORPH_NETWORK);
    if (parsed === null) {
      throw new PaymentRequiredError(
        "malformed_payment_header",
        "PAYMENT-SIGNATURE is empty",
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

  // 4) Strict amount/payTo match against what we advertised (decision #18).
  //    Asset address isn't carried in EIP-3009 authorization — the facilitator
  //    binds the asset by signature → so we don't re-check it here.
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

  // 5) Facilitator verify (skip in fixture mode).
  const facilitator = getFacilitator();
  let settleResponse: SettleResponseType | undefined;
  let mode: FacilitatorMode = "fixture-receipt";

  if (facilitator !== null) {
    const verifyResponse = await facilitator
      .verify({
        x402Version: 2,
        paymentPayload: payload,
        paymentRequirements: unpaidBody.payment,
      })
      .catch((err: unknown) => {
        if (err instanceof FacilitatorError) {
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

  // 6) Run the (fixture-overlay) report.
  const report = await generateReport({
    requestId,
    sniffId: body.sniffId,
    store: body.store,
    app: body.app,
    country: body.country,
    keywords: body.keywords,
  });

  // 7) Settle (skip in fixture mode).
  if (facilitator !== null) {
    settleResponse = await facilitator
      .settle({
        x402Version: 2,
        paymentPayload: payload,
        paymentRequirements: unpaidBody.payment,
      })
      .catch((err: unknown) => {
        if (err instanceof FacilitatorError) {
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
    mode = env.MORPH_FACILITATOR_MODE === "self-hosted-fallback"
      ? "self-hosted-fallback"
      : "morph-official";
  }

  // 8) Assemble receipt + final paid response.
  const receipt = assembleReceipt({
    mode,
    pricing,
    sniffId: body.sniffId,
    requestId,
    ...(settleResponse !== undefined ? { settleResponse } : {}),
  });

  const paid: DiagnosePaidResponseType = {
    requestId,
    sniffId: body.sniffId,
    receipt,
    ...report,
  };

  return c.json(DiagnosePaidResponse.parse(paid));
});
