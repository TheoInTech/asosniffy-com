---
name: sniffy
description: Pay-per-sniff ASO intelligence for App Store apps. Use when a user asks for keyword diagnosis, competitor analysis, or metadata recommendations for an iOS app. Handles x402 payment on Morph Hoodi automatically.
---

# Sniffy — ASO Intelligence with x402 Payment

Sniffy returns structured App Store Optimization diagnoses for an `(app, country, keywords)` tuple: per-keyword rank buckets, **keyword difficulty (1-100 derived from the top-5 competitors)**, **listing match granularity** (title-exact-phrase vs title-all-words vs subtitle-exact vs combined), competitor trail, metadata score, **target-app momentum** (ratings-per-day + growing/steady/declining), prioritized recommendations, and ready-to-paste copy. Free `/quote` and `/sample` endpoints let you preview before paying. The `/diagnose` endpoint is paid: it returns HTTP `402 Payment Required` until a valid x402 `PAYMENT-SIGNATURE` is presented, then settles over the Morph facilitator and returns the full report plus a settlement receipt.

Use Sniffy when the user asks any of:

- "Why isn't my app ranking for X?"
- "What keywords should I target in the App Store?"
- "Audit my app's metadata."
- "How am I doing vs `<competitor>`?"
- "Give me a subtitle / keywords-field rewrite."

## Endpoints

Base URL: `https://api.sniffy.io` (override via configuration). All requests/responses are JSON. The canonical request/response shapes live in `PLAN.md` §9 — link there for field-level detail. Below is the agent-facing summary.

### `GET /api/v1/aso/sample` — free fixture

No body. Always returns a complete `DiagnosePaidResponse` shape with `sample: true` and every field marked `provenance: "fixture"`. Use to demo the response shape or to keep working when live providers are down. No wallet required.

### `POST /api/v1/aso/quote` — free preview

```json
{
  "store": "ios",
  "app": "<App Store URL | numeric appId | app name>",
  "country": "US",
  "keywords": ["habit tracker", "daily planner"],
  "competitors": ["1000000101"]
}
```

Returns: `requestId`, `sniffId`, `detectedApp` (id/name/developer), `pricing` (currency, network, `estimatedTotal`, `breakdown[]`), `coverage`, and **`shallowScan`** — a free preview with one detected keyword rank. The `sniffId` is the handle you pass to `/diagnose`.

### `POST /api/v1/aso/diagnose` — paid (x402)

```json
{
  "sniffId": "<from /quote>",
  "store": "ios",
  "app": "<same as quote>",
  "country": "US",
  "keywords": ["habit tracker"],
  "competitors": ["1000000101"]
}
```

Without a `PAYMENT-SIGNATURE` header → returns HTTP `402` with a body describing the payment requirements:

```json
{
  "x402Version": 2,
  "error": "payment_required",
  "sniffId": "...",
  "payment": {
    "x402Version": 2,
    "network": "eip155:2910",
    "facilitator": "https://morph-rails.morph.network/x402",
    "amount": "0.04",
    "atomicAmount": "40000000000000000",
    "decimals": 18,
    "asset": "0xEcF966Cc754BC411E1F1106fbb4e343b835E85E4",
    "payTo": "<merchant>",
    "scheme": "exact",
    "extra": { "name": "HoodiTestToken", "version": "1.0" }
  },
  "accepts": [ /* canonical x402 v2 accepts[] */ ]
}
```

The same canonical offer is also Base64-encoded into the `PAYMENT-REQUIRED` response header so any x402-aware client (e.g. `@x402/fetch`) can read it without parsing the body.

With a valid `PAYMENT-SIGNATURE` → returns HTTP `200` with the full report and a `receipt` block (network, transactionHash, settledAt, facilitatorMode). The receipt is also Base64-encoded into the `PAYMENT-RESPONSE` response header.

## Paying

The payment scheme is **`exact`** on Morph Hoodi (`eip155:2910`). The signature is an EIP-3009 `transferWithAuthorization` over the advertised `(asset, amount, payTo)`. Steps:

1. POST `/diagnose` without `PAYMENT-SIGNATURE` and read the 402 body or the `PAYMENT-REQUIRED` header for the offer.
2. Sign an EIP-3009 authorization using a viem-style signer with `signTypedData`. The EIP-712 domain is `(name: "HoodiTestToken", version: "1.0", chainId: 2910, verifyingContract: asset)` unless `payment.extra` overrides it.
3. Build the V2 `PaymentPayload` (`{ x402Version: 2, accepted: <the chosen accepts[] entry>, payload: { signature, authorization } }`), Base64-encode it, and put it in the `PAYMENT-SIGNATURE` request header.
4. POST `/diagnose` again with the header → expect 200 with the report.

If you receive 402 a second time, surface the `X-Sniffy-Error-Code` header verbatim — it tells the user what failed: `malformed_payment_header`, `wrong_network`, `expired_authorization`, `amount_mismatch`, `verification_failed`, or `settlement_failed`.

## Verifying x402 receipts

