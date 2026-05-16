---
name: x402-payments
description: |
  Build and debug HTTP 402 paywalled APIs using the x402 V2 protocol. Use when
  adding payment middleware to a server (Express, Hono, Next.js, Fastify, Go
  Gin/Echo/net-http, FastAPI, Flask); building a paying client with @x402/fetch,
  @x402/axios, the Go module, or the x402 Python package with signers via viem,
  eth-account, or SolanaKit; returning a real HTTP 402 with PAYMENT-REQUIRED
  rather than a UI-only paywall; choosing between exact, upto, and
  batch-settlement schemes; configuring CAIP-2 networks (eip155, solana, Morph
  Hoodi eip155:2910) and facilitator URLs (x402.org, morph-rails.morph.network,
  CDP, PayAI); wrapping paid APIs as MCP tools; migrating V1 to V2 (X-PAYMENT to
  PAYMENT-SIGNATURE); wiring extensions (Bazaar discovery, payment-identifier,
  signed offers/receipts, gas sponsoring). Triggers on x402, HTTP 402,
  PAYMENT-REQUIRED, PAYMENT-SIGNATURE, paymentMiddleware, x402ResourceServer,
  x402Client, EIP-3009, Permit2, USDC paywall, agentic payments.
---

# x402 Payments

x402 is an open payment protocol that activates the HTTP `402 Payment Required`
status code. A buyer (human or AI agent) hits a paid endpoint, gets a 402 with
machine-readable payment requirements, signs a payment payload with a crypto
wallet, retries the request with that payload in a header, and receives the
resource plus a settlement receipt. No accounts, no sessions, no API keys.

Always assume **V2** unless told otherwise. V1 is legacy (see
[v1-to-v2-migration.md](references/v1-to-v2-migration.md)).

## Mental model

Three actors, three headers, optional facilitator:

```
Buyer (client) ──GET /resource──▶ Seller (server)
              ◀──402 + PAYMENT-REQUIRED (b64 JSON)──
              ──GET /resource + PAYMENT-SIGNATURE──▶
                                                  │  verify  ┌──────────────┐
                                                  ├─────────▶│  Facilitator │
                                                  │  settle  └──────────────┘
              ◀──200 + body + PAYMENT-RESPONSE────
```

The three V2 headers are all Base64-encoded JSON:

| Header              | Direction        | Carries                       |
|---------------------|------------------|-------------------------------|
| `PAYMENT-REQUIRED`  | server → client  | `PaymentRequired` (the offer) |
| `PAYMENT-SIGNATURE` | client → server  | `PaymentPayload` (the signed payment) |
| `PAYMENT-RESPONSE`  | server → client  | `SettlementResponse` (the receipt) |

The 402 response **must** be a real HTTP 402 with the header present — a UI-only
paywall does not satisfy the protocol. The same `PAYMENT-RESPONSE` header is
returned on both success and failure responses.

For the full schema of each object and a worked HTTP exchange, see
[http-protocol.md](references/http-protocol.md).

## Decision flow

1. **Am I the seller (running the API)?** → start with
   [server-integration.md](references/server-integration.md). Pick your framework,
   register an `x402ResourceServer` against a facilitator client, declare per-route
   `accepts: [{ scheme, price, network, payTo }]`, and let the middleware handle
   the 402 dance.

2. **Am I the buyer (calling a paid API)?** → start with
   [client-integration.md](references/client-integration.md). Wrap fetch/axios/Go
   `http.Client`/httpx/requests with `wrapFetchWithPayment` /
   `wrapAxiosWithPayment` / `WrapHTTPClientWithPayment` / `x402HttpxClient` /
   `x402_requests` after registering a signer per chain (`ExactEvmScheme(signer)`,
   `ExactSvmScheme(svmSigner)`, etc.).

3. **Which scheme do I advertise?** → [schemes.md](references/schemes.md).
   - **`exact`** — fixed price, all networks, all SDKs. Default choice.
   - **`upto`** — usage-based; client authorizes a max, server calls
     `setSettlementOverrides` to charge actual usage. EVM Permit2 only.
   - **`batch-settlement`** — high-frequency micropayments, EVM only. Buyer
     deposits once, signs off-chain vouchers per request, seller redeems in
     batches onchain.

