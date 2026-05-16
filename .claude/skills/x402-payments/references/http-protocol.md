# HTTP Protocol

The x402 V2 wire protocol layered on top of HTTP.

## The three headers

All values are Base64-encoded JSON. The receiving side must base64-decode before
JSON-parsing.

| Header              | Direction       | Status            | Body it carries           |
|---------------------|-----------------|-------------------|---------------------------|
| `PAYMENT-REQUIRED`  | server → client | 402               | `PaymentRequired` object  |
| `PAYMENT-SIGNATURE` | client → server | (retry, any verb) | `PaymentPayload` object   |
| `PAYMENT-RESPONSE`  | server → client | 200 OR 402        | `SettlementResponse` obj  |

`PAYMENT-RESPONSE` is returned on both successful settlement (200) and
failed settlement (402 with error details). Always check it when present.

## Worked exchange

```
# Round 1 — client probes
GET /weather HTTP/1.1
Host: api.example.com

# Server replies with a 402 + machine-readable offer
HTTP/1.1 402 Payment Required
Content-Type: application/json
PAYMENT-REQUIRED: eyJ4NDAyVmVyc2lvbiI6Miwi...  # base64(JSON)

{
  "x402Version": 2,
  "error": "PAYMENT-SIGNATURE header is required",
  "resource": {
    "url": "https://api.example.com/weather",
    "description": "Weather data",
    "mimeType": "application/json"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:84532",
      "amount": "1000",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "payTo": "0xYourEvmAddress",
      "maxTimeoutSeconds": 60,
      "extra": { "name": "USDC", "version": "2" }
    }
  ]
}

# Round 2 — client signs and retries
GET /weather HTTP/1.1
Host: api.example.com
PAYMENT-SIGNATURE: eyJzY2hlbWUiOiJleGFjdCIsIm5l...  # base64(signed PaymentPayload)

# Server verifies (locally or via facilitator), settles, and serves
HTTP/1.1 200 OK
Content-Type: application/json
PAYMENT-RESPONSE: eyJzdWNjZXNzIjp0cnVlLCJ0cmFu...  # base64(SettlementResponse)

{"weather": "sunny", "temperature": 70}
```

## PaymentRequired (the offer in the 402 body and header)

```jsonc
{
  "x402Version": 2,
  "error": "PAYMENT-SIGNATURE header is required",  // when retrying with payment
  "resource": {
    "url": "https://api.example.com/weather",
    "description": "Weather data",
    "mimeType": "application/json"
  },
  "accepts": [
    {
      "scheme": "exact",                             // "exact" | "upto" | "batch-settlement"
      "network": "eip155:84532",                     // CAIP-2 identifier
      "amount": "1000",                              // atomic units (e.g. 1000 = $0.001 USDC@6dp)
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",  // token contract / mint
      "payTo": "0xYourEvmAddress",                   // recipient address
      "maxTimeoutSeconds": 60,                       // how long the offer is valid
      "extra": {                                     // scheme/network-specific extras
        "name": "USDC",                              // EIP-712 token name (EVM)
        "version": "2"                               // EIP-712 token version
      }
    },
    {
      "scheme": "exact",
      "network": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
      "amount": "1000",
      "asset": "So11111111111111111111111111111111111111112",
      "payTo": "YourSolanaAddress",
      "maxTimeoutSeconds": 60,
      "extra": { "feePayer": "EwWqGE4ZFKLofuestmU4LDdK7XM1N4ALgdZccwYugwGd" }
    }
  ],
  "extensions": {            // optional, only present when extensions are declared
    "offer-receipt": { /* ... */ },
    "bazaar": { /* ... */ }
  }
}
```

The `accepts` array is a menu — the client picks the first entry whose
`(scheme, network)` pair matches a registered scheme implementation in its
`x402Client`. Use this to advertise the same resource on multiple chains or
multiple schemes.

For `upto`, `amount` is the **maximum** the buyer authorizes; the actual settled
amount is determined by `setSettlementOverrides` in the seller's handler.

For `batch-settlement`, `amount` is the per-request ceiling within a reusable
escrow channel.

