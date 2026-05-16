# V1 to V2 Migration

Use V2 for all new code. The V1 facilitator surface remains for backward
compatibility, but V2 introduces CAIP-2 network identifiers, standardized
header names, and a more modular SDK split.

## Wire-level differences

| Aspect          | V1                       | V2                              |
|-----------------|--------------------------|---------------------------------|
| Payment header  | `X-PAYMENT`              | `PAYMENT-SIGNATURE`             |
| Response header | `X-PAYMENT-RESPONSE`     | `PAYMENT-RESPONSE`              |
| 402 header      | (none — JSON body only)  | `PAYMENT-REQUIRED`              |
| Network format  | string (`base-sepolia`)  | CAIP-2 (`eip155:84532`)         |
| Version field   | `x402Version: 1`         | `x402Version: 2`                |

Custom HTTP handlers must update header names; SDK users get this for free.

## Package renames (TypeScript)

| V1 package       | V2 package(s)                    |
|------------------|----------------------------------|
| `x402`           | `@x402/core`                     |
| `x402-express`   | `@x402/express`                  |
| `x402-axios`     | `@x402/axios`                    |
| `x402-fetch`     | `@x402/fetch`                    |
| `x402-hono`      | `@x402/hono`                     |
| `x402-next`      | `@x402/next`                     |
| (was built-in)   | `@x402/evm` (EVM support)        |
| (was built-in)   | `@x402/svm` (Solana support)     |

Each network namespace is now a separate package — install only what you use.

## Network identifier mapping

| V1 name         | V2 CAIP-2 ID                                                | Chain ID  |
|-----------------|-------------------------------------------------------------|-----------|
| `base-sepolia`  | `eip155:84532`                                              | 84532     |
| `base`          | `eip155:8453`                                               | 8453      |
| `ethereum`      | `eip155:1`                                                  | 1         |
| `sepolia`       | `eip155:11155111`                                           | 11155111  |
| `solana-devnet` | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` (full CAIP-2 hash) | -         |
| `solana`        | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` (full CAIP-2 hash) | -         |

Note: V2 Solana uses the full genesis-hash form, not the `:devnet`/`:mainnet`
shorthand. Some early docs use shorter strings — prefer the genesis-hash form.

## Code changes — buyer side (TypeScript)

```ts
// V1
import { withPaymentInterceptor } from "x402-axios";
const api = withPaymentInterceptor(
  axios.create({ baseURL }),
  walletClient,
);
```

```ts
// V2
import { x402Client, wrapAxiosWithPayment } from "@x402/axios";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";

const signer = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`);
const client = new x402Client();
client.register("eip155:*", new ExactEvmScheme(signer));

const api = wrapAxiosWithPayment(axios.create({ baseURL }), client);
```

Key changes:
1. Package: `x402-axios` → `@x402/axios`.
2. Function: `withPaymentInterceptor` → `wrapAxiosWithPayment`.
3. Wallet setup: use `x402Client.register()` instead of passing a wallet directly.
4. The V2 client automatically selects the network based on the 402 response.

## Code changes — buyer side (Python)

```python
# V1
from x402.clients.httpx import x402HttpxClient

account = Account.from_key(os.getenv("PRIVATE_KEY"))
async with x402HttpxClient(account=account, base_url="https://api.example.com") as client:
    response = await client.get("/protected-endpoint")
```

```python
# V2
from x402 import x402Client
from x402.http import x402HTTPClient
from x402.http.clients import x402HttpxClient
from x402.mechanisms.evm import EthAccountSigner
from x402.mechanisms.evm.exact.register import register_exact_evm_client

client = x402Client()
account = Account.from_key(os.getenv("EVM_PRIVATE_KEY"))
register_exact_evm_client(client, EthAccountSigner(account))

http_client = x402HTTPClient(client)
async with x402HttpxClient(client) as http:
    response = await http.get("https://api.example.com/paid-endpoint")
```

Key changes:
1. Import paths: `x402.clients.httpx` → `x402.http.clients`.
2. Wrap `eth_account.Account` with `EthAccountSigner`.
3. Construct `x402Client()` first, then register schemes.
4. Env var rename: `PRIVATE_KEY` → `EVM_PRIVATE_KEY`.
5. Async vs sync variants: `x402Client` for httpx, `x402ClientSync` for requests.

## Code changes — seller side (TypeScript)

```ts
// V1
import { paymentMiddleware, FacilitatorConfig } from "x402-express";

app.use(paymentMiddleware(
  { url: "https://x402.org/facilitator" },
  {
    "GET /weather": {
      price: "$0.001",
      network: "base-sepolia",  // V1 string
      config: { description: "Get weather data" },
    },
  },
));
```

```ts
// V2
import { paymentMiddleware } from "@x402/express";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";

const facilitatorClient = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });
const server = new x402ResourceServer(facilitatorClient);
server.register("eip155:*", new ExactEvmScheme());

