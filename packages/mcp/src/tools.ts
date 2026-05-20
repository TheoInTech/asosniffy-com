import { z } from "zod";
import type { SniffyClient } from "@sniffy/sdk";
import { mapSdkError } from "./errors.js";

const MAINNET_NOTE =
  "Settles on Morph Mainnet (eip155:2818) via x402. Each sniffy_diagnose call " +
  "charges ~$0.05 USDC from the wallet configured as SNIFFY_PRIVATE_KEY. Fund " +
  "that wallet with only what you plan to spend; the payment is non-refundable.";

const StoreEnum = z.enum(["ios", "android"]);
const KeywordsList = z
  .array(z.string().min(1).max(64))
  .min(1)
  .max(10)
  .describe("Search keywords to evaluate, 1–10 (5 max for diagnose).");
const CountryCode = z
  .string()
  .length(2)
  .regex(/^[A-Z]{2}$/)
  .describe("ISO 3166-1 alpha-2 country code (e.g. US, GB, JP).");

const quoteShape = {
  store: StoreEnum.describe("App store target."),
  app: z
    .string()
    .min(1)
    .describe(
      "App identifier — Apple App Store URL, raw numeric ID, or app name string.",
    ),
  country: CountryCode,
  keywords: KeywordsList,
  competitors: z
    .array(z.string().min(1))
    .max(10)
    .optional()
    .describe("Optional competitor app IDs to anchor the keyword trail."),
};

const diagnoseShape = {
  ...quoteShape,
  sniffId: z
    .string()
    .min(1)
    .describe("sniffId returned from a prior sniffy_quote call."),
};

export interface ToolDef {
  name: string;
  config: {
    description: string;
    inputSchema?: z.ZodRawShape;
  };
  handler: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  }>;
}

export function buildTools(client: SniffyClient): ToolDef[] {
  return [
    {
      name: "sniffy_sample",
      config: {
        description:
          "Free fixture report (no payment required). Use when the user wants to see what a Sniffy ASO diagnosis looks like, or when no wallet is available. Returns the same shape as sniffy_diagnose but every field is bundled fixture data marked `provenance: \"fixture\"`. " +
          MAINNET_NOTE,
      },
      handler: async () => {
        try {
          const result = await client.sample();
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            structuredContent: result as unknown as Record<string, unknown>,
          };
        } catch (err) {
          return mapSdkError(err);
        }
      },
    },
    {
      name: "sniffy_quote",
      config: {
        description:
          "Free quote with a shallowScan preview (detected app, ratings, one preview keyword bucket). Use this BEFORE sniffy_diagnose to validate the app/keywords and surface the price. Returns pricing.estimatedTotal — sniffy_diagnose will charge this amount over x402. " +
          MAINNET_NOTE,
        inputSchema: quoteShape,
      },
      handler: async (args) => {
        try {
          const input = z.object(quoteShape).parse(args);
          const result = await client.quote(input);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            structuredContent: result as unknown as Record<string, unknown>,
          };
        } catch (err) {
          return mapSdkError(err);
        }
      },
    },
    {
      name: "sniffy_diagnose",
      config: {
        description:
          "PAID. Full ASO diagnosis: keyword rank, competitor trail, metadata score, recommendations, ready-to-paste copy, plus an x402 settlement receipt. Auto-pays from SNIFFY_PRIVATE_KEY. Requires a sniffId from a prior sniffy_quote. Costs `pricing.estimatedTotal` USDC on Morph Mainnet. " +
          MAINNET_NOTE,
        inputSchema: diagnoseShape,
      },
      handler: async (args) => {
        try {
          const input = z.object(diagnoseShape).parse(args);
          const result = await client.diagnose(input);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            structuredContent: result as unknown as Record<string, unknown>,
          };
        } catch (err) {
          return mapSdkError(err);
        }
      },
    },
  ];
}
