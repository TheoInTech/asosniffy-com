# Server Integration (Sellers)

How to add x402 payment middleware to your API across supported frameworks.

## Common pattern

Every integration follows the same three-step pattern:

1. Create an `HTTPFacilitatorClient` pointing at a facilitator URL.
2. Create an `x402ResourceServer` (or framework equivalent), `register` one
   scheme implementation per `(network, scheme)` pair you accept, and pass it
   to the framework's payment middleware.
3. Declare per-route `accepts: [{ scheme, price, network, payTo }]` configs.

`scheme` is `"exact" | "upto" | "batch-settlement"`. `network` is CAIP-2.
`price` is either `"$0.001"` (requires default-asset for chain) or a
`TokenAmount` object with `amountInAtomicUnits` + `asset` + `eip712`. `payTo`
is your wallet address.

## RouteConfig interface

```ts
interface RouteConfig {
  accepts: Array<{
    scheme: "exact" | "upto" | "batch-settlement";
    price: string | TokenAmount;     // "$0.001" or TokenAmount object
    network: string;                 // CAIP-2: "eip155:84532", "solana:<genesisHash>"
    payTo: string;                   // your wallet address
  }>;
  description?: string;
  mimeType?: string;                 // e.g. "application/json"
  extensions?: Record<string, unknown>;  // declared per-route extension configs
}
```

Routes are keyed by `"<METHOD> <path>"`, e.g., `"GET /weather"`,
`"POST /api/predict"`.

## Express

```ts
// pnpm add @x402/express @x402/core @x402/evm @x402/svm
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

const app = express();
const evmAddress = "0xYourEvmAddress";
const svmAddress = "YourSolanaAddress";

const facilitatorClient = new HTTPFacilitatorClient({
  url: "https://x402.org/facilitator",
});

app.use(
  paymentMiddleware(
    {
      "GET /weather": {
        accepts: [
          { scheme: "exact", price: "$0.001", network: "eip155:84532", payTo: evmAddress },
          { scheme: "exact", price: "$0.001",
            network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", payTo: svmAddress },
        ],
        description: "Weather data",
        mimeType: "application/json",
      },
    },
    new x402ResourceServer(facilitatorClient)
      .register("eip155:84532", new ExactEvmScheme())
      .register("solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", new ExactSvmScheme()),
  ),
);

app.get("/weather", (_, res) => res.json({ weather: "sunny", temperature: 70 }));
app.listen(4021);
```

## Hono

```ts
// pnpm add @x402/hono @x402/core @x402/evm @x402/svm
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

const app = new Hono();
const facilitatorClient = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });

app.use(
  paymentMiddleware(
    {
      "GET /weather": {
        accepts: [
          { scheme: "exact", price: "$0.001", network: "eip155:84532", payTo: "0xYourAddress" },
        ],
        description: "Weather data",
        mimeType: "application/json",
      },
    },
    new x402ResourceServer(facilitatorClient).register("eip155:84532", new ExactEvmScheme()),
  ),
);

app.get("/weather", (c) => c.json({ weather: "sunny", temperature: 70 }));
serve({ fetch: app.fetch, port: 4021 });
```

## Fastify

```ts
// pnpm add @x402/fastify @x402/core @x402/evm
import Fastify from "fastify";
import { paymentMiddleware, x402ResourceServer } from "@x402/fastify";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

const app = Fastify();
const facilitatorClient = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });

paymentMiddleware(
  app,
  {
    "GET /weather": {
      accepts: [{ scheme: "exact", price: "$0.001", network: "eip155:84532", payTo: "0xYourAddress" }],
      description: "Weather data",
      mimeType: "application/json",
    },
  },
  new x402ResourceServer(facilitatorClient).register("eip155:84532", new ExactEvmScheme()),
);

app.get("/weather", async () => ({ weather: "sunny", temperature: 70 }));
app.listen({ port: 4021 });
```

## Next.js — two patterns

`paymentProxy` protects page routes or multiple routes via a single config.
`withX402` wraps an individual API route handler and **only settles after a
successful response** (status < 400) — prefer it for API routes.

```ts
// proxy.ts — shared server config
import { paymentProxy } from "@x402/next";
import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";

export const evmAddress = "0xYourEvmAddress";
const facilitatorClient = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });

export const server = new x402ResourceServer(facilitatorClient);
server.register("eip155:*", new ExactEvmScheme());

export const proxy = paymentProxy(
  {
    "/protected": {
      accepts: [{ scheme: "exact", price: "$0.001", network: "eip155:84532", payTo: evmAddress }],
      description: "Premium content",
      mimeType: "text/html",
    },
  },
  server,
);

export const config = { matcher: ["/protected/:path*"] };
```

```ts
// app/api/weather/route.ts — withX402, settles only on success
import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { server, evmAddress } from "../../../proxy";

const handler = async (_: NextRequest) =>
  NextResponse.json({ weather: "sunny", temperature: 72 });

export const GET = withX402(
  handler,
  {
    accepts: [{ scheme: "exact", price: "$0.001", network: "eip155:84532", payTo: evmAddress }],
    description: "Access to weather API",
    mimeType: "application/json",
  },
  server,
);
```

## Go (Gin)