## PaymentPayload (signed body in PAYMENT-SIGNATURE)

```jsonc
{
  "x402Version": 2,
  "scheme": "exact",
  "network": "eip155:84532",
  "payload": {
    // Scheme + network specific. For exact/EVM/EIP-3009:
    "signature": "0xabc...",
    "authorization": {
      "from": "0xBuyerAddress",
      "to": "0xYourEvmAddress",
      "value": "1000",
      "validAfter": "0",
      "validBefore": "1731436800",
      "nonce": "0x123..."
    }
  }
}
```

The shape of `payload` varies by scheme + network. See the relevant scheme spec
on GitHub for exact-EVM, exact-SVM, upto-EVM, batch-settlement-EVM, etc.

## SettlementResponse (receipt in PAYMENT-RESPONSE)

On success:

```jsonc
{
  "success": true,
  "transaction": "0xtxhash...",        // onchain tx ref
  "network": "eip155:84532",
  "amount": "1000",                    // actual settled atomic units
  "asset": "0x036CbD...",
  "payer": "0xBuyerAddress",
  "settledAt": "2026-01-15T12:34:56Z",
  "facilitatorMode": "remote"          // or "local"
}
```

On failure:

```jsonc
{
  "success": false,
  "error": "verification_failed" | "duplicate_settlement" | "insufficient_funds" | ...,
  "errorMessage": "Payment authorization expired",
  "network": "eip155:84532"
}
```

The server returns the failure response with a `402` status; success returns
with a `200` (or whatever the resource handler chose).

## Whether settlement is synchronous

| Scheme              | Onchain at request time?                         |
|---------------------|--------------------------------------------------|
| `exact`             | Yes — single transfer in the same HTTP round trip |
| `upto`              | Yes — single transfer at the override amount      |
| `batch-settlement`  | No — authorization confirmed, redeemed in batches later |

For `batch-settlement`, the `PAYMENT-RESPONSE` still confirms the authorization
(success/fail), but `transaction` may be empty until the batch is redeemed.

## V1 vs V2 headers

| V1                    | V2                       |
|-----------------------|--------------------------|
| `X-PAYMENT`           | `PAYMENT-SIGNATURE`      |
| `X-PAYMENT-RESPONSE`  | `PAYMENT-RESPONSE`       |
| (no equivalent)       | `PAYMENT-REQUIRED`       |
| `x402Version: 1`      | `x402Version: 2`         |
| `"base-sepolia"`      | `"eip155:84532"` (CAIP-2)|

V2 facilitators accept V1 clients during migration. New code should use V2.

## When implementing manually

If you must implement the protocol without the SDK (rare), the steps are:

**Server side:**
1. On an unauthorized request, encode the `PaymentRequired` object as JSON,
   then base64 the JSON string, set it as the `PAYMENT-REQUIRED` response
   header, and return HTTP 402 with the JSON body as well.
2. On a request with `PAYMENT-SIGNATURE`, base64-decode and JSON-parse it.
3. POST the parsed `PaymentPayload` and the matching `PaymentRequirements` to
   the facilitator's `/verify` endpoint. Reject with a fresh 402 if it fails.
4. Run the resource handler.
5. POST the same payload to the facilitator's `/settle` endpoint. On success,
   base64-encode the `SettlementResponse` and set it as `PAYMENT-RESPONSE` on
   the 200; on failure, set it on a fresh 402.

**Client side:**
1. GET the resource. If 402, read `PAYMENT-REQUIRED`, base64-decode, JSON-parse.
2. Pick an `accepts` entry whose `(scheme, network)` you can sign for.
3. Construct and sign the scheme-specific `PaymentPayload` (e.g.,
   `transferWithAuthorization` for exact/EVM/eip3009).
4. Re-GET the resource with `PAYMENT-SIGNATURE: <base64(JSON(payload))>`.
5. On the response, decode `PAYMENT-RESPONSE` for the receipt.

The SDKs (`@x402/express`, `@x402/fetch`, the Go module, the Python package)
handle every step of this — only reach for the raw protocol when integrating
with non-supported HTTP frameworks or building a custom client transport.
