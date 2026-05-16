# SDK Feature Parity

Which features ship in which SDK as of late 2025. Use this when picking a
language/framework so you don't reach for something that isn't implemented.

## Core

| Component   | TypeScript | Go  | Python |
|-------------|------------|-----|--------|
| Server      | ✅         | ✅  | ✅     |
| Client      | ✅         | ✅  | ✅     |
| Facilitator | ✅         | ✅  | ✅     |

## HTTP framework integrations

| Role   | TypeScript                          | Go                          | Python              |
|--------|-------------------------------------|-----------------------------|---------------------|
| Server | Express, Hono, Next.js, Fastify     | Gin, net/http, Echo         | FastAPI, Flask      |
| Client | Fetch, Axios                        | net/http                    | httpx, requests     |

## Networks

| Network            | TypeScript | Go  | Python |
|--------------------|------------|-----|--------|
| EVM (`eip155:*`)   | ✅         | ✅  | ✅     |
| Solana (`solana:*`)| ✅         | ✅  | ✅     |
| TON (`tvm:*`)      | ❌         | ❌  | ✅     |
| Algorand           | ✅         | ❌  | ❌     |
| Stellar            | ✅         | ❌  | ❌     |
| Aptos              | ✅         | ❌  | ❌     |
| Hedera             | ✅         | ❌  | ❌     |

## Mechanisms (scheme × network × transfer method)

| Scheme              | Network    | Transfer  | TS  | Go  | Python |
|---------------------|------------|-----------|-----|-----|--------|
| exact               | evm        | eip3009   | ✅  | ✅  | ✅     |
| exact               | evm        | permit2   | ✅  | ✅  | ✅     |
| exact               | svm        | -         | ✅  | ✅  | ✅     |
| exact               | avm        | -         | ✅  | ❌  | ❌     |
| exact               | stellar    | -         | ✅  | ❌  | ❌     |
| exact               | aptos      | -         | ✅  | ❌  | ❌     |
| exact               | hedera     | -         | ✅  | ❌  | ❌     |
| exact               | tvm        | -         | ❌  | ❌  | ✅     |
| upto                | evm        | permit2   | ✅  | ✅  | ✅     |
| batch-settlement    | evm        | eip3009   | ✅  | ✅  | ❌     |
| batch-settlement    | evm        | permit2   | ✅  | ✅  | ❌     |

If you need batch-settlement, choose TS or Go.
If you need Algorand/Stellar/Aptos/Hedera, choose TS.
If you need TON, choose Python.
For EVM + Solana standard `exact` flows, all three SDKs are full-featured.

## Extensions

| Extension                         | TS  | Go  | Python |
|-----------------------------------|-----|-----|--------|
| Bazaar (server)                   | ✅  | ✅  | ✅     |
| Bazaar facilitator client — list  | ✅  | ✅  | ✅     |
| Bazaar facilitator client — search| ✅  | ✅  | ✅     |
| Sign-In-With-X (SIWX)             | ✅  | ❌  | ❌     |
| Payment-Identifier (idempotency)  | ✅  | ✅  | ✅     |
| Signed Offers & Receipts          | ✅  | ❌  | ❌     |
| EIP-2612 Gas Sponsoring           | ✅  | ✅  | ✅     |
| ERC-20 Approval Gas Sponsoring    | ✅  | ✅  | ✅     |

SIWX and Signed Offers/Receipts are TS-only today.

## Client hooks

| Hook                       | TS  | Go  | Python |
|----------------------------|-----|-----|--------|
| onBeforePaymentCreation    | ✅  | ✅  | ✅     |
| onAfterPaymentCreation     | ✅  | ✅  | ✅     |
| onPaymentCreationFailure   | ✅  | ✅  | ✅     |
| onPaymentResponse          | ✅  | ✅  | ❌     |
| onPaymentRequired (HTTP)   | ✅  | ❌  | ❌     |

## Server hooks

| Hook                       | TS  | Go  | Python |
|----------------------------|-----|-----|--------|
| onBeforeVerify             | ✅  | ✅  | ✅     |
| onAfterVerify              | ✅  | ✅  | ✅     |
| onVerifyFailure            | ✅  | ✅  | ✅     |
| onBeforeSettle             | ✅  | ✅  | ✅     |
| onAfterSettle              | ✅  | ✅  | ✅     |
| onSettleFailure            | ✅  | ✅  | ✅     |
| onVerifiedPaymentCanceled  | ✅  | ✅  | ❌     |
| onProtectedRequest (HTTP)  | ✅  | ✅  | ❌     |

