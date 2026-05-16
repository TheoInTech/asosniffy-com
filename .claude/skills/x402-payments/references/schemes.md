# Payment Schemes

Schemes define **payment semantics** (how the buyer authorizes and the seller
charges). Networks define the **encoding** (EVM EIP-3009/Permit2, Solana SPL,
Algorand, etc.). One scheme runs on one or more networks.

The three schemes are `exact`, `upto`, and `batch-settlement`.

## Decision matrix

| Question                                          | Use                |
|---------------------------------------------------|--------------------|
| Fixed price known up front                        | `exact`            |
| Cost varies per request (LLM tokens, compute, bytes) | `upto`          |
| Repeated micropayments, want batched onchain settlement | `batch-settlement` |
| Available on every network and SDK                | `exact`            |
| Need usage-based billing on Solana / Stellar / etc. | Not supported — `upto` is EVM-only today |

## `exact` — fixed price

Buyer authorizes the exact advertised amount; facilitator settles it. Works on
EVM (EIP-3009 or Permit2), SVM, AVM, Stellar, Aptos, Hedera, TON, Cardano,
Keeta, Sui. Available in TS, Go, and Python.

```ts
// Server: register a scheme client per network
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("eip155:84532", new ExactEvmScheme())
  .register("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", new ExactSvmScheme());

paymentMiddleware({
  "GET /weather": {
    accepts: [
      { scheme: "exact", price: "$0.001", network: "eip155:84532", payTo: "0x..." },
    ],
  },
}, resourceServer);
```

```ts
// Client: register a scheme per network
const client = new x402Client();
client.register("eip155:*", new ExactEvmScheme(evmSigner));
client.register("solana:*", new ExactSvmScheme(svmSigner));
```

### EVM transfer methods

| Method   | When used                                          | Approval? |
|----------|----------------------------------------------------|-----------|
| `eip3009`| Tokens with `transferWithAuthorization` (e.g., USDC) — default when available | No |
| `permit2`| Any ERC-20 (via Uniswap Permit2 + x402 exact proxy) | One-time onchain approval (can be gas-sponsored) |

The SDK picks `eip3009` when supported; falls back to `permit2` otherwise. See
[networks-tokens.md](networks-tokens.md) for the default-asset registry.

## `upto` — usage-based, single request

Buyer authorizes a maximum; server charges actual usage at handler time via
`setSettlementOverrides`. The buyer is never charged more than the
authorized max. EVM-only (uses Permit2 because the final amount isn't known at
signing time).

```ts
// Server
import { setSettlementOverrides } from "@x402/express";
import { UptoEvmScheme } from "@x402/evm/upto/server";

app.use(paymentMiddleware({
  "GET /api/generate": {
    accepts: { scheme: "upto", price: "$0.10", network: "eip155:84532", payTo },
    description: "AI text generation billed by token usage",
  },
}, new x402ResourceServer(facilitatorClient).register("eip155:84532", new UptoEvmScheme())));

app.get("/api/generate", (req, res) => {
  const actualUsage = computeActualCost();    // e.g. 25000 atomic units
  setSettlementOverrides(res, { amount: String(actualUsage) });
  res.json({ result: "..." });
});
```

```ts
// Client — register `UptoEvmScheme` alongside `ExactEvmScheme` if your client
// might call either kind of endpoint
client.register("eip155:*", new ExactEvmScheme(signer));
client.register("eip155:*", new UptoEvmScheme(signer));
```

### `setSettlementOverrides` amount formats

| Format            | Example      | Meaning                                            |
|-------------------|--------------|----------------------------------------------------|
| Raw atomic units  | `"50000"`    | Charge exactly 50,000 token base units             |
| Percentage of max | `"50%"`      | Charge 50% of route's `amount` (up to 2 decimals)  |
| Dollar price      | `"$0.05"`    | Convert USD to atomic units (works when the route was configured with `$`-prefixed pricing) |

`"0"` skips the onchain transaction entirely — the client is not charged.

The resolved amount **must be ≤** the authorized maximum. Anything higher is
rejected.

### Go equivalent

```go
import uptoevm "github.com/x402-foundation/x402/go/mechanisms/evm/upto/server"

mux.HandleFunc("GET /api/generate", func(w http.ResponseWriter, r *http.Request) {
    actualUsage := computeActualCost()
    nethttpmw.SetSettlementOverrides(w, &x402.SettlementOverrides{
        Amount: fmt.Sprintf("%d", actualUsage),
    })
    _ = json.NewEncoder(w).Encode(map[string]string{"result": "..."})
})
```

### Python equivalent

```python
from x402.http.middleware.fastapi import set_settlement_overrides
from x402.mechanisms.evm.upto import UptoEvmServerScheme

@app.get("/api/generate")
async def generate(response: Response):
    actual = compute_actual_cost()
    set_settlement_overrides(response, {"amount": str(actual)})
    return {"result": "..."}
```

## `batch-settlement` — high-throughput EVM

For repeated micropayments. Buyer pre-funds an onchain escrow channel once,
signs off-chain vouchers per request, and the seller redeems in batches. The
402 response still advertises a per-request `amount` (the upper bound); the
seller can charge actual usage up to that cap using the same
`setSettlementOverrides` pattern as `upto`.

```ts
// Client must register both Exact and BatchSettlement to handle mixed APIs
import { BatchSettlementEvmScheme } from "@x402/evm/batch-settlement/client";
import { toClientEvmSigner } from "@x402/evm";

const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });
const batchSigner = toClientEvmSigner(account, publicClient);

client.register("eip155:*", new ExactEvmScheme(account));
client.register(
  "eip155:*",
  new BatchSettlementEvmScheme(batchSigner, { depositPolicy: { depositMultiplier: 5 } }),
);
```

EVM-only. TS + Go supported; Python not yet (see
[sdk-features.md](sdk-features.md)).

The first request to a new host typically triggers a deposit transaction
sized by `depositMultiplier` (deposit covers ~5 average requests by default).

## Choosing between schemes

- **Default to `exact`** for fixed-price API endpoints (weather, geocoding,
  static data lookups, fixed-cost reports).
- **Use `upto`** when the cost depends on work performed *for that one
  request*: LLM completions priced by output tokens, ML inference billed by
  compute time, paginated queries billed by rows returned.
- **Use `batch-settlement`** when you expect high request volume per buyer
  and the onchain settlement cost per request would dominate the actual fee.
  E.g., per-tick streaming data, per-character translation, sub-cent
  microservices. Buyer commits funds upfront; you batch-redeem off-chain
  vouchers.

## Mixing schemes in `accepts`

You can advertise multiple schemes on the same route — the client picks one
whose scheme + network combination it can sign:

```ts
{
  "GET /api/llm": {
    accepts: [
      { scheme: "upto", price: "$0.10", network: "eip155:84532", payTo },
      { scheme: "batch-settlement", price: "$0.10", network: "eip155:84532", payTo },
      // exact also valid; client picks based on registered schemes
    ],
  },
}
```

If the same client has both `UptoEvmScheme` and `BatchSettlementEvmScheme`
registered, the order in `accepts` typically wins.

## Protocol-level specs

For the full payload formats per scheme + network, see:

- `exact` spec — `specs/schemes/exact/scheme_exact.md` + per-network `_evm.md`,
  `_svm.md`, etc.
- `upto` spec — `specs/schemes/upto/scheme_upto.md` + `_evm.md`.
- `batch-settlement` spec — `specs/schemes/batch-settlement/scheme_batch_settlement.md`.

All under https://github.com/x402-foundation/x402.
