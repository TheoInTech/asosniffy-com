#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import {
  createSniffy,
  PaymentRequiredError,
  type DiagnoseRequest,
  type QuoteRequest,
} from "@gosniffy/sdk";
import { loadWallet, WalletConfigError } from "./wallet.js";
import { formatPaid, formatQuote, formatSample } from "./format.js";
import pkg from "../package.json" with { type: "json" };

const DEFAULT_BASE_URL =
  process.env["SNIFFY_BASE_URL"] ?? "https://api.sniffy.io";
const CLIENT_ID = `@gosniffy/cli@${pkg.version}`;

function parseList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function exitWith(code: number, message: string): never {
  process.stderr.write(`${chalk.red("error:")} ${message}\n`);
  process.exit(code);
}

interface CommonOpts {
  baseUrl: string;
  json: boolean;
}

const program = new Command()
  .name("sniffy")
  .description(
    "Sniffy — pay-per-sniff ASO intelligence (x402 on Morph Mainnet). Quote/diagnose/sample.",
  )
  .version(pkg.version)
  .option("--base-url <url>", "Override the Sniffy API base URL", DEFAULT_BASE_URL)
  .option("--json", "Print the raw JSON response (no formatting)", false);

function getCommonOpts(): CommonOpts {
  const opts = program.opts<{ baseUrl: string; json: boolean }>();
  return { baseUrl: opts.baseUrl, json: opts.json };
}

program
  .command("sample")
  .description("Fetch the canned sample report (free, no wallet required)")
  .action(async () => {
    const { baseUrl, json } = getCommonOpts();
    try {
      const sniffy = createSniffy({ baseUrl, clientId: CLIENT_ID });
      const result = await sniffy.sample();
      if (json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        process.stdout.write(`${formatSample(result)}\n`);
      }
    } catch (err) {
      exitWith(1, (err as Error).message);
    }
  });

// Cost-aware pricing flags shared by quote + diagnose. Build the addons object
// from the boolean flags; omit it entirely when no premium flag is set so the
// tier's default bundle stands.
function buildAddons(opts: QuoteCmdOpts):
  | { aiVisibility?: boolean; creativeVision?: boolean; localizationCopy?: boolean }
  | undefined {
  const a: { aiVisibility?: boolean; creativeVision?: boolean; localizationCopy?: boolean } = {};
  if (opts.aiVisibility) a.aiVisibility = true;
  if (opts.vision) a.creativeVision = true;
  if (opts.localize) a.localizationCopy = true;
  return Object.keys(a).length > 0 ? a : undefined;
}

function tierOf(opts: QuoteCmdOpts) {
  return opts.tier;
}


interface QuoteCmdOpts {
  keywords: string[];
  country: string;
  store: "ios" | "android";
  competitors?: string[];
  tier?: "quick" | "standard" | "expert";
  aiVisibility?: boolean;
  vision?: boolean;
  localize?: boolean;
}

program
  .command("quote <app>")
  .description("Get a free quote with shallowScan for an App Store app")
  .requiredOption(
    "-k, --keywords <list>",
    "Comma-separated keywords (1-10)",
    parseList,
  )
  .option("-c, --country <code>", "ISO 3166-1 alpha-2 country code", "US")
  .option<"ios" | "android">(
    "-s, --store <store>",
    "App store (ios|android)",
    (raw) => {
      if (raw !== "ios" && raw !== "android") {
        throw new Error("store must be ios or android");
      }
      return raw;
    },
    "ios",
  )
  .option(
    "--competitors <list>",
    "Comma-separated competitor app IDs (optional)",
    parseList,
  )
  .option(
    "-t, --tier <tier>",
    "Pricing tier: quick | standard | expert (default standard $0.20)",
  )
  .option("--ai-visibility", "Add the LLM share-of-voice probe (+$0.10)", false)
  .option("--vision", "Add the creative screenshot audit (+$0.20)", false)
  .option("--localize", "Add localized copy generation (+$0.20)", false)
  .action(async (app: string, opts: QuoteCmdOpts) => {
    const { baseUrl, json } = getCommonOpts();
    try {
      const sniffy = createSniffy({ baseUrl, clientId: CLIENT_ID });
      const input: QuoteRequest = {
        store: opts.store,
        app,
        country: opts.country.toUpperCase() as QuoteRequest["country"],
        keywords: opts.keywords,
        ...(opts.competitors !== undefined && opts.competitors.length > 0
          ? { competitors: opts.competitors }
          : {}),
        ...(tierOf(opts) !== undefined ? { tier: tierOf(opts) } : {}),
        ...(buildAddons(opts) !== undefined ? { addons: buildAddons(opts) } : {}),
      };
      const result = await sniffy.quote(input);
      if (json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        process.stdout.write(`${formatQuote(result)}\n`);
      }
    } catch (err) {
      exitWith(1, (err as Error).message);
    }
  });

