# Morph Rails — Payment Middleware

**Morph Rails** is Morph's payment middleware layer: gas abstraction (AltFee), merchant reconciliation (Reference Key), agentic discovery (Morph Skill Hub), and the hosted x402 facilitator (covered in `references/x402-facilitator.md`).

Core architectural points to internalize:
- **Non-custodial** — Rails never holds user funds; settlement is always on-chain.
- **Permissionless** — no KYC, no minimum volume, no merchant approval.
- **Wallet = identity** — your wallet address IS your merchant/agent identity.
- **Programmable end-to-end** — SDK / API / CLI / MCP interfaces; no humans required in the loop.

## AltFee — pay gas in ERC-20

Morph's native gas abstraction. Submit a **Type-0x7F transaction** (Morph-specific tx type) with a `token_id` field, and the sequencer deducts gas in the chosen ERC-20 instead of ETH.

| Token | L2 Address | AltFee Token ID |
|---|---|---|
| USDC | `0xe34c91815d7fc18A9e2148bcD4241d0a5848b693` (USDC.e) | — |
| BGB  | `0x389C08Bc23A7317000a1FD76c7c5B0cb0b4640b5` | 4 |
| USDT0 | `0xe7cd86e13AC4309349F30B3435a9d337750fC82D` | — |

### Why it matters (vs ERC-4337 paymasters)

- **Native protocol support** — implemented at the sequencer, not as a smart-contract wrapper. Lower gas overhead, higher reliability than relayer-based paymasters.
- **Zero-ETH operation** — an agent funded with only USDC can operate indefinitely. Critical for autonomous systems that can't manage a separate fee currency.
- **Real-time oracle pricing** — gas is converted at live rates, transparently.
- **Composable with all Rails services** — x402 settlements, DEX swaps, plain transfers all benefit.

### Competitive note vs Base

On Base, agents must acquire and manage ETH for gas. On Morph, USDC-only agents work natively. This is the single biggest operational simplification Morph offers vs other L2s for agentic workloads.

### Where to read the spec

Full AltFeeTx technical spec (signing procedure, sequencer protocol changes, EVM behavior): https://docs.morph.network/docs/about-morph/altfeetx. Most application code never needs the low-level details — use the Morph SDK or `morph-altfee` skill.

## Reference Key — merchant reconciliation

**Status: launches with mainnet GA in April 2026.** Not yet available on Hoodi.

The problem: on-chain tx hashes are opaque. Merchants can't easily map "did order #ORD-2026-03-17-001 get paid?" to an on-chain record.

The solution: attach a merchant-defined Reference Key to the transaction's calldata/event logs at settlement. Query Morph Rails API by Reference Key to retrieve `{ txHash, blockNumber, timestamp, amount, from, to, gasCost, status }`.

### Use cases

- **Settlement reconciliation** — auto-match on-chain receipts to internal orders; export CSV for accounting.
- **Dispute resolution** — pull the immutable on-chain record tied to the Reference Key as proof.
- **Audit trail** — compliance-grade tamper-proof linkage between business identifiers and on-chain settlement.
- **Multi-payment orders** — partial payments and refunds for one order grouped under one key.

### Properties

- **Merchant-defined namespace** — no collision across merchants.
- **Immutable** — once attached, the link is permanent and on-chain-verifiable.
- **Queryable** — full CRUD API for management and lookup.

## Morph Skill Hub — agentic service discovery

Modular packages that teach an AI agent specific Morph operations. Think "MCP tool" but with on-chain awareness — discoverable, installable, executable by autonomous agents without human guidance.

Core skills as of mainnet GA:

| Skill | What it does |
|---|---|
| `morph-wallet` | Create wallets, check balances, transfer tokens |
| `morph-swap` | DEX trading via BulbaSwap (swap, liquidity, price queries) |
| `morph-bridge` | Cross-chain asset bridging |
| `morph-altfee` | Wrap a tx with AltFee gas-in-token semantics |
| `morph-explorer` | On-chain data queries (tx, blocks, tokens) |

Repo: https://github.com/morph-l2/morph-skill.

### Why skills, not SDKs?

SDKs assume a human reads docs, writes code, and debugs errors. Agents need machine-readable structured contracts with clear input/output. Skills are self-contained packages an agent can discover, install, and execute zero-shot.

## Integration workflow (merchant payment scenario)

1. Customer initiates USDC payment in your app.
2. Your app passes the request through Morph Rails (SDK/API/MCP).
3. Rails runs security validation (AML screening, risk scoring).
4. AltFee converts the gas leg to USDC — user pays everything in stablecoins.
5. Transaction submitted to Morph with optional Reference Key attached.
6. On-chain settlement; merchant receives funds directly (non-custodial — Rails never touches the money).
7. Merchant queries history by Reference Key for reconciliation.

## Integration workflow (AI agent payment scenario)

1. Agent discovers a paid API endpoint through Morph Skill Hub.
2. Agent issues HTTP request; server returns `402 Payment Required`.
3. The Morph x402 facilitator constructs and signs the payment transaction (see `references/x402-facilitator.md`).
4. AltFee handles gas payment in USDC — agent never needs ETH.
5. Settlement happens on-chain; the API returns the requested data on the retry.
6. End-to-end programmatic, no human in the loop.

## When to use which Rails component

| Scenario | Component |
|---|---|
| API selling timed/per-call access to agents | x402 Facilitator + Skill Hub |
| E-commerce checkout for USDC payments | Reference Key + AltFee (post-Apr-2026 for Reference Key) |
| Agents that must run with only stablecoins | AltFee |
| Auditing payment flows for compliance | Reference Key |
| Letting an agent discover your service | Skill Hub |
