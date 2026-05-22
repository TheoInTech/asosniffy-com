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
    "Sniffy — pay-per-sniff ASO intelligence (x402 on Morph Hoodi). Quote/diagnose/sample.",
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

interface QuoteCmdOpts {
  keywords: string[];
  country: string;
  store: "ios" | "android";
  competitors?: string[];
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
  .action(async (app: string, opts: DiagnoseCmdOpts) => {
    const { baseUrl, json } = getCommonOpts();
    process.stderr.write(
      `${chalk.yellow("⚠️  Testnet only — do not use a mainnet private key")}\n`,
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
            `Fund the testnet wallet at https://faucet-hoodi.morph.network/ and retry.\n`,
        );
        process.exit(2);
      }
      exitWith(1, (err as Error).message);
    }
  });

program.parseAsync(process.argv).catch((err) => {
  exitWith(1, (err as Error).message);
});
