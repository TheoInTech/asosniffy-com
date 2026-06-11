import { Hono } from "hono";
import {
  DiagnoseRequest,
  DiagnosePaidResponse,
  type DiagnosePaidResponse as DiagnosePaidResponseType,
  type DiagnoseUnpaidResponse,
} from "../schemas/index.js";
import { validateBody } from "../middleware/validate-body.js";
import { PaymentRequiredError } from "../errors.js";
import { env } from "../env.js";
import { computePricing } from "../payment/pricing.js";
import {
  currentEnabledFeatures,
  projectedCogsCentsFor,
  resolvePaidFeatures,
} from "../payment/cogs.js";
import {
  setBudgetCents,
  setRevenueCents,
} from "../observability/cogs-ledger.js";
import { buildPaymentRequirements } from "../payment/requirements.js";
import { assembleReceipt } from "../payment/receipt.js";
import {
  settleX402Payment,
  verifyX402Payment,
} from "../payment/settlement.js";
import { generateReportWithMeta } from "../orchestrator/index.js";
import { recordSlo, SLO_METRICS } from "../observability/slo.js";
import { getCurrentAudit } from "../observability/audit.js";
import { recordSniff } from "../wallet/history.js";
import { markDiagnoseCompleted } from "../wallet/refresh-sniff.js";
import { tryDecrementBalance } from "../wallet/sniff-pack-balance.js";
import { resolveSession } from "../wallet/session.js";
import { tryNormalizeAddress } from "../lib/address.js";
import { clampReportToContract } from "../lib/clamp-report.js";
import { redactForShowcase } from "../lib/redact-for-showcase.js";
import { saveShowcase } from "../insights/store.js";

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

// Sprint C — opt-out for the public showcase. Default behavior is to write
// the redacted report; this header lets the caller skip the write per
// request. Accepts "1", "true", or "yes" (case-insensitive). Anything else
// (including absent, "0", "false") leaves the default write enabled.
function shouldIndexInShowcase(noIndexHeader: string | undefined): boolean {
  if (noIndexHeader === undefined) return true;
  const normalized = noIndexHeader.trim().toLowerCase();
  return !(normalized === "1" || normalized === "true" || normalized === "yes");
}

export const diagnoseRoute = new Hono();

diagnoseRoute.post("/", validateBody(DiagnoseRequest), async (c) => {
  const body = c.get("parsedBody") as import("zod").infer<typeof DiagnoseRequest>;
  const requestId = c.get("requestId");

  // 1) Compute pricing + payment requirements up front so we can use them as
  //    the 402 body at any failure point.
  //
  //    Cost-aware pricing: a missing tier NORMALIZES to "standard" (no more
  //    underwater $0.03 legacy path that ran premium LLM work). The resolved
  //    paid-feature set is derived from (tier defaults ∪ addons) ∩ enabled,
  //    and that SAME set is threaded into generateReportWithMeta so the
  //    orchestrator runs exactly what the price paid for (x402 is pay-first).
  const tier = body.tier ?? "standard";
  const enabledFeatures = currentEnabledFeatures();
  const pricing = computePricing({
    keywords: body.keywords,
    countries: [body.country],
    currency: "USDC",
    tier,
    ...(body.addons !== undefined ? { addons: body.addons } : {}),
    enabledFeatures,
  });
  // Record revenue + projected-COGS budget on the ledger so the end-of-request
  // cogs_ledger log can compute margin. Budget = Σ projected COGS of the paid
  // features (gross, pre-discount — the discount cuts revenue, not COGS).
  const paidFeatures = resolvePaidFeatures(tier, body.addons, enabledFeatures);
  setRevenueCents(estimatedTotalToCents(pricing.estimatedTotal));
  setBudgetCents(projectedCogsCentsFor(paidFeatures));

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
      tier,
      ...(body.addons !== undefined ? { addons: body.addons } : {}),
      // Wave 1 — paste-in calibration passthrough (see DiagnoseRequest).
      ...(body.currentKeywordsField !== undefined
        ? { currentKeywordsField: body.currentKeywordsField }
        : {}),
      ...(body.ascDailyImpressions !== undefined
        ? { ascDailyImpressions: body.ascDailyImpressions }
        : {}),
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

    const packResponse = DiagnosePaidResponse.parse(
      clampReportToContract(packPaid, { requestId }),
    );

    // Sprint C — public showcase write (pack-credit path). Fire-and-forget;
    // honors the per-request opt-out header. Default behavior is to index.
    if (shouldIndexInShowcase(c.req.header("x-sniffy-no-index"))) {
      const { entry, report: showcaseReport } = redactForShowcase({
        report: packResponse,
        store: body.store,
        country: body.country,
        appId: packDetectedApp.id,
        appName: packDetectedApp.name,
        appDeveloper: packDetectedApp.developer,
        iconUrl: packDetectedApp.iconUrl ?? null,
      });
      void saveShowcase({ entry, report: showcaseReport });
    }

    return c.json(packResponse);
  }

  // 2-5) Verify the x402 payment chain via the shared helper. Throws
  //       PaymentRequiredError with the matching code (payment_required,
  //       malformed_payment_header, wrong_network, expired_authorization,
  //       amount_mismatch, verification_failed) on any failure. Returns
  //       the VerifiedX402Context we'll pass to settleX402Payment after
  //       the report runs — verify is sync-with-payment, settle waits
  //       until we know the report assembled cleanly.
  const verifiedCtx = await verifyX402Payment({
    paymentHeader: c.req.header("payment-signature"),
    unpaidBody,
  });

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
      tier,
      ...(body.addons !== undefined ? { addons: body.addons } : {}),
      // Wave 1 — paste-in calibration passthrough (see DiagnoseRequest).
      ...(body.currentKeywordsField !== undefined
        ? { currentKeywordsField: body.currentKeywordsField }
        : {}),
      ...(body.ascDailyImpressions !== undefined
        ? { ascDailyImpressions: body.ascDailyImpressions }
        : {}),
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

  // 7-8) Settle + receipt via the shared helper. Throws
  //       PaymentRequiredError("settlement_failed") on facilitator failures;
  //       otherwise returns the assembled Receipt + payer address ready for
  //       the wallet-history index and showcase write below.
  const { receipt } = await settleX402Payment({
    context: verifiedCtx,
    pricing,
    sniffId: body.sniffId,
    requestId,
    unpaidBody,
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
  const parsedPaid = DiagnosePaidResponse.parse(sanitized);

  // Sprint C — public showcase write (x402 path). Fire-and-forget; honors
  // X-Sniffy-No-Index for per-request opt-out. The redaction strips wallet,
  // tx hash, request/sniff IDs, and the HMAC signature before the report
  // touches the showcase store.
  if (shouldIndexInShowcase(c.req.header("x-sniffy-no-index"))) {
    const { entry, report: showcaseReport } = redactForShowcase({
      report: parsedPaid,
      store: body.store,
      country: body.country,
      appId: detectedApp.id,
      appName: detectedApp.name,
      appDeveloper: detectedApp.developer,
      iconUrl: detectedApp.iconUrl ?? null,
    });
    void saveShowcase({ entry, report: showcaseReport });
  }

  return c.json(parsedPaid);
});

// Parse a fixed-2-decimal USD amount string ("0.40") to integer cents (40).
// Mirrors parseCents in payment/pricing.ts; kept local to avoid exporting it.
function estimatedTotalToCents(amount: string): number {
  const [dollars, fraction = ""] = amount.split(".");
  return Number(dollars ?? "0") * 100 + Number((fraction + "00").slice(0, 2));
}
