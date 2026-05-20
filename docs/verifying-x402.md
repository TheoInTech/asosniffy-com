# Verifying an x402 receipt

Every receipt the Sniffy API returns can be independently verified on-chain. This document walks through the five forensic checks that distinguish a real x402 settlement from a plain ERC-20 transfer being labeled as one. The canonical reference example throughout is a real Morph mainnet settlement: `0xdb32c34a6e90408f4bb1606038a04f192cd49e73af560eb7e1459aa09cede4e3`.

You should run these checks (manually or via the SDK's `verifyReceiptOnChain`) whenever:

- A judge, auditor, or skeptical user asks for proof that a Sniffy receipt represents a real on-chain payment.
- You suspect a service is *claiming* x402 compliance while actually executing plain ERC-20 transfers.
- You're integrating against a new facilitator and want to confirm its settlement path is genuine.

## What you need

| Input | Where it comes from |
|---|---|
| `receipt.network` (CAIP-2) | Receipt body, also Base64-JSON `PAYMENT-RESPONSE` header |
| `receipt.transactionHash` | Same |
| `receipt.asset` (token contract) | Same |
| Morph RPC URL | `https://rpc.morphl2.io` (mainnet) or `https://rpc-hoodi.morph.network` (Hoodi) |
| Facilitator base URL | `https://morph-rails.morph.network/x402` |

## Reference data — Morph mainnet (`eip155:2818`)

- **Facilitator settlement contract**: `0x154dd21f7386c4c49481c1fe568dad365cfc34e5`
- **EIP-3009 `AuthorizationUsed` event topic**: `0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5`
- **Bridged USDC**: `0xCfb1186F4e93D60E60a8bDd997427D1F33bc372B`
- **Advertised relayers** (subject to change — always fetch live): query `GET https://morph-rails.morph.network/x402/v2/supported`

The settlement contract address for Hoodi (`eip155:2910`) is not yet verified — see `morph-facilitator-hoodi-status.md` notes. Checks involving the settlement contract should be marked `skipped` for Hoodi until that is confirmed.

## Check 1 — Tx exists on the declared network

```bash
curl -s -X POST https://rpc.morphl2.io \
  -H 'content-type: application/json' \
  -d '{
    "jsonrpc":"2.0","id":1,
    "method":"eth_getTransactionByHash",
    "params":["0xdb32c34a6e90408f4bb1606038a04f192cd49e73af560eb7e1459aa09cede4e3"]
  }' | jq '.result | {chainId, from, to, blockNumber}'
```

Expected:

```json
{
  "chainId": "0xb02",
  "from": "0x5825a15d9bc768454c15531dc3eb1bd09a3664dc",
  "to": "0x154dd21f7386c4c49481c1fe568dad365cfc34e5",
  "blockNumber": "..."
}
```

`0xb02` = 2818 = Morph mainnet, matching the CAIP-2 in the receipt. If `result` is `null`, the tx does not exist — the receipt is fraudulent.

## Check 2 — Settlement contract matches the official facilitator

From check 1, `tx.to` is `0x154dd21f7386c4c49481c1fe568dad365cfc34e5` — the Morph facilitator settlement contract. If `tx.to` were the token contract directly (e.g., USDC at `0xCfb1...372B`), the relayer bypassed the facilitator's wrapper; this is not how x402 settles.

## Check 3 — Relayer is an officially advertised facilitator signer

```bash
curl -s https://morph-rails.morph.network/x402/v2/supported \
  | jq '.. | objects | select(.network == "eip155:2818") | .signers'
```

The output is a list of relayer addresses. `tx.from` (from check 1) must appear in this list (case-insensitive). For our reference tx, `tx.from = 0x5825a15d9bc768454c15531dc3eb1bd09a3664dc` is one of the three advertised signers.

A tx submitted by an unlisted address could be anyone — even with all other checks passing, the receipt has not been settled by the official Morph facilitator.

## Check 4 — EIP-3009 AuthorizationUsed event was emitted

```bash
curl -s -X POST https://rpc.morphl2.io \
  -H 'content-type: application/json' \
  -d '{
    "jsonrpc":"2.0","id":1,
    "method":"eth_getTransactionReceipt",
    "params":["0xdb32c34a6e90408f4bb1606038a04f192cd49e73af560eb7e1459aa09cede4e3"]
  }' | jq '.result.logs[] | select(.topics[0] == "0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5")'
```

Expected: a log entry whose `address` equals the receipt's `asset` (USDC `0xCfb1...372B` for our reference) and whose `topics[0]` matches the `AuthorizationUsed` topic exactly.

If this log is missing, the call path didn't use EIP-3009 `transferWithAuthorization`. Some other token call (`transfer`, `transferFrom`, a custom path) was used — that's not x402.

## Check 5 — Payer ≠ relayer (the meta-transaction pattern)

From the matching log in check 4:

```bash
curl -s -X POST https://rpc.morphl2.io ... \
  | jq -r '.result.logs[]
    | select(.topics[0] == "0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5")
    | .topics[1]'
# Output: 0x000000000000000000000000d259649c98b416e4d898c34a1c8206f676e06d40
```

`topics[1]` is the EIP-3009 `authorizer` (left-padded to 32 bytes). Drop the leading zeros to get the payer address. For our reference: `0xd259649c98b416e4d898c34a1c8206f676e06d40`.

The payer (off-chain signer) must be different from `tx.from` (the on-chain submitter). If they're the same, the user self-submitted — that's a regular ERC-20 transfer, not a meta-transaction, not x402.

## All five passing = genuine x402

A receipt passing all five checks is a real, facilitator-submitted, EIP-3009-settled x402 payment. The reference mainnet tx passes all five.

If checks 1 or 2 fail outright, the receipt is fraudulent. If 3, 4, or 5 fail, the underlying tx exists but isn't x402 — surface this clearly. If 2, 3, or any other check is `skipped` (e.g., Hoodi has no recorded settlement contract yet, or `/v2/supported` is temporarily unreachable), don't penalize the receipt — the protocol-level evidence from checks 4 and 5 alone is usually conclusive.

## Programmatic verification

The `@sniffy/sdk` package exports `verifyReceiptOnChain(receipt)`, returning a structured report of all five checks. The Sniffy demo UI runs the same function client-side and renders it as an `AuthenticityChecklist` panel. The agent surface (`SKILL.md`) carries a condensed version of this recipe so LLM consumers can verify receipts without copying implementation details.
