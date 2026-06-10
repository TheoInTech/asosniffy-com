import { zodToJsonSchema } from "zod-to-json-schema";
import {
  DiagnoseRequest,
  DiagnosePaidResponse,
  DiagnoseUnpaidResponse,
  QuoteRequest,
  QuoteResponse,
  SampleResponse,
  SCHEMA_VERSION,
} from "../schemas/index.js";
import { env } from "../env.js";

// Wave 0.5 — machine-readable API contract for agent discovery (the
// distribution wedge). The document is built AT RUNTIME from the same Zod
// schemas that validate real traffic, so it cannot drift from the contract
// the way a hand-written or build-time-generated spec would. PLAN.md §9
// stays the prose contract; this is its mechanical projection.

type JsonSchema = Record<string, unknown>;

export interface OpenApiResponse {
  description: string;
  headers?: Record<string, { description: string; schema: JsonSchema }>;
  content?: Record<string, { schema: JsonSchema }>;
}

export interface OpenApiParameter {
  name: string;
  in: "header" | "query" | "path";
  required?: boolean;
  description?: string;
  schema: JsonSchema;
}

export interface OpenApiOperation {
  operationId: string;
  summary: string;
  description?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    required: boolean;
    content: Record<string, { schema: JsonSchema }>;
  };
  responses: Record<string, OpenApiResponse>;
}

export interface OpenApiDocument {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{ url: string; description?: string }>;
  paths: Record<string, { get?: OpenApiOperation; post?: OpenApiOperation }>;
  // x402 discovery extension: enough for an agent (or a Bazaar-style index)
  // to know how to pay without fetching a 402 first.
  "x-x402": {
    facilitator: string;
    network: string;
    scheme: string;
    asset: string;
    note: string;
  };
}

function schemaOf(zodSchema: Parameters<typeof zodToJsonSchema>[0]): JsonSchema {
  // $refStrategy "none" inlines everything — bigger document, but every
  // operation is self-contained, which is what schema-naive agents handle
  // best. The route memoizes the serialized result so size only costs once.
  return zodToJsonSchema(zodSchema, {
    target: "openApi3",
    $refStrategy: "none",
  }) as JsonSchema;
}

const PUBLIC_BASE_URL = "https://gosniffyscraper-production.up.railway.app";

export function buildOpenApiDocument(): OpenApiDocument {
  const clientHeader: OpenApiParameter = {
    name: "X-Sniffy-Client",
    in: "header",
    required: false,
    description:
      "Soft client attestation, e.g. '@gosniffy/sdk@0.2.0'. Required on /quote (anonymous scrapers are rejected); recommended everywhere.",
    schema: { type: "string" },
  };

  return {
    openapi: "3.0.3",
    info: {
      title: "Sniffy — ASO Intelligence API",
      version: SCHEMA_VERSION,
      description:
        "Agent-buyable App Store Optimization intelligence. No account, no API key, no subscription: " +
        "the free /quote returns a teaser plus a priced offer; /diagnose returns HTTP 402 with a " +
        "machine-readable x402 payment offer, and settles USDC on Morph Mainnet (eip155:2818) per request " +
        "($0.05 quick / $0.20 standard / $1.00 expert base). Every report field carries a provenance label " +
        "(live | cached | fixture | inferred). Client kits: @gosniffy/sdk, @gosniffy/cli, @gosniffy/mcp; " +
        "Agent Skill: npx skills add TheoInTech/asosniffy-com.",
    },
    servers: [{ url: env.RESOURCE_BASE_URL ?? PUBLIC_BASE_URL }],
    "x-x402": {
      facilitator: "https://morph-rails.morph.network/x402",
      network: "eip155:2818",
      scheme: "exact",
      asset: "USDC",
      note:
        "POST /api/v1/aso/diagnose without PAYMENT-SIGNATURE returns 402 with the canonical offer in " +
        "the PAYMENT-REQUIRED header (Base64 JSON) and body. Sign per x402 V2 (EIP-3009 transferWithAuthorization), " +
        "retry with PAYMENT-SIGNATURE; the 200 carries the settlement receipt in PAYMENT-RESPONSE.",
    },
    paths: {
      "/api/v1/aso/sample": {
        get: {
          operationId: "getSample",
          summary: "Free fixture report — full paid-response shape, no wallet needed",
          description:
            "Always works, even when every live provider is down. Use it to see exactly what /diagnose returns before paying.",
          responses: {
            "200": {
              description: "Complete sample diagnosis (fixture data, sample: true)",
              content: { "application/json": { schema: schemaOf(SampleResponse) } },
            },
          },
        },
      },
      "/api/v1/aso/quote": {
        post: {
          operationId: "postQuote",
          summary: "Free quote — app detection, shallow-scan teaser, and the priced offer",
          parameters: [clientHeader],
          requestBody: {
            required: true,
            content: { "application/json": { schema: schemaOf(QuoteRequest) } },
          },
          responses: {
            "200": {
              description:
                "Detected app identity, shallowScan teaser (category, ratings, one preview keyword), pricing breakdown, coverage estimate",
              content: { "application/json": { schema: schemaOf(QuoteResponse) } },
            },
          },
        },
      },
      "/api/v1/aso/diagnose": {
        post: {
          operationId: "postDiagnose",
          summary: "Paid diagnosis — x402 per-request payment, full ASO report",
          description:
            "Call once without payment to receive the 402 offer; sign it and retry with PAYMENT-SIGNATURE. " +
            "Alternatively spend a prepaid Sniff Pack credit via Authorization: Bearer <siwe-session>. " +
            "Mainnet payments are non-refundable — agents should confirm the quoted price with a human " +
            "when policy requires it.",
          parameters: [
            clientHeader,
            {
              name: "PAYMENT-SIGNATURE",
              in: "header",
              required: false,
              description:
                "x402 V2 payment payload (Base64 JSON, EIP-3009 signed). Omit on the first call to receive the 402 offer.",
              schema: { type: "string" },
            },
            {
              name: "Authorization",
              in: "header",
              required: false,
              description:
                "Bearer <siwe-session-token> to spend a Sniff Pack credit instead of paying per-call.",
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: schemaOf(DiagnoseRequest) } },
          },
          responses: {
            "402": {
              description:
                "Payment required — machine-readable x402 offer (judging-critical contract; this is a real 402, not a UI paywall)",
              headers: {
                "PAYMENT-REQUIRED": {
                  description: "Base64 JSON of the canonical x402 offer — @x402/fetch-style clients read this without parsing the body",
                  schema: { type: "string" },
                },
              },
              content: {
                "application/json": { schema: schemaOf(DiagnoseUnpaidResponse) },
              },
            },
            "200": {
              description:
                "Full diagnosis report with receipt (network, amount, tx hash, settledAt) and per-field provenance",
              headers: {
                "PAYMENT-RESPONSE": {
                  description: "Base64 JSON of the settlement receipt (x402 V2)",
                  schema: { type: "string" },
                },
              },
              content: {
                "application/json": { schema: schemaOf(DiagnosePaidResponse) },
              },
            },
          },
        },
      },
    },
  };
}
