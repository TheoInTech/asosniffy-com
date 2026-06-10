import { Hono } from "hono";
import { buildOpenApiDocument } from "../openapi/document.js";
import { env } from "../env.js";

// Wave 0.5 — agent-discovery surfaces (the distribution wedge).
//
// /openapi.json — mechanical projection of the Zod contract (see
//   openapi/document.ts). Memoized: schemas are static for a process
//   lifetime, and the inlined document is a few hundred KB.
// /llms.txt — llmstxt.org-style plain-text orientation for LLM agents that
//   land on the API origin. The landing site ships its own copy at
//   landing/public/llms.txt; keep the two aligned on the same facts
//   (price anchors, endpoints, install paths).

export const metaRoute = new Hono();

let openApiJsonCache: string | null = null;

metaRoute.get("/openapi.json", (c) => {
  if (openApiJsonCache === null) {
    openApiJsonCache = JSON.stringify(buildOpenApiDocument());
  }
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(openApiJsonCache, 200, {
    "Content-Type": "application/json; charset=utf-8",
  });
});

function buildLlmsTxt(): string {
  const base = env.RESOURCE_BASE_URL ?? "https://gosniffyscraper-production.up.railway.app";
  return `# Sniffy — agent-buyable ASO intelligence (x402)

> App Store / Play Store optimization reports an AI agent can buy autonomously: no account, no API key, no subscription. HTTP 402 + x402 payment (USDC on Morph Mainnet, eip155:2818), $0.05-$1.00 per report. Every field carries a provenance label (live | cached | fixture | inferred).

## Why per-request beats a subscription

- Sniffy standard report: $0.20 per request, settled in seconds over x402.
- Incumbent ASO data access starts at ~$166/mo (AppTweak API floor), $15-549/mo dashboards, or $30k+/yr contracts (Sensor Tower) - all requiring a human with a credit card.
- An agent holding USDC can complete the entire flow here without a human: quote -> 402 offer -> sign (EIP-3009) -> report.

## Endpoints

- GET ${base}/api/v1/aso/sample: free fixture report, full paid shape, always works.
- POST ${base}/api/v1/aso/quote: free - detects the app, returns a shallow-scan teaser + the priced offer. Send X-Sniffy-Client header.
- POST ${base}/api/v1/aso/diagnose: paid - returns HTTP 402 with a machine-readable offer (PAYMENT-REQUIRED header, Base64 JSON); retry with PAYMENT-SIGNATURE to receive the full report + settlement receipt (PAYMENT-RESPONSE header).
- GET ${base}/openapi.json: full OpenAPI 3.0 contract, generated from the live validation schemas.

## How to pay (x402 V2)

1. POST /diagnose with your app + keywords + country -> 402 with the offer.
2. Sign an EIP-3009 transferWithAuthorization for the quoted USDC amount on Morph Mainnet (eip155:2818). Facilitator: https://morph-rails.morph.network/x402.
3. Retry with the PAYMENT-SIGNATURE header. Payments are non-refundable - check the quote first.

## Install paths

- Agent Skill: npx skills add TheoInTech/asosniffy-com (SKILL.md is the canonical API reference)
- MCP server (quote/diagnose/sample tools): @gosniffy/mcp
- CLI: npx sniffy quote|diagnose|sample (@gosniffy/cli)
- Typed TS SDK: @gosniffy/sdk (exports PaymentRequiredError for x402 interception)
- Free ASO knowledge MCP (no payment): @gosniffy/aso-knowledge

## Links

- Web: https://gosniffy.vercel.app
- Source (MIT): https://github.com/TheoInTech/asosniffy-com
- SKILL.md: https://raw.githubusercontent.com/TheoInTech/asosniffy-com/main/SKILL.md
`;
}

let llmsTxtCache: string | null = null;

metaRoute.get("/llms.txt", (c) => {
  if (llmsTxtCache === null) {
    llmsTxtCache = buildLlmsTxt();
  }
  c.header("Cache-Control", "public, max-age=3600");
  return c.text(llmsTxtCache);
});