app.use(paymentMiddleware(
  {
    "GET /weather": {
      accepts: [{
        scheme: "exact",
        price: "$0.001",
        network: "eip155:84532",  // V2 CAIP-2
        payTo,
      }],
      description: "Get weather data",
      mimeType: "application/json",
    },
  },
  server,
));
```

Key changes:
1. Route config: `price`+`network`+`config.description` → `accepts: [{...}]`
   array with explicit `scheme`, `network`, `payTo`.
2. Network: `"base-sepolia"` → `"eip155:84532"`.
3. Create an `x402ResourceServer` with a facilitator client; register schemes
   via `.register()`.
4. `payTo` is now per-route.

## Code changes — seller side (Python)

```python
# V1
from x402.fastapi.middleware import require_payment

app.middleware("http")(
    require_payment(
        path="/weather",
        price="$0.001",
        pay_to_address="0xYourAddress",
        network="base-sepolia",
    )
)
```

```python
# V2
from x402.http import FacilitatorConfig, HTTPFacilitatorClient, PaymentOption
from x402.http.middleware.fastapi import PaymentMiddlewareASGI
from x402.http.types import RouteConfig
from x402.mechanisms.evm.exact import ExactEvmServerScheme
from x402.server import x402ResourceServer

facilitator = HTTPFacilitatorClient(FacilitatorConfig(url="https://x402.org/facilitator"))
server = x402ResourceServer(facilitator)
server.register("eip155:84532", ExactEvmServerScheme())

routes = {
    "GET /weather": RouteConfig(
        accepts=[PaymentOption(scheme="exact", pay_to="0xYourAddress",
                               price="$0.001", network="eip155:84532")],
        mime_type="application/json",
        description="Get weather data",
    ),
}
app.add_middleware(PaymentMiddlewareASGI, routes=routes, server=server)
```

Key changes:
1. Import paths: `x402.fastapi.middleware` → `x402.http.middleware.fastapi`.
2. `require_payment` decorator → `PaymentMiddlewareASGI` class.
3. `RouteConfig` and `PaymentOption` are Pydantic models now.
4. Network: `"base-sepolia"` → `"eip155:84532"`.
5. Async / sync split: `x402ResourceServer` + `HTTPFacilitatorClient` for
   FastAPI; `x402ResourceServerSync` + `HTTPFacilitatorClientSync` for Flask.

## Import path map (Python)

| V1 path                    | V2 path                                       |
|----------------------------|-----------------------------------------------|
| `x402.clients.httpx`       | `x402.http.clients.x402HttpxClient`           |
| `x402.clients.requests`    | `x402.http.clients.x402_requests`             |
| `x402.fastapi.middleware`  | `x402.http.middleware.fastapi`                |
| `x402.flask.middleware`    | `x402.http.middleware.flask`                  |
| `x402.facilitator`         | `x402.http.HTTPFacilitatorClient`             |
| (new)                      | `x402.mechanisms.evm.EthAccountSigner`        |
| (new)                      | `x402.mechanisms.evm.exact.register_exact_evm_client` |
| (new)                      | `x402.mechanisms.svm.KeypairSigner`           |
| (new)                      | `x402.mechanisms.svm.exact.register_exact_svm_client` |
| (new)                      | `x402.server.x402ResourceServer`              |

### Installation extras

```bash
pip install "x402[httpx]"      # async HTTP clients
pip install "x402[requests]"   # sync HTTP clients
pip install "x402[fastapi]"    # FastAPI servers
pip install "x402[flask]"      # Flask servers
pip install "x402[svm]"        # Solana support
```

## Header updates for custom HTTP handlers

```ts
// V1
const payment = req.header("X-PAYMENT");
res.setHeader("X-PAYMENT-RESPONSE", data);

// V2
const payment = req.header("PAYMENT-SIGNATURE");
res.setHeader("PAYMENT-RESPONSE", data);
```

```python
# V1
payment = request.headers.get("X-PAYMENT")
response.headers["X-PAYMENT-RESPONSE"] = response_data

# V2
payment = request.headers.get("PAYMENT-SIGNATURE")
response.headers["PAYMENT-RESPONSE"] = response_data
```

## Troubleshooting

### "Cannot find module" / "ModuleNotFoundError"

Install the new V2 packages:

```bash
# TypeScript buyers
npm install @x402/axios @x402/evm
# TypeScript sellers (Express)
npm install @x402/express @x402/core @x402/evm
# Python with the right extras
pip install "x402[httpx]"
pip install "x402[fastapi]"
pip install "x402[svm]"   # add for Solana
```

### Payment verification failures

- Confirm CAIP-2 network IDs (`eip155:84532`, not `base-sepolia`).
- Confirm `payTo` is correct.
- Confirm the facilitator URL is right for your network (testnet vs mainnet).
- Query the facilitator's `/v2/supported` to confirm the network+scheme is
  actually settleable.

### Mixed V1/V2 compatibility

Facilitators support both protocols simultaneously, so a V2 server can accept
V1 clients during migration. Update clients to V2 to access new features
(extensions, batch-settlement, etc.).
