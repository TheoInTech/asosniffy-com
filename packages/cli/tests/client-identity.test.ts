import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Mock the SDK so we can observe what createSniffy was called with, plus
// the wallet loader (so diagnose doesn't reject for a missing private key)
// and process.exit (so an error path doesn't kill the test runner).
const mocks = vi.hoisted(() => {
  const createSniffyMock = vi.fn(() => ({
    quote: vi.fn().mockResolvedValue({ shallowScan: { title: "x" } }),
    sample: vi.fn().mockResolvedValue({ sample: true, receipt: {} }),
    diagnose: vi.fn().mockResolvedValue({ sniffId: "sniff_test" }),
  }));
  return { createSniffyMock };
});

vi.mock("@sniffy/sdk", () => ({
  createSniffy: mocks.createSniffyMock,
  PaymentRequiredError: class extends Error {},
}));

vi.mock("../src/wallet.js", () => ({
  loadWallet: vi.fn(() => ({ address: "0xabc" })),
  WalletConfigError: class extends Error {},
}));

vi.mock("../src/format.js", () => ({
  formatPaid: vi.fn(() => "paid"),
  formatQuote: vi.fn(() => "quote"),
  formatSample: vi.fn(() => "sample"),
}));

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PKG = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8"),
) as { version: string };
const EXPECTED_CLIENT_ID = `@sniffy/cli@${CLI_PKG.version}`;

const originalArgv = process.argv;
const originalExit = process.exit;

beforeEach(() => {
  vi.resetModules();
  mocks.createSniffyMock.mockClear();
  // Prevent commander's exit-on-help / exit-on-error from killing the runner.
  // The CLI normally calls process.exit(2) on PaymentRequiredError; we
  // throw instead so the test can see what happened.
  process.exit = ((code?: number) => {
    throw new Error(`process.exit(${code ?? 0})`);
  }) as typeof process.exit;
});

afterEach(() => {
  process.argv = originalArgv;
  process.exit = originalExit;
});

async function runCli(argv: string[]): Promise<void> {
  process.argv = ["node", "sniffy", ...argv];
  await import("../src/index.js");
  // The CLI's `program.parseAsync(process.argv).catch(...)` is fire-and-forget
  // at module top level. Allow microtasks to flush so the action handler runs.
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

describe("@sniffy/cli — client identity", () => {
  it("sample passes clientId='@sniffy/cli@<pkg.version>'", async () => {
    await runCli(["sample"]);
    expect(mocks.createSniffyMock).toHaveBeenCalled();
    const opts = mocks.createSniffyMock.mock.calls[0]?.[0] as {
      clientId?: string;
    };
    expect(opts.clientId).toBe(EXPECTED_CLIENT_ID);
  });

  it("quote passes clientId='@sniffy/cli@<pkg.version>'", async () => {
    await runCli([
      "quote",
      "https://apps.apple.com/us/app/example/id123456789",
      "-k",
      "habit tracker",
    ]);
    expect(mocks.createSniffyMock).toHaveBeenCalled();
    const opts = mocks.createSniffyMock.mock.calls[0]?.[0] as {
      clientId?: string;
    };
    expect(opts.clientId).toBe(EXPECTED_CLIENT_ID);
  });

  it("diagnose passes clientId='@sniffy/cli@<pkg.version>'", async () => {
    await runCli([
      "diagnose",
      "https://apps.apple.com/us/app/example/id123456789",
      "-k",
      "habit tracker",
      "--sniff-id",
      "sniff_q1",
    ]);
    expect(mocks.createSniffyMock).toHaveBeenCalled();
    const opts = mocks.createSniffyMock.mock.calls[0]?.[0] as {
      clientId?: string;
    };
    expect(opts.clientId).toBe(EXPECTED_CLIENT_ID);
  });
});
