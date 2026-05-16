# Client Integration (Buyers)

How to pay x402 endpoints automatically across HTTP libraries and chains.

## Common pattern

1. Create a chain-specific signer (viem account, eth-account Account,
   SolanaKit keypair, etc.).
2. Create an `x402Client`, then `register` one scheme client per `(network,
   scheme)` you can pay on (e.g., `ExactEvmScheme(evmSigner)`).
3. Wrap your HTTP client (fetch, axios, Go `http.Client`, httpx, requests)
   with the matching `wrap...WithPayment` helper.
4. Make requests as normal — the wrapper intercepts 402 responses, signs the
   payload, retries, and returns the final response with a `PAYMENT-RESPONSE`
   receipt header.

## TypeScript — `@x402/fetch` (native fetch)

```ts
// pnpm add @x402/fetch @x402/core @x402/evm viem
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);

const client = new x402Client();
client.register("eip155:*", new ExactEvmScheme(signer));

const fetchWithPayment = wrapFetchWithPayment(fetch, client);
const response = await fetchWithPayment("https://api.example.com/paid-endpoint");
const data = await response.json();

// Pull the receipt from the response headers
if (response.ok) {
  const httpClient = new x402HTTPClient(client);
  const receipt = httpClient.getPaymentSettleResponse(
    (name) => response.headers.get(name),
  );
  console.log("Settled:", receipt);
}
```

## TypeScript — `@x402/axios`

```ts
// pnpm add @x402/axios @x402/evm viem axios
import { x402Client, wrapAxiosWithPayment, x402HTTPClient } from "@x402/axios";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import axios from "axios";

const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
const client = new x402Client();
client.register("eip155:*", new ExactEvmScheme(signer));

const api = wrapAxiosWithPayment(
  axios.create({ baseURL: "https://api.example.com" }),
  client,
);

const response = await api.get("/paid-endpoint");
console.log(response.data);

const httpClient = new x402HTTPClient(client);
const receipt = httpClient.getPaymentSettleResponse(
  (name) => response.headers[name.toLowerCase()],
);
```

## Go (`net/http`)

```go
// go get github.com/x402-foundation/x402/go
package main

import (
    "context"
    "encoding/json"
    "net/http"
    "os"
    "time"

    x402 "github.com/x402-foundation/x402/go"
    x402http "github.com/x402-foundation/x402/go/http"
    evm "github.com/x402-foundation/x402/go/mechanisms/evm/exact/client"
    evmsigners "github.com/x402-foundation/x402/go/signers/evm"
)

func main() {
    evmSigner, _ := evmsigners.NewClientSignerFromPrivateKey(os.Getenv("EVM_PRIVATE_KEY"))

    x402Client := x402.Newx402Client().
        Register("eip155:*", evm.NewExactEvmScheme(evmSigner, nil))

    httpClient := x402http.WrapHTTPClientWithPayment(
        http.DefaultClient,
        x402http.Newx402HTTPClient(x402Client),
    )

    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    req, _ := http.NewRequestWithContext(ctx, "GET", "http://localhost:4021/weather", nil)
    resp, _ := httpClient.Do(req)
    defer resp.Body.Close()

    var data map[string]any
    json.NewDecoder(resp.Body).Decode(&data)

    if resp.Header.Get("PAYMENT-RESPONSE") != "" {
        // Settlement receipt present — decode if you need its fields
    }
}
```

## Python — httpx (async)

```python
# pip install "x402[httpx]"
import asyncio, os
from eth_account import Account

from x402 import x402Client
from x402.http import x402HTTPClient
from x402.http.clients import x402HttpxClient
from x402.mechanisms.evm import EthAccountSigner
from x402.mechanisms.evm.exact.register import register_exact_evm_client

async def main() -> None:
    client = x402Client()
    account = Account.from_key(os.getenv("EVM_PRIVATE_KEY"))
    register_exact_evm_client(client, EthAccountSigner(account))

    http_client = x402HTTPClient(client)

    async with x402HttpxClient(client) as http:
        response = await http.get("https://api.example.com/paid-endpoint")
        await response.aread()
        if response.is_success:
            receipt = http_client.get_payment_settle_response(
                lambda name: response.headers.get(name),
            )

asyncio.run(main())
```

## Python — requests (sync)

