import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const MCP_ENTRY = join(__dirname, "..", "dist", "index.js");

const SCRAPER_PORT = process.env["SNIFFY_TEST_PORT"] ?? "3402";
const SCRAPER_URL = `http://localhost:${SCRAPER_PORT}`;

async function waitForServer(url: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/v1/aso/sample`);
      if (res.status === 200) return;
    } catch {
      // not ready
    }
    await wait(250);
  }
  throw new Error(`scraper did not become ready at ${url} within ${timeoutMs}ms`);
}

let scraper: ChildProcess | null = null;
let mcp: ChildProcess | null = null;

async function startMcp(): Promise<void> {
  mcp = spawn("node", [MCP_ENTRY], {
    env: {
      ...process.env,
      SNIFFY_BASE_URL: SCRAPER_URL,
      // No SNIFFY_PRIVATE_KEY → diagnose will throw PaymentRequiredError.
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  // Wait a beat for the server to register handlers.
  await wait(300);
}

beforeAll(async () => {
  scraper = spawn("pnpm", ["--filter", "@sniffy/scraper", "dev"], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PORT: SCRAPER_PORT,
      NODE_ENV: "test",
      MORPH_FACILITATOR_MODE: "fixture-receipt",
      SNIFFY_MERCHANT_ADDRESS:
        process.env["SNIFFY_MERCHANT_ADDRESS"] ??
        "0x000000000000000000000000000000000000c0de",
      OPENAI_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForServer(SCRAPER_URL);
  await startMcp();
}, 30_000);

afterAll(async () => {
  if (mcp !== null) {
    mcp.kill("SIGTERM");
    await wait(200);
    if (!mcp.killed) mcp.kill("SIGKILL");
  }
  if (scraper !== null) {
    scraper.kill("SIGTERM");
    await wait(500);
    if (!scraper.killed) scraper.kill("SIGKILL");
  }
});

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

async function sendJsonRpc(
  proc: ChildProcess,
  payload: Record<string, unknown>,
): Promise<JsonRpcResponse> {
  return new Promise((resolve, reject) => {
    const expectedId = payload["id"];
    const buf: Buffer[] = [];

    const onData = (chunk: Buffer) => {
      buf.push(chunk);
      const text = Buffer.concat(buf).toString("utf8");
      // Each JSON-RPC message is newline-delimited on stdio transport.
      const lines = text.split("\n");
      for (const line of lines) {
        if (line.trim().length === 0) continue;
        try {
          const parsed = JSON.parse(line) as JsonRpcResponse;
          if (parsed.id === expectedId) {
            proc.stdout?.off("data", onData);
            resolve(parsed);
            return;
          }
        } catch {
          // Partial line — keep buffering.
        }
      }
    };
    proc.stdout?.on("data", onData);
    proc.stdin?.write(`${JSON.stringify(payload)}\n`);

    setTimeout(() => {
      proc.stdout?.off("data", onData);
      reject(new Error(`JSON-RPC timeout for id=${String(expectedId)}`));
    }, 10_000);
  });
}

async function initialize(proc: ChildProcess): Promise<void> {
  const res = await sendJsonRpc(proc, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "sniffy-mcp-test", version: "0.0.0" },
    },
  });
  expect(res.error).toBeUndefined();
  proc.stdin?.write(
    `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
  );
  await wait(100);
}

describe("MCP server — stdio harness", () => {
  it("lists exactly three tools (sniffy_quote, sniffy_diagnose, sniffy_sample)", async () => {
    if (mcp === null) throw new Error("MCP process not started");
    await initialize(mcp);
    const res = await sendJsonRpc(mcp, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });
    expect(res.error).toBeUndefined();
    const tools = (res.result as { tools: Array<{ name: string; description: string }> })
      .tools;
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["sniffy_diagnose", "sniffy_quote", "sniffy_sample"]);
    for (const tool of tools) {
      expect(tool.description).toContain("Testnet only");
    }
  });

  it("sniffy_sample returns the fixture report", async () => {
    if (mcp === null) throw new Error("MCP process not started");
    const res = await sendJsonRpc(mcp, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "sniffy_sample", arguments: {} },
    });
    expect(res.error).toBeUndefined();
    const result = res.result as {
      content: Array<{ type: string; text: string }>;
      structuredContent?: Record<string, unknown>;
      isError?: boolean;
    };
    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.type).toBe("text");
    expect(result.structuredContent?.["sample"]).toBe(true);
  });

  it("sniffy_diagnose returns a structured payment_required error when no wallet is configured", async () => {
    if (mcp === null) throw new Error("MCP process not started");
    const res = await sendJsonRpc(mcp, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "sniffy_diagnose",
        arguments: {
          sniffId: "sniff_mcp_test_001",
          store: "ios",
          app: "https://apps.apple.com/us/app/example/id123456789",
          country: "US",
          keywords: ["habit tracker"],
        },
      },
    });
    expect(res.error).toBeUndefined();
    const result = res.result as {
      isError?: boolean;
      structuredContent?: { code?: string; payment?: { network?: string } };
    };
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.code).toBe("payment_required");
    expect(result.structuredContent?.payment?.network).toBe("eip155:2910");
  });
});
