# Morph x402 Facilitator — Research Deliverable (Phase 01.s1)

This note resolves the four `PLAN.md` §21 open questions blocking the payment adapter. It is the canonical input for the rest of Phase 01.

- **Captured at**: `2026-05-16T17:06:57Z`
- **Facilitator base URL**: `https://morph-rails.morph.network/x402`
- **Endpoint probed**: `GET /x402/v2/supported` (unauthenticated)

## 1. Live `/v2/supported` response

```bash
curl -sS https://morph-rails.morph.network/x402/v2/supported | jq .
```

```json
{
  "kinds": [
    {
      "x402Version": 2,
      "scheme": "exact",
      "network": "eip155:2818"
    }
  ],
  "extensions": [],
  "signers": {
    "eip155:*": [
      "0xb22C2E02997B10bc481907f05475C90047e84697",
      "0x5825a15d9bc768454C15531dc3EB1bd09A3664DC",
      "0x09168cc8a16A34e960D2843042490303D8cF5e7f"
    ]
  }
}
```

The response is HTTP 200 and unsigned (no HMAC required for this endpoint per Morph's spec).

## 2. Answers to `PLAN.md` §21 open questions

### Q1. Does the official Morph facilitator currently expose Hoodi through `/v2/supported`?

**No.** As of `2026-05-16T17:06:57Z`, `/v2/supported` advertises **only Mainnet (`eip155:2818`)**. Hoodi (`eip155:2910`) is not in the `kinds` array. This matches the state captured in the `morph-network` skill (last verified 2026-05-16).

Despite the listing gap, **Hoodi is reachable in practice**: Morph's own official Go integration example settles against Hoodi `chainID 2910` using `0xEcF966Cc754BC411E1F1106fbb4e343b835E85E4` (`HoodiTestToken`). The `/supported` discovery endpoint and the actual `/verify`+`/settle` accepted-network set diverge for now. We treat this as a Morph-side listing oversight rather than a Hoodi outage and proceed against Hoodi using the values below.

We re-confirm the listing with a live curl in 01.p1's integration test (gated by `RUN_LIVE_TESTS=1`) so a future run that surfaces Hoodi auto-validates against schema.

### Q2. Which Hoodi payment token, and what are its EIP-712 fields?

Using the values from Morph's official Go example (the only Morph-authored Hoodi settlement reference in the docs):

| Field | Value |
|---|---|
| Token contract address | `0xEcF966Cc754BC411E1F1106fbb4e343b835E85E4` |
| Symbol (label) | `HoodiTestToken` |
| Decimals | `18` |
| EIP-712 `domain.name` | `HoodiTestToken` |
| EIP-712 `domain.version` | `1.0` |
| EIP-712 `domain.chainId` | `2910` |
| EIP-712 `domain.verifyingContract` | `0xEcF966Cc754BC411E1F1106fbb4e343b835E85E4` |

Note: HoodiTestToken is **18 decimals**, not 6 like USDC. The atomic amount for a `$0.05`-equivalent demo settles as `parseUnits("0.05", 18) === 50000000000000000n`.

### Q3. Payment scheme

`exact`. This is the only scheme `/v2/supported` advertises today, and the only scheme the EIP-3009 / `transferWithAuthorization` flow exposed by `HoodiTestToken` supports. `upto` and `batch-settlement` are out of scope for the MVP.

### Q4. Fallback if Hoodi is unavailable

The research conclusion is: **proceed against Hoodi using HoodiTestToken regardless of the `/v2/supported` listing gap.** Morph's docs show this path is the canonical Hoodi settlement target.

If a future `/verify` or `/settle` call against Hoodi returns `invalidReason: "unsupported network"`, the fallback ladder is:

1. **Coordinate with Morph** (Discord `#dev-support`) to confirm Hoodi enablement state.
2. **Fixture-receipt mode** (`MORPH_X402_FACILITATOR_MODE=fixture`) — short-circuit settlement, return a clearly-labeled fake receipt. Used for `/sample` and for local dev without Morph credentials.
3. **Mainnet (`eip155:2818`)** — fall forward to Morph mainnet with a real (cheap, `~$0.01`) USDC settlement, per `PLAN.md` §6 optional mainnet demo. Same code path; only the env vars change.

We do **not** fork or self-host a facilitator. The `self-hosted-fallback` value in `FacilitatorMode` is reserved for a hypothetical Morph-blocked-judging scenario and is not wired in this phase.

## 3. HMAC signing requirements

The Morph facilitator is request-and-response compatible with the Coinbase x402 SDK but adds mandatory HMAC-SHA256 request signing on `POST /v2/verify` and `POST /v2/settle`. `GET /v2/supported` is unauthenticated. Required headers on each signed request: `MORPH-ACCESS-KEY` (the public key), `MORPH-ACCESS-TIMESTAMP` (Unix milliseconds as a string, within ±30s of server clock), and `MORPH-ACCESS-SIGN` (Base64 HMAC-SHA256 over the canonicalized sign map).

The sign map carries the five fixed fields `MORPH-ACCESS-KEY`, `MORPH-ACCESS-TIMESTAMP`, `MORPH-ACCESS-METHOD` (uppercase HTTP verb), `MORPH-ACCESS-PATH` (full path including the `/x402` prefix; no query string), and `MORPH-ACCESS-BODY` (the parsed JSON body — **omit the field entirely** when there is no body; do not send `null` or `""`). Query parameters, if any, are flattened to the top of the map with `string[]` values. The map is then **recursively sorted lexicographically** (sort nested objects too, not just the top level), compact-stringified, HMAC-SHA256-signed with the secret key, and Base64-encoded. JavaScript's `JSON.stringify` preserves insertion order, so the sort step must be implemented explicitly (`sortObject` from `.claude/skills/morph-network/references/x402-facilitator.md` lines 76–84 is the canonical TS reference).

Rate limit: 10 QPS per Access Key. Excess returns HTTP 429 with `{"isValid":false,"invalidReason":"rate limit exceeded","success":false,"errorReason":"rate limit exceeded"}`.

## 4. Decision summary (canonical for the rest of Phase 01)

Proceed against Morph Hoodi (`eip155:2910`) using `HoodiTestToken` (`0xEcF966Cc754BC411E1F1106fbb4e343b835E85E4`, 18 decimals, EIP-712 name `HoodiTestToken`, version `1.0`), scheme `exact`, facilitator `https://morph-rails.morph.network/x402`, signed with HMAC-SHA256 per the algorithm above. The listing gap in `/v2/supported` is documented as Morph-side and re-checked on every live integration test.

## 5. References

- `PLAN.md` §12, §21
- `.claude/skills/morph-network/SKILL.md` (Network parameters; HMAC quirks)
- `.claude/skills/morph-network/references/x402-facilitator.md` (lines 32–135 for signing; lines 264–292 for the Hoodi token reference)
- `.claude/skills/x402-payments/references/http-protocol.md` (PaymentRequired / PaymentPayload / SettlementResponse v2 shapes)
