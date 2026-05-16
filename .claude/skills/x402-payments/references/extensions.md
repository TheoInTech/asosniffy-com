# Extensions

Extensions are composable, optional capabilities that plug into the payment
lifecycle without changing the core protocol. They enrich 402 responses,
settlement responses, or both, and can run on the resource server, the
facilitator, or both sides.

## Built-in extensions

| Extension                         | Type                 | What it does                                                                 | SDK support           |
|-----------------------------------|----------------------|------------------------------------------------------------------------------|-----------------------|
| **Bazaar**                        | Server + Facilitator | Discovery layer — makes endpoints/MCP tools findable by AI agents            | TS, Go, Python        |
| **Payment-Identifier (idempotency)** | Server + Client   | Unique ID per payment for tracking, reconciliation, retries without double-charge | TS, Go, Python    |
| **Signed Offers & Receipts**      | Server + Client      | Cryptographic proof-of-interaction artifacts (signed 402 offers, signed receipts) | TypeScript only |
| **Sign-In-With-X (SIWX)**         | Server + Client      | CAIP-122 wallet auth — prove wallet ownership to re-access purchased content without repaying | TypeScript only |
| **EIP-2612 Gas Sponsoring**       | Facilitator          | Facilitator sponsors gas for EIP-2612 permit-based ERC-20 transfers          | TS, Go, Python        |
| **ERC-20 Approval Gas Sponsoring**| Facilitator          | Facilitator sponsors gas for ERC-20 approval transactions (Permit2 path)     | TS, Go, Python        |

## How extensions plug in

A `ResourceServerExtension` can intervene at four points:

1. **`enrichDeclaration`** — at route registration time. Modify or narrow the
   route's extension declaration based on transport context (Bazaar narrows
   HTTP method here).
2. **`enrichPaymentRequiredResponse`** — when the server returns 402. Add data
   to the response (signed offers, discovery metadata).
3. **`enrichSettlementResponse`** — after successful settlement. Add data to
   the `PAYMENT-RESPONSE` header (signed receipts, payment identifiers).
4. **`hooks`** — scoped verify/settle hooks that run only when the extension
   is declared on the route.

Facilitator extensions provide a `key` and are accessed by mechanism
implementations during verify/settle. Gas sponsoring extensions live here.

## Registering on the server

```ts
import { x402ResourceServer } from "@x402/express";

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("eip155:84532", new ExactEvmScheme())
  .registerExtension(myExtension)         // add one
  .registerExtension(anotherExtension);   // stack another
```

## Declaring on routes

Per-route declarations go under `extensions`, keyed by the extension's `key`:

```ts
{
  "GET /api/data": {
    accepts: [{ scheme: "exact", price: "$0.01", network: "eip155:84532", payTo }],
    description: "Premium data",
    mimeType: "application/json",
    extensions: {
      "offer-receipt": { includeTxHash: false },
      "bazaar": { /* ... */ },
    },
  },
}
```

An extension declared on a route but not registered on the server is silently
ignored — won't break anything.

## Bazaar (discovery layer)

Makes your endpoints/MCP tools visible in a Bazaar-enabled facilitator's
`/discovery/resources` catalog, so AI agents can find and call them without
prior knowledge.

### Declaring an HTTP endpoint

```ts
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";

{
  "GET /weather": {
    accepts: [{ scheme: "exact", price: "$0.001", network: "eip155:8453", payTo }],
    description: "Get real-time weather including temperature, conditions, humidity",
    mimeType: "application/json",
    extensions: {
      ...declareDiscoveryExtension({
        input: { city: "San Francisco" },
        inputSchema: {
          properties: { city: { type: "string", description: "City name" } },
          required: ["city"],
        },
      }),
    },
  },
}
```

### Declaring an MCP tool

```ts
import { createPaymentWrapper } from "@x402/mcp";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";

const paid = createPaymentWrapper(resourceServer, {
  accepts,
  resource: { url: "mcp://tool/get_weather", description: "Get current weather" },
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

### Buyer-side discovery

```ts
// List HTTP resources
const httpResources = await client.extensions.bazaar.listResources({ type: "http" });

// List MCP tools
const mcpTools = await client.extensions.bazaar.listResources({ type: "mcp" });

// Search
const results = await client.extensions.bazaar.searchResources({
  query: "weather data",
});
```

Bazaar facilitators index resources by extracting the discovery extension
from the payment payload during the facilitator's `onAfterVerify` hook.

## Payment-Identifier (idempotency)

Attaches a unique identifier (UUID/string) to each payment so the server can
dedupe retries. Without it, a client that retries a paid request because of a
flaky network may be charged twice.

```ts
// Client side
import { declarePaymentIdentifier } from "@x402/extensions/payment-identifier";