```python
# pip install "x402[requests]"
import os
from eth_account import Account

from x402 import x402ClientSync
from x402.http import x402HTTPClientSync
from x402.http.clients import x402_requests
from x402.mechanisms.evm import EthAccountSigner
from x402.mechanisms.evm.exact.register import register_exact_evm_client

client = x402ClientSync()
account = Account.from_key(os.getenv("EVM_PRIVATE_KEY"))
register_exact_evm_client(client, EthAccountSigner(account))

http_client = x402HTTPClientSync(client)

with x402_requests(client) as session:
    response = session.get("https://api.example.com/paid-endpoint")
    if response.ok:
        receipt = http_client.get_payment_settle_response(
            lambda name: response.headers.get(name),
        )
```

## Signers per chain

### EVM (`viem` / TypeScript)

```ts
import { privateKeyToAccount } from "viem/accounts";
const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
```

### EVM (Go)

```go
import evmsigners "github.com/x402-foundation/x402/go/signers/evm"
signer, err := evmsigners.NewClientSignerFromPrivateKey(os.Getenv("EVM_PRIVATE_KEY"))
```

### EVM (Python)

```python
from eth_account import Account
from x402.mechanisms.evm import EthAccountSigner
signer = EthAccountSigner(Account.from_key(os.getenv("EVM_PRIVATE_KEY")))
```

### Solana (TypeScript)

```ts
// pnpm add @solana/kit @scure/base @x402/svm
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";

const svmSigner = await createKeyPairSignerFromBytes(
  base58.decode(process.env.SVM_PRIVATE_KEY!),  // 64-byte base58 secret
);
```

### Aptos (TypeScript)

```ts
import { Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";
const privateKey = new Ed25519PrivateKey(process.env.APTOS_PRIVATE_KEY!);
const aptosSigner = Account.fromPrivateKey({ privateKey });
```

### Algorand (TypeScript)

```ts
import { toClientAvmSigner } from "@x402/avm";
const avmSigner = toClientAvmSigner(process.env.AVM_PRIVATE_KEY!);  // base64 64-byte
```

### Stellar (TypeScript)

```ts
import { createEd25519Signer } from "@x402/stellar";
const stellarSigner = createEd25519Signer(process.env.STELLAR_PRIVATE_KEY!, "stellar:testnet");
```

## Multi-network client

Register multiple schemes on the same client and the wrapper picks the right
one based on the 402 response's `network`:

```ts
const client = new x402Client();
client.register("eip155:*", new ExactEvmScheme(evmSigner));
client.register("eip155:*", new UptoEvmScheme(evmSigner));               // optional
client.register("eip155:*", new BatchSettlementEvmScheme(batchSigner));  // optional
client.register("solana:*", new ExactSvmScheme(svmSigner));
```

If the server advertises multiple `accepts` entries, the client picks the
first whose `(scheme, network)` matches a registered scheme implementation.

## Handling specific scenarios

- **You want to try an API key before paying.** Register an HTTP-level
  `onPaymentRequired` hook that returns `{ headers: { Authorization: ... } }`
  to retry with an auth header first. See
  [lifecycle-hooks.md](lifecycle-hooks.md).
- **You want to cap spending.** Register an `onBeforePaymentCreation` hook that
  inspects `context.selectedRequirements.amount` and aborts above your cap.
- **The endpoint uses `upto`.** No special client work — the wrapper signs for
  the maximum advertised in `accepts[].amount`, and the server settles the
  actual usage via `setSettlementOverrides`. You may be charged less than the
  authorized maximum.
- **The endpoint uses `batch-settlement`.** Register
  `BatchSettlementEvmScheme(batchSigner)` in addition to `ExactEvmScheme`.
  The first request to a host typically pre-funds the channel.
- **You need idempotency on retries.** Use the `payment-identifier` extension
  on the client side (see [extensions.md](extensions.md)) to attach a unique
  identifier to each payment so the server can dedupe.

## Reading the receipt

The `PAYMENT-RESPONSE` header is on the final (successful or failed) response.
Use the SDK helper rather than decoding manually:

```ts
const httpClient = new x402HTTPClient(client);
const receipt = httpClient.getPaymentSettleResponse(
  (name) => response.headers.get(name),
);
// receipt fields: { success, transaction, network, amount, asset, payer, settledAt, ... }
```

Surfacing receipt fields (transaction hash, network, amount, settled-at) to
users is the standard pattern for paid-API UIs.