4. **Which network and token?** → [networks-tokens.md](references/networks-tokens.md).
   Network IDs are CAIP-2: `eip155:<chainId>`, `solana:<genesisHash>`,
   `tvm:<workchain>`, `algorand:<genesisHash>`, `stellar:<network>`,
   `aptos:<chainId>`, `hedera:<network>`. Pricing as `"$0.001"` requires a
   default asset for the chain; otherwise specify a `TokenAmount` with
   `amountInAtomicUnits` + asset address + EIP-712 name/version.

5. **Which facilitator?** → [facilitator.md](references/facilitator.md).
   - Default testnet: `https://x402.org/facilitator` (Base Sepolia, Solana Devnet,
     Stellar Testnet, Aptos Testnet)
   - Production: see x402.org/ecosystem (CDP, PayAI, others vary by network)
   - Morph: `https://morph-rails.morph.network/x402` (Morph-specific networks)
   - You can also verify and settle locally without a facilitator, but that
     means running blockchain infra yourself.

6. **Am I building an MCP server / Claude Desktop tool?** →
   [mcp-integration.md](references/mcp-integration.md).

7. **Am I customizing the flow?** → [lifecycle-hooks.md](references/lifecycle-hooks.md)
   for server/client/facilitator hooks (spending caps, API-key bypass, custom
   logging), or [extensions.md](references/extensions.md) for Bazaar discovery,
   payment-identifier idempotency, signed offers/receipts, and gas sponsoring.

8. **What's available in my SDK?** → [sdk-features.md](references/sdk-features.md)
   for the TS / Go / Python feature parity matrix.

## Quick start (seller, Express + Hono pattern)

```ts
// pnpm add @x402/express @x402/core @x402/evm @x402/svm
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

const app = express();
const evmAddress = "0xYourEvmAddress";

const facilitatorClient = new HTTPFacilitatorClient({
  url: "https://x402.org/facilitator",   // testnet default
});

app.use(
  paymentMiddleware(
    {
      "GET /weather": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.001",
            network: "eip155:84532",       // Base Sepolia (CAIP-2)
            payTo: evmAddress,
          },
        ],
        description: "Weather data",
        mimeType: "application/json",
      },
    },
    new x402ResourceServer(facilitatorClient)
      .register("eip155:84532", new ExactEvmScheme()),
  ),
);

app.get("/weather", (_, res) => res.json({ weather: "sunny", temperature: 70 }));
app.listen(4021);
```

## Quick start (buyer, fetch)

```ts
// pnpm add @x402/fetch @x402/core @x402/evm viem
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
const client = new x402Client();
client.register("eip155:*", new ExactEvmScheme(signer));

const fetchWithPayment = wrapFetchWithPayment(fetch, client);
const res = await fetchWithPayment("https://api.example.com/weather");
console.log(await res.json());
```

The wrapper handles the 402 → sign → retry cycle automatically. Inspect the
`PAYMENT-RESPONSE` header on the final response for the settlement receipt
(network, CAIP-2 chain ID, amount, asset, transaction hash, settled-at).

## Gotchas worth memorizing

- **The 402 must be a real HTTP 402.** Returning a 200 with a "please pay" body
  fails any conformance check. The middleware does this for you — don't bypass
  it.
- **All three headers are Base64 of JSON**, not raw JSON. Decoders fail silently
  if you forget to base64-decode before parsing.
- **CAIP-2 only in V2.** No more `"base-sepolia"`; it's `"eip155:84532"`. Same
  for Solana: `"solana:<genesisHash>"` not `"solana-devnet"`.
- **Facilitator supports networks, not tokens.** Any ERC-20 with EIP-3009 or
  Permit2 support works on any EVM facilitator. `"$0.01"` pricing only works on
  chains in the default-asset registry — otherwise pass `TokenAmount` with
  atomic units, address, and EIP-712 `name`/`version`.