interface DiagnoseCmdOpts extends QuoteCmdOpts {
  sniffId: string;
}

program
  .command("diagnose <app>")
  .description("Run a full paid diagnosis (x402 payment auto-signed from SNIFFY_PRIVATE_KEY)")
  .requiredOption(
    "-k, --keywords <list>",
    "Comma-separated keywords (1-5)",
    parseList,
  )
  .requiredOption("--sniff-id <id>", "sniffId returned from a prior quote")
  .option("-c, --country <code>", "ISO 3166-1 alpha-2 country code", "US")
  .option<"ios" | "android">(
    "-s, --store <store>",
    "App store (ios|android)",
    (raw) => {
      if (raw !== "ios" && raw !== "android") {
        throw new Error("store must be ios or android");
      }
      return raw;
    },
    "ios",
  )
  .option(
    "--competitors <list>",
    "Comma-separated competitor app IDs (optional)",
    parseList,
  )
  .option(
    "-t, --tier <tier>",
    "Pricing tier: quick | standard | expert (default standard $0.20)",
  )
  .option("--ai-visibility", "Add the LLM share-of-voice probe (+$0.10)", false)
  .option("--vision", "Add the creative screenshot audit (+$0.20)", false)
  .option("--localize", "Add localized copy generation (+$0.20)", false)
  .action(async (app: string, opts: DiagnoseCmdOpts) => {
    const { baseUrl, json } = getCommonOpts();
    process.stderr.write(
      `${chalk.yellow("⚠️  Pays real USDC on Morph Mainnet (eip155:2818) — non-refundable. Each run is a separate charge.")}\n`,
    );
    let signer;
    try {
      signer = loadWallet();
    } catch (err) {
      if (err instanceof WalletConfigError) {
        exitWith(1, err.message);
      }
      throw err;
    }
    try {
      const sniffy = createSniffy({ baseUrl, signer, clientId: CLIENT_ID });
      const input: DiagnoseRequest = {
        sniffId: opts.sniffId as DiagnoseRequest["sniffId"],
        store: opts.store,
        app,
        country: opts.country.toUpperCase() as DiagnoseRequest["country"],
        keywords: opts.keywords,
        ...(opts.competitors !== undefined && opts.competitors.length > 0
          ? { competitors: opts.competitors }
          : {}),
        ...(tierOf(opts) !== undefined ? { tier: tierOf(opts) } : {}),
        ...(buildAddons(opts) !== undefined ? { addons: buildAddons(opts) } : {}),
      };
      const result = await sniffy.diagnose(input);
      if (json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        process.stdout.write(`${formatPaid(result)}\n`);
      }
    } catch (err) {
      if (err instanceof PaymentRequiredError) {
        const p = err.payment;
        process.stderr.write(
          `${chalk.red("payment_required:")} ${err.message}\n` +
            `  amount:  ${p.amount} on ${p.network}\n` +
            `  payTo:   ${p.payTo}\n` +
            `  asset:   ${p.asset}\n` +
            `Fund the wallet (SNIFFY_PRIVATE_KEY) with USDC on Morph Mainnet and retry. Each retry is a new, non-refundable charge.\n`,
        );
        process.exit(2);
      }
      exitWith(1, (err as Error).message);
    }
  });

program.parseAsync(process.argv).catch((err) => {
  exitWith(1, (err as Error).message);
});
