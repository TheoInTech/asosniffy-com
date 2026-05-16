# MCP Integration

Connect paid x402 APIs to Claude Desktop (or any MCP client) so AI agents
can call them transparently. The MCP server acts as a bridge that:

1. Detects HTTP 402 + `PAYMENT-REQUIRED` from the API.
2. Signs and submits the payment using the registered scheme + wallet.
3. Returns the paid response back through the MCP transport.

The result: tools that "just work" for paying agents.

## Prerequisites

- Node.js v20+ and pnpm v10.
- An x402-compatible API server (e.g., the sample Express weather server from
  `x402/examples/typescript/servers/express`).
- A wallet with USDC on the relevant testnet (Base Sepolia, Solana Devnet) or
  mainnet.
- Claude Desktop or another MCP-compatible client.

## Quick start

```bash
git clone https://github.com/x402-foundation/x402.git
cd x402/examples/typescript
pnpm install && pnpm build
cd clients/mcp
```

Then configure Claude Desktop:

```json
{
  "mcpServers": {
    "demo": {
      "command": "pnpm",
      "args": [
        "--silent",
        "-C",
        "<absolute path to repo>/examples/typescript/clients/mcp",
        "dev"
      ],
      "env": {
        "EVM_PRIVATE_KEY": "<0x-prefixed hex>",
        "SVM_PRIVATE_KEY": "<base58-encoded 64-byte>",
        "RESOURCE_SERVER_URL": "http://localhost:4021",
        "ENDPOINT_PATH": "/weather"
      }
    }
  }
}
```

Start the API:

```bash
# in another terminal
cd x402/examples/typescript/servers/express
pnpm dev
```

Restart Claude Desktop. Ask Claude to run the
`get-data-from-resource-server` tool.

## Environment variables

| Variable               | Required        | Purpose                              |
|------------------------|-----------------|--------------------------------------|
| `EVM_PRIVATE_KEY`      | One of EVM/SVM  | 0x-prefixed hex EVM key              |
| `SVM_PRIVATE_KEY`      | One of EVM/SVM  | Base58 64-byte Solana key            |
| `RESOURCE_SERVER_URL`  | Yes             | Base URL of the paid API             |
| `ENDPOINT_PATH`        | Yes             | Specific endpoint to call            |

## Implementation pattern

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from "axios";
import { x402Client, wrapAxiosWithPayment } from "@x402/axios";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { BatchSettlementEvmScheme } from "@x402/evm/batch-settlement/client";
import { toClientEvmSigner } from "@x402/evm";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";

const evmPrivateKey = process.env.EVM_PRIVATE_KEY as `0x${string}`;
const svmPrivateKey = process.env.SVM_PRIVATE_KEY as string;
const baseURL = process.env.RESOURCE_SERVER_URL || "http://localhost:4021";
const endpointPath = process.env.ENDPOINT_PATH || "/weather";

if (!evmPrivateKey && !svmPrivateKey) {
  throw new Error("At least one of EVM_PRIVATE_KEY or SVM_PRIVATE_KEY must be provided");
}

async function createClient() {
  const client = new x402Client();

  if (evmPrivateKey) {
    const account = privateKeyToAccount(evmPrivateKey);
    client.register("eip155:*", new ExactEvmScheme(account));

    // Register batch-settlement too, so the same client handles APIs that use it
    const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
    const batchSigner = toClientEvmSigner(account, publicClient);
    client.register(
      "eip155:*",
      new BatchSettlementEvmScheme(batchSigner, {
        depositPolicy: { depositMultiplier: 5 },
      }),
    );
  }

  if (svmPrivateKey) {
    const svmSigner = await createKeyPairSignerFromBytes(base58.decode(svmPrivateKey));
    client.register("solana:*", new ExactSvmScheme(svmSigner));
  }

  return wrapAxiosWithPayment(axios.create({ baseURL }), client);
}

