# Facilitator

A facilitator is an optional service that verifies payment payloads and
settles payments onchain on behalf of resource servers. Using one is strongly
recommended unless you specifically want to manage blockchain connectivity
yourself.

## What it does

A facilitator exposes (at minimum) three HTTP endpoints:

| Endpoint              | Purpose                                                              |
|-----------------------|----------------------------------------------------------------------|
| `POST /v2/verify`     | Verify that a `PaymentPayload` satisfies a `PaymentRequirements`     |
| `POST /v2/settle`     | Submit a verified payment onchain and wait for confirmation          |
| `GET /v2/supported`   | List the `(scheme, network, asset)` tuples this facilitator supports |

The facilitator never holds funds — it executes onchain transactions based on
the buyer's signed payload.

## When to use a facilitator vs. local verify/settle

| Use a facilitator when…                           | Verify/settle locally when…                            |
|--------------------------------------------------|--------------------------------------------------------|
| You want the simplest integration                | You run blockchain infrastructure anyway               |
| You want consistency across networks             | You need custom settlement logic the facilitator API doesn't expose |
| You want gas sponsoring via extensions           | You're on a network with no facilitator support       |
| You don't want to run RPC nodes or hold gas      | You have strong reasons to keep settlement private    |

For most apps, use a facilitator. The protocol behavior is identical either
way from the client's perspective.

## Available facilitators

| URL                                                    | Networks                                                                              | Notes                          |
|--------------------------------------------------------|---------------------------------------------------------------------------------------|--------------------------------|
| `https://x402.org/facilitator`                         | `eip155:84532`, `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`, `stellar:testnet`, `aptos:2` | Default testnet, zero-config   |
| `https://api.cdp.coinbase.com/platform/v2/x402`        | Base + multiple production networks                                                   | Coinbase Developer Platform    |
| `https://facilitator.payai.network`                    | Various production networks                                                           | PayAI                          |
| `https://morph-rails.morph.network/x402`               | Morph-specific networks (e.g., Hoodi `eip155:2910`, Mainnet `eip155:2818`)            | Use for Morph payments         |
| (self-hosted)                                          | Any network you can RPC into                                                          | Bring your own RPC + gas wallet |

**Always GET `/v2/supported` first** to confirm the live set of supported
networks/tokens for a given facilitator before wiring it into production code.
That endpoint is the source of truth — registry tables in docs drift.

## The full client/server/facilitator flow

12 steps. Steps 1–4 are client ↔ server; 5–11 are server ↔ facilitator; 12 is
the final response back to the client.

1. **Client** GETs the resource.
2. **Server** responds `402 Payment Required` with the base64-encoded
   `PAYMENT-REQUIRED` header carrying the `PaymentRequirements`.
3. **Client** picks one `accepts` entry, builds a `PaymentPayload`, signs it,
   base64-encodes, and retries the request with `PAYMENT-SIGNATURE`.
4. **Server** decodes and JSON-parses the `PAYMENT-SIGNATURE`.
5. **Server** POSTs the `PaymentPayload` + `PaymentRequirements` to the
   facilitator's `/verify`.
6. **Facilitator** verifies the signature and field correctness against the
   scheme spec + network rules, returns a `VerificationResponse`.
7. If verification fails, the server returns a fresh `402` with
   `PAYMENT-REQUIRED` (and possibly `PAYMENT-RESPONSE` with the error). If
   verification succeeds, the server runs the resource handler.
8. **Server** POSTs the same payload to the facilitator's `/settle`.
9. **Facilitator** submits the transaction onchain.
10. **Facilitator** waits for confirmation.
11. **Facilitator** returns a `PaymentExecutionResponse` with the receipt.
12. **Server** responds to the client with `PAYMENT-RESPONSE` (base64-encoded
    settlement response). Success → 200 with the resource body. Failure → 402
    with the error.

## Configuring a facilitator client

### TypeScript

```ts
import { HTTPFacilitatorClient } from "@x402/core/server";

const facilitatorClient = new HTTPFacilitatorClient({
  url: "https://x402.org/facilitator",   // testnet
  // url: "https://api.cdp.coinbase.com/platform/v2/x402",  // production
});
```

### Go

```go
import x402http "github.com/x402-foundation/x402/go/http"

facilitatorClient := x402http.NewHTTPFacilitatorClient(&x402http.FacilitatorConfig{
    URL: "https://x402.org/facilitator",
})
```

### Python

```python
from x402.http import FacilitatorConfig, HTTPFacilitatorClient

facilitator = HTTPFacilitatorClient(
    FacilitatorConfig(url="https://x402.org/facilitator")
)
# Sync version:
# from x402.http import HTTPFacilitatorClientSync
# facilitator = HTTPFacilitatorClientSync(FacilitatorConfig(url="..."))
```

## Local verify/settle (no facilitator)

If you implement verification and settlement yourself, you take on the
responsibility of validating scheme/network-specific signatures and submitting
onchain transactions yourself. You also become responsible for any
duplicate-settlement protection.

### Solana duplicate-settlement race

On Solana, the same signed transaction can be submitted multiple times before
the first one is confirmed onchain; Solana's RPC returns "success" for each
duplicate because the network deduplicates at consensus. A malicious client
can exploit this to consume multiple resources for one payment.

**If you settle Solana payments directly (without a facilitator):**

1. After verification succeeds, derive a cache key from the transaction
   payload (e.g., the base64-encoded transaction string).
2. Reject with `"duplicate_settlement"` if the key is already in the cache.
3. Otherwise insert the key and proceed.
4. Evict entries older than **120 seconds** (~2× the Solana blockhash
   lifetime).

If you use a facilitator, the SVM mechanism packages already include
`SettlementCache` and this is handled automatically. In Go specifically, share
one `SettlementCache` instance between V1 and V2 SVM facilitator schemes
during registration.

EVM doesn't have this issue (nonces in EIP-3009/Permit2 prevent replay).

## Running your own facilitator

Prerequisites:

1. RPC endpoint for the target network.
2. A wallet with native tokens for gas sponsorship (used to broadcast
   settlement transactions).
3. The x402 facilitator code (TS / Go / Python all ship facilitator
   implementations).

Use cases:
- You want immediate support for a network not on existing facilitators.
- You want full control over verify/settle policy (rate limiting, allowlists,
  custom logging).
- You want to test before contributing a new network upstream.

See the x402 repo's `examples/typescript/facilitators` (and equivalent Go /
Python directories) for runnable facilitator implementations to start from.

## Querying `/v2/supported`

```bash
curl https://x402.org/facilitator/v2/supported
```

Returns the list of `(network, scheme, asset)` tuples the facilitator can
verify and settle. Use this at startup to validate that your server's
advertised `accepts` are actually settleable by your chosen facilitator —
otherwise the buyer signs a perfectly valid payload that the facilitator
then rejects.

The shape varies slightly per facilitator but generally:

```jsonc
{
  "supported": [
    {
      "network": "eip155:84532",
      "schemes": ["exact", "upto", "batch-settlement"],
      "assets": [
        { "address": "0x036CbD53842c5426634e7929541eC2318f3dCF7e", "decimals": 6, "symbol": "USDC" }
      ]
    },
    ...
  ]
}
```

Cache this for a short TTL (minutes), not days — facilitator support
configurations can change.
