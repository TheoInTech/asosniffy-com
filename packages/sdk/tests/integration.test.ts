import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  createSniffy,
  PaymentRequiredError,
  type SniffyClient,
} from "../src/index.js";

// Gated: only runs when RUN_INTEGRATION=1 (so default `pnpm test` stays fast).
const isGated = process.env.RUN_INTEGRATION !== "1";

const PORT = process.env.SNIFFY_TEST_PORT ?? "3401";
const BASE_URL = `http://localhost:${PORT}`;
const REPO_ROOT = new URL("../../..", import.meta.url).pathname;

let scraperProcess: ChildProcess | null = null;
let sniffy: SniffyClient;

async function waitForServer(url: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/v1/aso/sample`);
      if (res.status === 200) return;
    } catch {
      // server not ready yet
    }
    await wait(250);
  }
  throw new Error(`scraper did not become ready at ${url} within ${timeoutMs}ms`);
}

beforeAll(async () => {
  if (isGated) return;
  scraperProcess = spawn(
    "pnpm",
    ["--filter", "@sniffy/scraper", "dev"],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PORT,
        NODE_ENV: "test",
        MORPH_FACILITATOR_MODE: "fixture-receipt",
        SNIFFY_MERCHANT_ADDRESS:
          process.env.SNIFFY_MERCHANT_ADDRESS ??
          "0x000000000000000000000000000000000000c0de",
        OPENAI_API_KEY: "", // force template synthesis
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  await waitForServer(BASE_URL);

  const signer = privateKeyToAccount(generatePrivateKey());
  sniffy = createSniffy({ baseUrl: BASE_URL, signer });
}, 30_000);

afterAll(async () => {
  if (scraperProcess !== null) {
    scraperProcess.kill("SIGTERM");
    await wait(500);
    if (!scraperProcess.killed) scraperProcess.kill("SIGKILL");
  }
});

describe.skipIf(isGated)("SDK live integration (scraper in fixture mode)", () => {
  it("sample() returns a fixture report", async () => {
    const report = await sniffy.sample();
    expect(report.sample).toBe(true);
    expect(report.receipt.facilitatorMode).toBe("fixture-receipt");
  }, 15_000);

  it("quote() returns a QuoteResponse with shallowScan", async () => {
    const quote = await sniffy.quote({
      store: "ios",
      app: "https://apps.apple.com/us/app/example/id123456789",
      country: "US",
      keywords: ["habit tracker", "daily planner"],
    });
    expect(quote.sniffId).toBeTypeOf("string");
    expect(quote.shallowScan.previewKeyword.keyword).toBeTypeOf("string");
  }, 15_000);

  it("diagnose() without signer throws PaymentRequiredError", async () => {
    const unauthed = createSniffy({ baseUrl: BASE_URL });
    await expect(
      unauthed.diagnose({
        sniffId: "sniff_integration_001",
        store: "ios",
        app: "https://apps.apple.com/us/app/example/id123456789",
        country: "US",
        keywords: ["habit tracker"],
      }),
    ).rejects.toBeInstanceOf(PaymentRequiredError);
  }, 15_000);

  it("diagnose() with signer auto-pays and returns a paid report", async () => {
    const report = await sniffy.diagnose({
      sniffId: "sniff_integration_002",
      store: "ios",
      app: "https://apps.apple.com/us/app/example/id123456789",
      country: "US",
      keywords: ["habit tracker"],
    });
    expect(report.receipt.facilitatorMode).toBe("fixture-receipt");
    expect(report.receipt.network).toBe("eip155:2910");
    expect(report.keywordDiagnosis.length).toBeGreaterThan(0);
  }, 30_000);
});