async function main() {
  const api = await createClient();
  const server = new McpServer({ name: "x402 MCP Client Demo", version: "2.0.0" });

  server.tool(
    "get-data-from-resource-server",
    "Get data from the resource server",
    {},
    async () => {
      const res = await api.get(endpointPath);
      return { content: [{ type: "text", text: JSON.stringify(res.data) }] };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Claude Desktop │────▶│   MCP Server    │────▶│  x402 API       │
│                 │     │  (x402 client)  │     │  (paid endpoint)│
└─────────────────┘     └─────────────────┘     └─────────────────┘
                         │ 1. tool call
                         │ 2. GET endpoint
                         │ 3. 402 + requirements ◀──
                         │ 4. sign payment
                         │ 5. retry w/ PAYMENT-SIGNATURE
                         │ 6. 200 + data         ◀──
                         │ 7. return content
```

The bridge is a stdio MCP server; Claude Desktop spawns it as a subprocess
and exchanges JSON-RPC over stdin/stdout. The `wrapAxiosWithPayment`
interceptor handles the entire 402 → sign → retry cycle inside one logical
`api.get()` call.

## Multi-network

Register multiple schemes on the same client; the wrapper picks the right
one based on the `network` in the server's 402 response:

```ts
client.register("eip155:*", new ExactEvmScheme(account));
client.register("eip155:*", new BatchSettlementEvmScheme(batchSigner, /* ... */));
client.register("solana:*", new ExactSvmScheme(svmSigner));
```

When a paid API advertises `scheme: "batch-settlement"`, the
`BatchSettlementEvmScheme` is used; for `scheme: "exact"` on EVM,
`ExactEvmScheme`; for Solana, `ExactSvmScheme`. Register every scheme/network
your tools may encounter.

## Making MCP tools discoverable via Bazaar

If you're building an MCP **server** (not just a bridge), you can publish tool
metadata into a Bazaar-enabled facilitator so other agents can find your
paid tools without prior knowledge.

```ts
import { createPaymentWrapper } from "@x402/mcp";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";

const paid = createPaymentWrapper(resourceServer, {
  accepts,
  resource: {
    url: "mcp://tool/get_weather",
    description: "Get current weather for a city",
  },
  extensions: declareDiscoveryExtension({
    toolName: "get_weather",
    description: "Get current weather for a city",
    transport: "sse",
    inputSchema: {
      properties: { city: { type: "string", description: "City name" } },
      required: ["city"],
    },
    example: { city: "San Francisco" },
  }),
});
```

When a buyer pays for the tool, the facilitator catalogs it under
`/discovery/resources` with `type: "mcp"`. Other agents discover it via:

```ts
const tools = await client.extensions.bazaar.listResources({ type: "mcp" });
```

## Payment hooks for tool calls

Use MCP client hooks (`onPaymentRequired`, `onBeforePayment`, `onAfterPayment`)
to enforce per-tool spending caps, block specific tools, or audit usage. See
[lifecycle-hooks.md](lifecycle-hooks.md#mcp-client-hooks-x402mcpclient).

```ts
import { x402MCPClient } from "@x402/mcp";

const mcpClient = new x402MCPClient(rawMcpClient, paymentClient);

mcpClient
  .onPaymentRequired(async ({ toolName }) => {
    if (blockedTools.has(toolName)) return { abort: true };
  })
  .onAfterPayment(async ({ toolName, settleResponse }) => {
    await auditLog({ tool: toolName, tx: settleResponse?.transaction });
  });
```

## Dependencies (TypeScript)

```jsonc
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.9.0",
    "@x402/axios": "workspace:*",
    "@x402/evm": "workspace:*",
    "@x402/svm": "workspace:*",
    "axios": "^1.13.2",
    "viem": "^2.39.0",
    "@solana/kit": "^2.1.1",
    "@scure/base": "^1.2.6"
  }
}
```

Go and Python MCP support also exists (see
[sdk-features.md](sdk-features.md)); the TypeScript version is the most
feature-complete today.

## Common pitfalls

- **Forgetting to register the right scheme** — if the API advertises
  `batch-settlement` but you only registered `exact`, the wrapper has nothing
  to pick and the request fails. Register every scheme/network you might
  encounter.
- **Network mismatch** — if the API offers only `eip155:8453` (Base mainnet)
  but your wallet is funded on `eip155:84532` (Sepolia), the SDK will refuse.
  Confirm the facilitator + network combination matches the wallet's funded
  network.
- **Stale private key in Claude Desktop config** — Claude Desktop only reads
  the config at launch. After rotating keys, restart Claude Desktop.
- **MCP server logs to stdout** — anything you `console.log` corrupts the
  JSON-RPC stream. Log to stderr (`console.error`) or a file.
