import { Hono } from "hono";
import {
  DiagnoseRequest,
  DiagnosePaidResponse,
  type DiagnosePaidResponse as DiagnosePaidResponseType,
  type DiagnoseUnpaidResponse,
  type FacilitatorMode,
} from "../schemas/index.js";
import { validateBody } from "../middleware/validate-body.js";
import { InternalError, PaymentRequiredError } from "../errors.js";
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
import { generateReportWithMeta } from "../orchestrator/index.js";
import { recordSlo, SLO_METRICS } from "../observability/slo.js";
import { getCurrentAudit } from "../observability/audit.js";
import { recordSniff } from "../wallet/history.js";
import { tryNormalizeAddress } from "../lib/address.js";

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

  // Canonical x402 v2 `paymentRequirements` is one entry from `accepts[]` —
  // amount is atomic units as a string, no extended fields. Our internal
  // `unpaidBody.payment` (PaymentRequirement) has `amount` as a DECIMAL string
  // for UI/SDK consumers; passing it to the facilitator caused HTTP 500 because
  // their parser reads `amount` as a big.Int. See PLAN.md.
  const wireRequirements = unpaidBody.accepts[0];
  if (!wireRequirements) {
    throw new InternalError("buildPaymentRequirements returned an empty accepts[]");
  }

  // Canonical x402 V2 `PaymentPayload` requires an `accepted` block (per
  // coinbase/x402 `typescript/packages/core/src/types/payments.ts`). Morph's
  // Go parser reads `paymentPayload.accepted.scheme` and returns HTTP 500
  // when it's missing — our header parser intentionally transforms incoming
  // bodies to the flat shape for internal use, so we reconstruct canonical
  // here before forwarding. Reusing `wireRequirements` keeps `accepted`
  // deep-equal to `paymentRequirements`, which is what facilitators expect.
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

  // 6) Run the report. Phase 1: /diagnose does NOT allow fixture fallback —
  //    transient provider errors degrade rows to "degraded" rather than fake
  //    fixture substitutes. See PLAN.md "Anti-pattern" list.
  const { payload: report, providerErrors, detectedApp } =
    await generateReportWithMeta({
      requestId,
      sniffId: body.sniffId,
      store: body.store,
      app: body.app,
      country: body.country,
      keywords: body.keywords,
      allowFixtureFallback: false,
    });

  // SLO S1: iOS US/UK/CA /diagnose should have appMetadata=='live'|'cached'
  //         AND keywordRank ∈ {live, cached}. If both are met, this counts
  //         as "ok"; otherwise it counts as "miss" for the SLO ratio.
  const isCoreMarket =
    body.store === "ios" && ["US", "GB", "CA"].includes(body.country);
  if (isCoreMarket) {
    const appMetaOk =
      report.dataProvenance.appMetadata === "live" ||
      report.dataProvenance.appMetadata === "cached";
    const rankOk =
      report.dataProvenance.keywordRank === "live" ||
      report.dataProvenance.keywordRank === "cached";
    recordSlo(SLO_METRICS.diagnoseLiveData, appMetaOk && rankOk);
  }

  // 7) Settle (skip in fixture mode).
  if (facilitator !== null) {
    settleResponse = await facilitator
      .settle({
        x402Version: 2,
        paymentPayload: wirePaymentPayload,
        paymentRequirements: wireRequirements,
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

  // 8a) Wallet-history index. After settle succeeds (and the receipt carries
  //     a real payer — fixture-receipt mode has none), persist the sniff
  //     against the payer's wallet so /api/v1/aso/wallet/sniffs can replay
  //     it without re-charging. Fail open on Redis errors — the user paid,
  //     so the paid response always returns; only the convenience index
  //     might be missing one entry. We also stamp the payer onto the current
  //     request audit for downstream structured log lines.
  if (env.WALLET_HISTORY_ENABLED && receipt.payer) {
    const normalizedPayer = tryNormalizeAddress(receipt.payer);
    if (normalizedPayer) {
      const audit = getCurrentAudit();
      if (audit) audit.payer = normalizedPayer;
      try {
        await recordSniff({
          payer: normalizedPayer,
          sniffId: body.sniffId,
          store: body.store,
          country: body.country,
          keywords: body.keywords,
          appId: detectedApp.id,
          appName: detectedApp.name,
          appDeveloper: detectedApp.developer,
          appIconUrl: detectedApp.iconUrl,
          overallScore: report.metadataScore?.overall ?? null,
          appMetadataProvenance: report.dataProvenance.appMetadata,
          settledAt: receipt.settledAt,
          report: paid,
        });
      } catch (err) {
        process.stderr.write(
          `${JSON.stringify({
            ts: new Date().toISOString(),
            level: "warn",
            requestId,
            event: "wallet_history_write_failed",
            payer: normalizedPayer,
            sniffId: body.sniffId,
            error: err instanceof Error ? err.message : String(err),
          })}\n`,
        );
      }
    }
  }

  // x402 V2 spec: PAYMENT-RESPONSE header carries Base64(JSON) of the
  // settlement receipt so x402 clients can pull it without re-parsing the body.
  const receiptHeader = Buffer.from(JSON.stringify(receipt)).toString("base64");
  c.header("PAYMENT-RESPONSE", receiptHeader);

  // Surface provider errors via a dedicated header so SDK consumers can show
  // honest "Apple rate-limited us, retry in 60s" copy without parsing the body
  // for degraded rows. Capped to keep header size manageable.
  if (providerErrors.length > 0) {
    c.header(
      "X-Sniffy-Provider-Errors",
      Buffer.from(JSON.stringify(providerErrors.slice(0, 5))).toString(
        "base64",
      ),
    );
  }

  return c.json(DiagnosePaidResponse.parse(paid));
});