## Facilitator hooks

| Hook              | TS  | Go  | Python |
|-------------------|-----|-----|--------|
| onBeforeVerify    | ✅  | ✅  | ✅     |
| onAfterVerify     | ✅  | ✅  | ✅     |
| onVerifyFailure   | ✅  | ✅  | ✅     |
| onBeforeSettle    | ✅  | ✅  | ✅     |
| onAfterSettle     | ✅  | ✅  | ✅     |
| onSettleFailure   | ✅  | ✅  | ✅     |

## Extension hooks

| Hook                              | TS  | Go  | Python |
|-----------------------------------|-----|-----|--------|
| enrichDeclaration                 | ✅  | ✅  | ✅     |
| enrichPaymentRequiredResponse     | ✅  | ❌  | ❌     |
| enrichSettlementResponse          | ✅  | ❌  | ❌     |

The "enrich response" hooks are TS-only for now. Go and Python can declare
extensions but can't yet contribute response data.

## Hook adapter features

| Feature                                              | TS  | Go  | Python |
|------------------------------------------------------|-----|-----|--------|
| Scheme-level lifecycle hook adapters                 | ✅  | ✅  | ❌     |
| Extension-level server lifecycle hook adapters       | ✅  | ✅  | ❌     |
| Extension-level server HTTP transport hook adapters  | ✅  | ❌  | ❌     |
| Extension-level client lifecycle hook adapters       | ✅  | ❌  | ❌     |
| Extension-level client HTTP transport hook adapters  | ✅  | ❌  | ❌     |

## MCP

| Feature                                | TS  | Go  | Python |
|----------------------------------------|-----|-----|--------|
| MCP server payment wrapper             | ✅  | ✅  | ✅     |
| MCP client (auto-pay tools)            | ✅  | ✅  | ✅     |
| Bazaar discovery for MCP tools         | ✅  | ✅  | ✅     |

### MCP client hooks

| Hook                  | TS  | Go  | Python |
|-----------------------|-----|-----|--------|
| onPaymentRequired     | ✅  | ❌  | ❌     |
| onBeforePayment       | ✅  | ❌  | ❌     |
| onAfterPayment        | ✅  | ❌  | ❌     |

### MCP server hooks (payment wrapper)

| Hook                  | TS  | Go  | Python |
|-----------------------|-----|-----|--------|
| onBeforeExecution     | ✅  | ❌  | ❌     |
| onAfterExecution      | ✅  | ❌  | ❌     |
| onAfterSettlement     | ✅  | ❌  | ❌     |

TypeScript has the deepest MCP integration. Go and Python can run paid MCP
tools but lack the lifecycle hook surface.

## HTTP server features

| Feature              | TS  | Go  | Python |
|----------------------|-----|-----|--------|
| dynamicPayTo         | ✅  | ✅  | ✅     |
| dynamicPrice         | ✅  | ✅  | ✅     |
| paywall (browser UI) | ✅  | ✅  | ✅     |

`dynamicPayTo` and `dynamicPrice` let you compute the recipient address or
the price per-request (e.g., based on the requesting user, geo, or
content). All three SDKs support both. The browser paywall is a built-in
HTML page that human users see when hitting a paid endpoint with a browser
instead of an x402 client — handy for testing and for hybrid endpoints that
serve both agents and humans.

## Choosing an SDK

| If you need…                                          | Recommended SDK         |
|-------------------------------------------------------|-------------------------|
| The widest feature set + every extension              | **TypeScript**          |
| Multiple supported networks beyond EVM/Solana (Algorand, Stellar, Aptos, Hedera) | **TypeScript** |
| TON support                                           | **Python**              |
| A statically-typed backend with good concurrency      | **Go**                  |
| MCP servers + lifecycle hook customization            | **TypeScript**          |
| Just a paying client for an existing EVM/Solana API   | Any of the three        |

When you need the canonical reference for a feature, prefer the TypeScript
implementation — it leads the parity matrix.
