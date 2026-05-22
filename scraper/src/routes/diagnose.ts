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
import { markDiagnoseCompleted } from "../wallet/refresh-sniff.js";
import { tryDecrementBalance } from "../wallet/sniff-pack-balance.js";
import { resolveSession } from "../wallet/session.js";
import { tryNormalizeAddress } from "../lib/address.js";
import { clampReportToContract } from "../lib/clamp-report.js";

// Sprint B — pack-credit spend. One credit funds one paid /diagnose call,
// regardless of tier. Users can choose between this path (Authorization
// Bearer with positive balance) and the legacy x402 path (PAYMENT-SIGNATURE
// EIP-3009 authorization) per call. The two are mutually exclusive at the
// route level — Bearer takes priority when both are sent.
const CREDITS_PER_DIAGNOSE = 1;

function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authorizationHeader);
  return match && match[1] ? match[1] : null;
}

// Duck-type fallback for cross-realm Error identification: in tests, vitest
// can hand the route a FacilitatorError instance from a different module
// realm than the one diagnose.ts statically imported, breaking the
// `instanceof` check. The `.name === "FacilitatorError"` fallback keeps the
// production path (single-realm) unchanged while letting integration tests
// inject FacilitatorErrors through the mocked facilitator without resorting
// to fragile module-cache gymnastics.
function isFacilitatorError(err: unknown): err is FacilitatorError {
  return (
    err instanceof FacilitatorError ||
    (err instanceof Error && err.name === "FacilitatorError")
  );
}

export const diagnoseRoute = new Hono();