const paymentId = crypto.randomUUID();
const response = await fetchWithPayment(url, {
  headers: { /* extension auto-attaches the identifier */ },
});
// The extension wraps the request to include the identifier
```

```ts
// Server side
import { paymentIdentifierExtension } from "@x402/extensions/payment-identifier";

const server = new x402ResourceServer(facilitatorClient)
  .registerExtension(paymentIdentifierExtension({
    store: redisStore,                  // your idempotency store
    ttlSeconds: 86400,
  }));
```

When the server sees a payment-identifier it has already settled, it returns
the cached response without re-settling. Use Redis or another shared store
in production so identifiers survive process restarts.

## Signed Offers & Receipts

Signs the 402 offer when sending and the settlement receipt on success.
Buyer ends up with a cryptographic artifact proving "this server offered me
this price at this time" and "this transaction settled for this amount."

Use cases: dispute resolution, reputation, audit trails, off-chain attestation
of paid interactions.

Currently TypeScript-only. The extension lives at
`@x402/extensions/offer-receipt`. See the upstream extension page for the
signing key configuration and verification helpers.

## Sign-In-With-X (SIWX)

CAIP-122 wallet authentication. Lets a buyer prove wallet ownership once and
then re-access content they've previously paid for **without paying again**.

Use cases: paid articles, video subscriptions, any "first access is paid,
subsequent accesses for the same wallet are free for some window" pattern.

Currently TypeScript-only.

## Gas sponsoring

Two flavors, both facilitator-side:

- **EIP-2612 Gas Sponsoring** — for ERC-20 tokens that implement EIP-2612
  (Permit). Facilitator submits the permit onchain, so the client never pays
  gas for the approval step.
- **ERC-20 Approval Gas Sponsoring** — for any ERC-20 (including ones without
  EIP-2612). Facilitator sponsors gas for the standard `approve` call.

These are not enabled per-route — they're a facilitator capability. Use a
facilitator that advertises gas sponsoring if you're routing through Permit2
on tokens without EIP-3009. The default `x402.org` facilitator may or may not
support these; check `/v2/supported`.

## Building a custom extension

1. Define an object implementing `ResourceServerExtension`.
2. Pick a unique `key` (used in route declarations and response payloads).
3. Implement only the hooks you need.
4. Write a `declare<MyExtension>(config)` helper for the route-level config.
5. Register on the server with `registerExtension(...)`.
6. To upstream: submit a PR against `x402-foundation/x402`.

```ts
import type { ResourceServerExtension } from "@x402/core";

const myExtension: ResourceServerExtension = {
  key: "my-extension",

  enrichPaymentRequiredResponse: async (declaration, context) => {
    return { customField: "value", timestamp: Date.now() };
  },

  enrichSettlementResponse: async (declaration, context) => {
    return { settled: true, processedAt: Date.now() };
  },

  hooks: {
    onAfterSettle: async (declaration, context) => {
      await auditLog.record({
        config: declaration,
        payer: context.result.payer,
        transaction: context.result.transaction,
      });
    },
  },
};

function declareMyExtension(config: { customOption: boolean }) {
  return { "my-extension": config };
}
```

Data returned from `enrichPaymentRequiredResponse` and
`enrichSettlementResponse` ends up under `extensions["my-extension"]` in the
respective response. Hook contexts are read-only for core protocol fields —
use the abort/recover return values instead of mutation.

## Hook interactions

Extensions and the server share the same hook surface:

| Extension                | `enrichDeclaration` | `enrichPaymentRequiredResponse` | `enrichSettlementResponse` | Facilitator |
|--------------------------|---------------------|----------------------------------|----------------------------|-------------|
| Bazaar                   | ✅ (narrows HTTP method) | —                            | —                          | ✅ (discovery catalog) |
| EIP-2612 Gas Sponsoring  | —                   | —                                | —                          | ✅ (batch signing)     |
| ERC-20 Approval Gas Sponsoring | —             | —                                | —                          | ✅ (batch signing)     |
| Payment Identifier       | —                   | ✅                                | ✅                          | —           |
| Sign-In-With-X           | —                   | —                                | —                          | —           |
| Signed Offers & Receipts | —                   | ✅ (signs offers)                 | ✅ (signs receipts)         | —           |

Bazaar spans both sides — resource-server side enriches declarations,
facilitator side handles indexing/cataloging.

## Source

- Extension specs: `specs/extensions/` in `x402-foundation/x402`
- TypeScript reference: `@x402/extensions` package source