- **`setSettlementOverrides` is for `upto` and `batch-settlement` only.** For
  `exact`, the charge is fixed and overrides are ignored. The override amount
  must be ≤ the authorized maximum; `"0"` means no charge / no onchain
  transaction. Accepts atomic units (`"1000"`), percent of max (`"50%"`), or
  USD (`"$0.05"`) when the route uses dollar-string pricing.
- **Solana duplicate-settlement race.** If you settle directly on Solana without
  a facilitator, you must keep a 120-second cache keyed by transaction payload
  to reject replays. Facilitator-based settlement handles this for you via
  `SettlementCache`.
- **V1 → V2 header rename:** `X-PAYMENT` → `PAYMENT-SIGNATURE`,
  `X-PAYMENT-RESPONSE` → `PAYMENT-RESPONSE`. The facilitator accepts both, but
  your own server/client code should standardize on V2.
- **EVM transfer methods:** `eip3009` for USDC-style tokens (single off-chain
  sig, no approval), `permit2` for any other ERC-20 (may need a one-time onchain
  approval — see the gas-sponsoring extensions).
- **The `accepts` array offers a menu.** Advertise multiple options (different
  schemes, networks, tokens) on the same route; the client picks one whose
  `(scheme, network)` matches a registered implementation. Wildcards like
  `eip155:*` work when registering schemes server- or client-side.
- **Bazaar discovery is opt-in.** If you want AI agents to find your endpoint
  without prior knowledge, attach `declareDiscoveryExtension({...})` under
  `extensions` in the route config — see [extensions.md](references/extensions.md).

## References

Each reference is a focused dive. Read the one that matches your task; don't
prefetch them all.

- [http-protocol.md](references/http-protocol.md) — HTTP 402, PAYMENT-* headers,
  full JSON shapes of `PaymentRequired`, `PaymentPayload`, `SettlementResponse`.
- [server-integration.md](references/server-integration.md) — every supported
  server framework (Express, Hono, Next.js, Fastify, Go Gin/Echo/net-http,
  FastAPI, Flask) with full route config and middleware patterns.
- [client-integration.md](references/client-integration.md) — fetch, axios, Go
  `http.Client`, httpx, requests wrappers; signer setup per chain (viem,
  eth-account, SolanaKit, Aptos SDK, Stellar SDK).
- [schemes.md](references/schemes.md) — `exact`, `upto`, `batch-settlement`:
  semantics, server setup, client setup, `setSettlementOverrides` formats.
- [networks-tokens.md](references/networks-tokens.md) — CAIP-2 IDs, default
  asset tables per chain, custom ERC-20 setup, runtime network registration.
- [facilitator.md](references/facilitator.md) — what facilitators do, the 12-step
  client/server/facilitator flow, x402.org vs production options, duplicate
  settlement caveat, running your own.
- [extensions.md](references/extensions.md) — Bazaar discovery,
  payment-identifier idempotency, signed offers/receipts, Sign-In-With-X,
  EIP-2612 and ERC-20 approval gas sponsoring; building a custom extension.
- [lifecycle-hooks.md](references/lifecycle-hooks.md) — server, client,
  facilitator, and MCP hooks with concrete examples (spending limits, API-key
  bypass, audit logging, hook chaining).
- [mcp-integration.md](references/mcp-integration.md) — wrap paid APIs as MCP
  tools for Claude Desktop; multi-network setup; making MCP tools discoverable
  via Bazaar.
- [v1-to-v2-migration.md](references/v1-to-v2-migration.md) — header renames,
  package renames, network identifier mapping, troubleshooting.
- [sdk-features.md](references/sdk-features.md) — feature parity matrix across
  TypeScript / Go / Python (core, frameworks, networks, schemes, extensions,
  hooks, MCP).

## Source

These references summarize https://docs.x402.org as of late 2025. For protocol
specs (the source of truth for new SDK implementations), see
https://github.com/x402-foundation/x402/tree/main/specs.