diagnoseRoute.post("/", validateBody(DiagnoseRequest), async (c) => {
  const body = c.get("parsedBody") as import("zod").infer<typeof DiagnoseRequest>;
  const requestId = c.get("requestId");

  // 1) Compute pricing + payment requirements up front so we can use them as
  //    the 402 body at any failure point. Sprint B — tier passes through to
  //    the base-price selector in pricing.ts; omitting it preserves the
  //    legacy $0.03 base for back-compat.
  const pricing = computePricing({
    keywords: body.keywords,
    countries: [body.country],
    currency: "USDC",
    ...(body.tier !== undefined ? { tier: body.tier } : {}),
  });

  const unpaidBody: DiagnoseUnpaidResponse = buildPaymentRequirements({
    sniffId: body.sniffId,
    pricing,
    resourceUrl: `${env.RESOURCE_BASE_URL}/api/v1/aso/diagnose`,
    resourceDescription: "Sniffy ASO diagnosis report",
  });

  // 1a) Sprint B — Sniff Pack credit spend path. When the caller presents an
  //     Authorization: Bearer <siwe-session-token> header, this run is paid
  //     with a credit from the wallet's Pack balance instead of an x402
  //     per-call charge. Bearer takes priority over PAYMENT-SIGNATURE when
  //     both are sent — the user already authenticated, no reason to re-pay.
  //     A missing or invalid session here returns 401 (not 402) — we don't
  //     silently fall through to x402 because that would mask client bugs.
  const bearerToken = extractBearerToken(c.req.header("authorization"));
  if (bearerToken) {
    const session = await resolveSession(bearerToken);
    if (!session) {
      return c.json(
        {
          error: {
            code: "session_invalid" as const,
            message: "Session token is invalid or expired",
          },
        },
        401,
      );
    }

    const dec = await tryDecrementBalance(
      session.address,
      CREDITS_PER_DIAGNOSE,
    );
    if (!dec.success) {
      throw new PaymentRequiredError(
        "insufficient_balance",
        `Sniff Pack balance ${dec.balance} is below the ${CREDITS_PER_DIAGNOSE} credit cost of this diagnose. Buy another pack at /api/v1/aso/sniff-pack/buy or pay per-call via PAYMENT-SIGNATURE.`,
        unpaidBody,
      );
    }

    // Pack-credit path: skip x402 verify+settle entirely. The credit ledger
    // in Redis is the settlement record; assembleReceipt below mints a
    // 0xpack…-prefixed synthetic tx hash with amount=0.00.
    const {
      payload: report,
      providerErrors: _providerErrors,
      detectedApp: packDetectedApp,
    } = await generateReportWithMeta({
      requestId,
      sniffId: body.sniffId,
      store: body.store,
      app: body.app,
      country: body.country,
      keywords: body.keywords,
      allowFixtureFallback: false,
      ...(body.tier !== undefined ? { tier: body.tier } : {}),
    });

    // SLO S1: pack-credit paid runs still count toward the live-data SLO,
    // matching the x402 path so the metric reflects all paid traffic.
    const packCoreMarket =
      body.store === "ios" && ["US", "GB", "CA"].includes(body.country);
    if (packCoreMarket) {
      const appMetaOk =
        report.dataProvenance.appMetadata === "live" ||
        report.dataProvenance.appMetadata === "cached";
      const rankOk =
        report.dataProvenance.keywordRank === "live" ||
        report.dataProvenance.keywordRank === "cached";
      recordSlo(SLO_METRICS.diagnoseLiveData, appMetaOk && rankOk);
    }

    const packReceipt = assembleReceipt({
      mode: "pack-credit",
      pricing,
      sniffId: body.sniffId,
      requestId,
      // Use the SIWE-authenticated wallet as the payer of record so
      // wallet-history indexing keys correctly against this user.
      payerFallback: session.address,
    });

    const packPaid: DiagnosePaidResponseType = {
      requestId,
      sniffId: body.sniffId,
      receipt: packReceipt,
      ...report,
      packCredit: {
        wallet: session.address,
        creditsConsumed: CREDITS_PER_DIAGNOSE,
        balanceRemaining: dec.balance,
      },
    };

    // Refresh-sniff marker (same semantics as x402 path) — a pack-paid
    // diagnose is still a paid diagnose, so subsequent /quote calls for the
    // same tuple deserve the refresh discount.
    void markDiagnoseCompleted({
      store: body.store,
      country: body.country,
      appId: packDetectedApp.id,
    });

    // Wallet-history index — pack-credit always has a payer (the SIWE wallet)
    // so we skip the malformed-payer log branch and write directly.
    if (env.WALLET_HISTORY_ENABLED) {
      const normalizedPayer = tryNormalizeAddress(session.address);
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
            appId: packDetectedApp.id,
            appName: packDetectedApp.name,
            appDeveloper: packDetectedApp.developer,
            appIconUrl: packDetectedApp.iconUrl,
            overallScore: report.metadataScore?.overall ?? null,
            appMetadataProvenance: report.dataProvenance.appMetadata,
            settledAt: packReceipt.settledAt,
            report: packPaid,
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

    return c.json(
      DiagnosePaidResponse.parse(clampReportToContract(packPaid, { requestId })),
    );
  }

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

  // 6) Run the report. Phase 1: /diagnose does NOT allow fixture fallback —
  //    transient provider errors degrade rows to "degraded" rather than fake
  //    fixture substitutes. See PLAN.md "Anti-pattern" list.
  //
  //    Sprint B: pass body.tier so Quick tier short-circuits to the template
  //    synthesizer (no OpenAI call, no token cost) while Standard / Expert
  //    run the full AI path.
  const { payload: report, providerErrors, detectedApp } =
    await generateReportWithMeta({
      requestId,
      sniffId: body.sniffId,
      store: body.store,
      app: body.app,
      country: body.country,
      keywords: body.keywords,
      allowFixtureFallback: false,
      ...(body.tier !== undefined ? { tier: body.tier } : {}),
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
    mode = env.MORPH_FACILITATOR_MODE === "self-hosted-fallback"
      ? "self-hosted-fallback"
      : "morph-official";
  }

  // 8) Assemble receipt + final paid response. We always pass auth.from as
  //    payerFallback so the wallet-history index can be written even when
  //    Morph's facilitator omits payer from /v2/settle (it's optional in their
  //    response shape). settleResponse.payer still wins when present.
  const receipt = assembleReceipt({
    mode,
    pricing,
    sniffId: body.sniffId,
    requestId,
    payerFallback: auth.from,
    ...(settleResponse !== undefined ? { settleResponse } : {}),
  });

  const paid: DiagnosePaidResponseType = {
    requestId,
    sniffId: body.sniffId,
    receipt,
    ...report,
    // x402 path doesn't consume a Sniff Pack credit. Explicit null keeps the
    // wire shape stable across both payment modes for consumers.
    packCredit: null,
  };

  // 8a) Refresh-sniff marker. Sets a 30-day TTL key keyed by (store, country,
  //     appId) so the next /quote for the same tuple returns at 50% off. Fail
  //     open on Redis errors (the helper swallows them) — a missed marker just
  //     means the next quote pays full price, never that we overcharge.
  void markDiagnoseCompleted({
    store: body.store,
    country: body.country,
    appId: detectedApp.id,
  });

  // 8b) Wallet-history index. After settle succeeds (and the receipt carries
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
    } else {
      // receipt.payer was present but failed checksum/format validation. Don't
      // throw — the user paid and the response goes out fine — but surface it
      // so a malformed-payer regression can't sneak in silently.
      process.stderr.write(
        `${JSON.stringify({
          ts: new Date().toISOString(),
          level: "warn",
          requestId,
          event: "wallet_history_skipped",
          reason: "payer_malformed",
          rawPayer: receipt.payer,
          sniffId: body.sniffId,
        })}\n`,
      );
    }
  } else {
    // History-index write skipped. Logged so we can tell at a glance whether
    // the index is being populated (the original bug was a silent skip when
    // Morph's facilitator omitted payer and we had no fallback).
    process.stderr.write(
      `${JSON.stringify({
        ts: new Date().toISOString(),
        level: "warn",
        requestId,
        event: "wallet_history_skipped",
        reason: env.WALLET_HISTORY_ENABLED ? "payer_missing" : "history_disabled",
        sniffId: body.sniffId,
      })}\n`,
    );
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

  // Response-boundary sanitizer. Payment is settled on Morph mainnet and
  // non-refundable; the paying user should never see a 400 because some
  // producer drifted past a `.min()/.max()` schema constraint. The
  // sanitizer clamps the few constrained numeric fields back into range
  // and emits a structured warn-log per clamp so any drift is observable.
  // See scraper/src/lib/clamp-report.ts.
  const sanitized = clampReportToContract(paid, { requestId });
  return c.json(DiagnosePaidResponse.parse(sanitized));
});
