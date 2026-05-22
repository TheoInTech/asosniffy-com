import { Hono } from "hono";
import {
  QuoteRequest,
  QuoteResponse,
  type QuoteResponse as QuoteResponseType,
} from "../schemas/index.js";
import { validateBody } from "../middleware/validate-body.js";
import { getDetectedApp } from "../data/detect.js";
import { getShallowScan } from "../data/shallow-scan.js";
import { buildCoverage } from "../data/coverage.js";
import { buildSavingsNote, computePricing } from "../payment/pricing.js";
import { hasRecentDiagnose } from "../wallet/refresh-sniff.js";
import { newSniffId } from "../utils/ids.js";

export const quoteRoute = new Hono();

quoteRoute.post("/", validateBody(QuoteRequest), async (c) => {
  const body = c.get("parsedBody") as import("zod").infer<typeof QuoteRequest>;
  const requestId = c.get("requestId");
  const sniffId = newSniffId();

  // Detect first; pass the result to shallowScan so we don't double-fetch.
  // (Cache would dedup at the provider layer anyway, but the second hit
  // would incorrectly report provenance:"cached" within the same request.)
  // Phase 1: /quote does NOT allow fixture fallback — transient provider
  // errors surface as degraded rows + coverage.providerErrors[].
  const detect = await getDetectedApp({
    store: body.store,
    app: body.app,
    country: body.country,
    allowFixtureFallback: false,
  });
  const shallow = await getShallowScan(
    {
      store: body.store,
      app: body.app,
      country: body.country,
      keywords: body.keywords,
      allowFixtureFallback: false,
    },
    detect,
  );

  // Sprint A — refresh-sniff discount. If we observed a successful diagnose
  // for this (store, country, appId) tuple within the last 30 days, halve
  // the quoted price. Read-only Redis lookup; failures degrade silently to
  // no-discount so a Redis blip never overcharges a returning founder.
  const refreshDiscount = await hasRecentDiagnose({
    store: body.store,
    country: body.country,
    appId: detect.appRecord?.id ?? detect.detectedApp.id,
  });

  const pricing = computePricing({
    keywords: body.keywords,
    countries: [body.country],
    currency: "USDC",
    refreshDiscount,
  });

  const coverage = buildCoverage({
    appMetadata: detect.provenance,
    keywordRank: shallow.shallowScan.previewKeyword.provenance,
    providerErrors: shallow.providerErrors,
  });

  const response: QuoteResponseType = {
    requestId,
    sniffId,
    store: body.store,
    country: body.country,
    detectedApp: detect.detectedApp,
    pricing,
    coverage,
    shallowScan: shallow.shallowScan,
    savingsNote: buildSavingsNote(pricing.estimatedTotal),
    next: {
      paidEndpoint: "/api/v1/aso/diagnose",
    },
  };

  return c.json(QuoteResponse.parse(response));
});