```go
// go get github.com/x402-foundation/x402/go
package main

import (
    "net/http"
    "time"

    x402 "github.com/x402-foundation/x402/go"
    x402http "github.com/x402-foundation/x402/go/http"
    ginmw "github.com/x402-foundation/x402/go/http/gin"
    evm "github.com/x402-foundation/x402/go/mechanisms/evm/exact/server"
    "github.com/gin-gonic/gin"
)

func main() {
    r := gin.Default()
    facilitatorClient := x402http.NewHTTPFacilitatorClient(&x402http.FacilitatorConfig{
        URL: "https://x402.org/facilitator",
    })

    r.Use(ginmw.X402Payment(ginmw.Config{
        Routes: x402http.RoutesConfig{
            "GET /weather": {
                Accepts: x402http.PaymentOptions{
                    {Scheme: "exact", Price: "$0.001", Network: "eip155:84532", PayTo: "0xYourEvmAddress"},
                },
                Description: "Get weather data",
                MimeType:    "application/json",
            },
        },
        Facilitator: facilitatorClient,
        Schemes: []ginmw.SchemeConfig{
            {Network: x402.Network("eip155:84532"), Server: evm.NewExactEvmScheme()},
        },
        Timeout: 30 * time.Second,
    }))

    r.GET("/weather", func(c *gin.Context) {
        c.JSON(http.StatusOK, gin.H{"weather": "sunny", "temperature": 70})
    })
    r.Run(":4021")
}
```

Equivalent middleware packages exist for **net/http** (`x402/go/http/nethttp`)
and **Echo** (`x402/go/http/echo`), with identical Config shape.

## Python — FastAPI

```python
# pip install "x402[fastapi]"   # add "x402[svm]" for Solana
from typing import Any
from fastapi import FastAPI

from x402.http import FacilitatorConfig, HTTPFacilitatorClient, PaymentOption
from x402.http.middleware.fastapi import PaymentMiddlewareASGI
from x402.http.types import RouteConfig
from x402.mechanisms.evm.exact import ExactEvmServerScheme
from x402.schemas import Network
from x402.server import x402ResourceServer

app = FastAPI()
EVM_NETWORK: Network = "eip155:84532"

facilitator = HTTPFacilitatorClient(FacilitatorConfig(url="https://x402.org/facilitator"))
server = x402ResourceServer(facilitator)
server.register(EVM_NETWORK, ExactEvmServerScheme())

routes: dict[str, RouteConfig] = {
    "GET /weather": RouteConfig(
        accepts=[
            PaymentOption(scheme="exact", pay_to="0xYourEvmAddress",
                          price="$0.001", network=EVM_NETWORK),
        ],
        mime_type="application/json",
        description="Weather report",
    ),
}

app.add_middleware(PaymentMiddlewareASGI, routes=routes, server=server)

@app.get("/weather")
async def get_weather() -> dict[str, Any]:
    return {"weather": "sunny", "temperature": 70}
```

## Python — Flask (sync)

```python
# pip install "x402[flask]"
from flask import Flask, jsonify

from x402.http import FacilitatorConfig, HTTPFacilitatorClientSync, PaymentOption
from x402.http.middleware.flask import payment_middleware
from x402.http.types import RouteConfig
from x402.mechanisms.evm.exact import ExactEvmServerScheme
from x402.schemas import Network
from x402.server import x402ResourceServerSync

app = Flask(__name__)
EVM_NETWORK: Network = "eip155:84532"

facilitator = HTTPFacilitatorClientSync(FacilitatorConfig(url="https://x402.org/facilitator"))
server = x402ResourceServerSync(facilitator)
server.register(EVM_NETWORK, ExactEvmServerScheme())

routes = {
    "GET /weather": RouteConfig(
        accepts=[PaymentOption(scheme="exact", pay_to="0xYourEvmAddress",
                               price="$0.001", network=EVM_NETWORK)],
        mime_type="application/json",
        description="Weather report",
    ),
}

payment_middleware(app, routes=routes, server=server)

@app.route("/weather")
def get_weather():
    return jsonify({"weather": "sunny", "temperature": 70})
```

For sync, note the `Sync` suffixes: `x402ResourceServerSync`,
`HTTPFacilitatorClientSync`.

## Multi-network with wildcards

Register `eip155:*` (matches every EVM chain) and `solana:*` once instead of
registering each chain explicitly. The middleware picks the right scheme based
on the route's advertised `network`.

```ts
server.register("eip155:*", new ExactEvmScheme());
server.register("solana:*", new ExactSvmScheme());
```

```go
// Go does not currently support wildcards in scheme registration; list each
// network explicitly.
Schemes: []ginmw.SchemeConfig{
    {Network: x402.Network("eip155:8453"),  Server: evm.NewExactEvmScheme()},
    {Network: x402.Network("eip155:84532"), Server: evm.NewExactEvmScheme()},
},
```

## Testing the integration

1. Hit the endpoint without payment — confirm HTTP 402 + `PAYMENT-REQUIRED`
   header.
2. Decode the header (base64 → JSON) and confirm `accepts` lists your offer.
3. Use a buyer client (see [client-integration.md](client-integration.md)) to
   complete the round trip.
4. Verify a `PAYMENT-RESPONSE` header is set on the 200, and the receipt
   transaction is on the relevant explorer.

## Mainnet checklist

When moving from testnet:

- Swap facilitator URL to a production one (CDP, PayAI, etc.).
- Swap CAIP-2 from testnet to mainnet (`eip155:8453` for Base mainnet,
  `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` for Solana mainnet).
- Confirm `payTo` is your mainnet receiving address.
- Test with small amounts first.

## Bazaar discovery (recommended)

To make your endpoint findable by AI agents and other buyers, attach a Bazaar
discovery extension:

```ts
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";

{
  "GET /weather": {
    accepts: [{ scheme: "exact", price: "$0.001", network: "eip155:8453", payTo: "0x..." }],
    description: "Real-time weather data",
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

Only Bazaar-enabled facilitators index these. See
[extensions.md](extensions.md) for details.
