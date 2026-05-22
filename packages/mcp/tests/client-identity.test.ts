import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Mocks are hoisted above all imports so the dynamic `import("../src/index.js")`
// below runs against the mocked modules. Without `vi.hoisted`, the references
// to these mocks inside the `vi.mock` factories would be undefined at hoist
// time.
const mocks = vi.hoisted(() => {
  const createSniffyMock = vi.fn(() => ({
    quote: vi.fn(),
    sample: vi.fn(),
    diagnose: vi.fn(),
  }));
  const registerToolMock = vi.fn();
  const connectMock = vi.fn().mockResolvedValue(undefined);
  return { createSniffyMock, registerToolMock, connectMock };
});

vi.mock("@sniffy/sdk", () => ({
  createSniffy: mocks.createSniffyMock,
}));

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class {
    constructor(public info: unknown) {}
    registerTool = mocks.registerToolMock;
    connect = mocks.connectMock;
  },
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class {},
}));

vi.mock("viem/accounts", () => ({
  privateKeyToAccount: vi.fn(() => ({ address: "0xabc" })),
}));

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_PKG = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8"),
) as { version: string };

describe("@sniffy/mcp — client identity", () => {
  it("calls createSniffy with clientId='@sniffy/mcp@<pkg.version>'", async () => {
    await import("../src/index.js");
    expect(mocks.createSniffyMock).toHaveBeenCalledOnce();
    const opts = mocks.createSniffyMock.mock.calls[0]?.[0] as {
      clientId?: string;
      baseUrl?: string;
    };
    expect(opts.clientId).toBe(`@sniffy/mcp@${MCP_PKG.version}`);
  });
});