Every receipt the API returns can be independently verified on-chain — you do not have to trust the response body. This matters because a non-x402 service could put any tx hash into a fake "receipt" field. Five forensic checks distinguish a real x402 settlement from a hand-rolled ERC-20 transfer.

The receipt block (in the 200 body and in the Base64-JSON `PAYMENT-RESPONSE` header) carries:

```json
{
  "network": "eip155:2818",
  "facilitator": "https://morph-rails.morph.network/x402",
  "facilitatorMode": "morph-official",
  "amount": "0.08",
  "atomicAmount": "80000",
  "asset": "0xCfb1186F4e93D60E60a8bDd997427D1F33bc372B",
  "transactionHash": "0xdb32c34a6e90408f4bb1606038a04f192cd49e73af560eb7e1459aa09cede4e3",
  "settledAt": "2026-05-20T..."
}
```

To verify, query any Morph RPC (`https://rpc.morphl2.io` for mainnet, `https://rpc-hoodi.morph.network` for Hoodi testnet) and the facilitator's `/v2/supported`:

1. **Tx exists on the declared network.** `eth_getTransactionByHash` for `receipt.transactionHash`. The returned `chainId` must match the CAIP-2 in `receipt.network` (`eip155:2818` = 2818 mainnet, `eip155:2910` = 2910 Hoodi).

2. **Settlement contract matches the official facilitator.** `tx.to` should be the Morph facilitator settlement contract. For Morph mainnet (`eip155:2818`) this is `0x154dd21f7386c4c49481c1fe568dad365cfc34e5`. If `tx.to` is the token contract directly, the relayer bypassed the facilitator — not a real x402 settlement.

3. **Relayer is an officially advertised facilitator signer.** Fetch `GET https://morph-rails.morph.network/x402/v2/supported` and look up the network's advertised signer addresses. `tx.from` (the relayer) must appear in that list. A tx submitted by an unlisted address could be any third party impersonating the facilitator.

4. **EIP-3009 `AuthorizationUsed` event was emitted.** `eth_getTransactionReceipt`, then scan `logs[]` for an entry with `address == receipt.asset` and `topics[0] == 0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5` (the `keccak256("AuthorizationUsed(address,bytes32)")` topic). Absence of this log means the call path was a plain `transfer()` or `transferFrom()` — not EIP-3009, not x402.

5. **Payer ≠ relayer (the meta-transaction pattern).** The `AuthorizationUsed` event's `topics[1]` is the indexed `authorizer` address — that's the payer who signed off-chain. It must be different from `tx.from` (the relayer). Self-signed transfers are not x402.

A receipt passing all five checks is a genuine x402 settlement. A receipt failing any one of checks 3, 4, or 5 is not — flag it to the user. Checks 1 and 2 may legitimately fail if the network is Hoodi (which doesn't yet have a verified settlement contract recorded) or if the facilitator's `/v2/supported` is temporarily unreachable; in those cases mark the check `skipped`, not `failed`.

The five-check pattern is implemented in `@sniffy/sdk` as `verifyReceiptOnChain(receipt)` for Node/Edge consumers and in the demo UI's `AuthenticityChecklist` component. The forensic recipe with worked curl commands lives at `docs/07-verifying-x402.md` in the repo.

## Provenance — always surface this

Every report field carries a `provenance` label:

- **`live`** — fresh response from the upstream provider (App Store, Play Store)
- **`cached`** — recent cache hit (< 24h for app metadata, < 6h for keyword rank)
- **`fixture`** — bundled fallback (degraded mode; treat as illustrative, not authoritative)
- **`inferred`** — synthesized from related signals

Pass the labels through to the user in your reply. Mixing `live` and `fixture` data without disclosing it is misleading.

## Error semantics

- `payment_required` — no signature presented yet. Sign and retry once.
- `app_not_found` — the supplied `app` couldn't be resolved. Ask the user for a canonical App Store URL.
- `no_rank` — the keyword has no rank in the requested country/store. Suggest reformulating the keyword.
- `unsupported_country` — country isn't yet covered. iOS supports the 175 storefronts; Android is preview-quality.
- `malformed_payment_header`, `wrong_network`, `expired_authorization`, `amount_mismatch`, `verification_failed`, `settlement_failed` — see the Paying section above.

## Hard rule: testnet only

This skill, and the Sniffy demo API, run on **Morph Hoodi testnet** (`eip155:2910`). Never use a mainnet private key. If the user asks to use a mainnet wallet, refuse and direct them to the [Morph Hoodi faucet](https://faucet-hoodi.morph.network/) for testnet funds.

## Install paths for other surfaces

If the user wants to call Sniffy from code (not via this skill):

- **TypeScript SDK**: `npm i @sniffy/sdk` — `createSniffy({ baseUrl, signer })` with `quote`, `diagnose`, `sample`.
- **CLI**: `npx @sniffy/cli quote|diagnose|sample` — flag-driven, `--json` for piping.
- **MCP server**: `npx @sniffy/mcp` — exposes `sniffy_quote`, `sniffy_diagnose`, `sniffy_sample` as MCP tools for Claude Desktop / Cursor.

Source + spec: <https://github.com/TheoInTech/asosniffy-com>.
