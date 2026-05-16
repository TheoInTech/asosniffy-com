# Phase 01: Payment Adapter

> **Pricing context**: The amounts, breakdown structure, and pricing rationale used in this phase come from [`business-model.md` §2](./business-model.md#2-pricing-strategy) and `PLAN.md` §24.2. Read those before changing any defaults.

## Goal

Implement the Morph x402 payment adapter inside `scraper/`: validate Morph's official facilitator supports Hoodi, build the HMAC-signed verify/settle client, generate the machine-readable payment requirements for the 402 response, and assemble the receipt block for paid responses.

## Status & Dependencies

- **Status**: done
- **Depends on**: Phase 00 (specifically: `@sniffy/scraper` schemas — the `DiagnoseUnpaidResponse` and `receipt` shape are encoded there)
- **Blocks**: Phase 02 (`/diagnose` route needs payment requirements + receipt assembly); Phase 07 (deployment needs the facilitator HMAC creds in Railway env)
- **Can run in parallel with**: Phases 03 (data providers), 05 (frontend), 06 (distribution kit — SDK can use the typed `PaymentRequiredError` already in 00.p4)

## Sequential Tasks

### 01.s1 — Verify Morph facilitator supports Hoodi (research task)

This is **`PLAN.md` §21 open question #1** as a deliverable. Until it resolves, no token-path code is wired.

- **Recommended agent**: `morph-x402-engineer` (skills: `x402-payments`, `morph-network`, `firecrawl-search`)
- **Scope**: research only — produces a markdown note, no code
- **Inputs**:
  - `PLAN.md` §12 (Payment Requirements)
  - `PLAN.md` §21 open questions
  - Live `GET https://morph-rails.morph.network/x402/v2/supported`
  - Morph docs (use Firecrawl / WebFetch / Context7 as needed)
- **Deliverables**:
  - `scraper/docs/morph-facilitator-research.md` (or similar) covering:
    - Live response from `/v2/supported` (paste verbatim + timestamp)
    - Whether `eip155:2910` (Hoodi) is listed
    - If yes: the token asset address, decimals, EIP-712 `name`, EIP-712 `version`, and which payment scheme is used (EIP-3009 `transferWithAuthorization`, Permit2, or Morph-specific exact transfer)
    - If no: the recommended fallback (request access from Morph, or use the Morph self-hosted facilitator path from `PLAN.md` §12)
    - HMAC header format: which headers Morph expects, the signing canonicalization (recursively-sorted-keys JSON per `morph-network` skill), and an example signed request
  - `.env.example` at repo root carries `MORPH_X402_ACCESS_KEY`, `MORPH_X402_SECRET_KEY`, `MORPH_X402_FACILITATOR_MODE` (`live` | `fixture`), `SNIFFY_PAYMENT_ASSET_ADDRESS`, `SNIFFY_PAYMENT_ASSET_DECIMALS`, `SNIFFY_PAYMENT_ASSET_EIP712_NAME`, `SNIFFY_PAYMENT_ASSET_EIP712_VERSION`. (`MORPH_FACILITATOR_URL` and `MORPH_NETWORK` already land in Phase 00.)
- **Acceptance**:
  - The research doc unambiguously answers: token asset, decimals, EIP-712 fields, payment scheme. Subsequent tasks in this phase can wire to it without further investigation.
- **Live-state caveat**: as of 2026-05-16 the `morph-network` skill notes `GET /v2/supported` advertises **only mainnet `eip155:2818`** — Hoodi is not listed. Morph's official Go example settles against Hoodi using token `0xEcF966Cc754BC411E1F1106fbb4e343b835E85E4` (`HoodiTestToken`, 18 decimals, EIP-712 `name=HoodiTestToken`, `version=1.0`). The research task re-curls and documents current state; if Hoodi is still not advertised, proceed against Hoodi using the Go example values (canonical) and flag the listing gap.
- **Out of scope**: do not start coding the HMAC client until this lands; do not pick a fallback unless `/v2/supported` confirms Hoodi is missing
- **References**: `PLAN.md` §12, §21; `morph-network` skill

## Parallelizable Tasks

Run only after 01.s1 completes. Each task is independent.

### 01.p1 — HMAC-signed facilitator client (verify + settle + supported)

- **Recommended agent**: `morph-x402-engineer` (skills: `x402-payments`, `morph-network`, `api-security-best-practices`)
- **Scope**: `scraper/src/payment/facilitator/`
- **Inputs**:
  - `scraper/docs/morph-facilitator-research.md` from 01.s1
  - `PLAN.md` §12 (Payment Requirements — facilitator routes, HMAC requirement)
- **Deliverables**:
  - `scraper/src/payment/facilitator/client.ts` — `createFacilitatorClient({ accessKey, secretKey, baseUrl })` exporting:
    - `getSupported(): Promise<SupportedResponse>` → `GET /v2/supported`
    - `verify(payload: VerifyRequest): Promise<VerifyResponse>` → `POST /v2/verify`
    - `settle(payload: SettleRequest): Promise<SettleResponse>` → `POST /v2/settle`
  - `scraper/src/payment/facilitator/hmac.ts` — HMAC-SHA256 signer that:
    - Builds a sign map containing `MORPH-ACCESS-KEY`, `MORPH-ACCESS-TIMESTAMP` (milliseconds as string), `MORPH-ACCESS-METHOD` (uppercase), `MORPH-ACCESS-PATH` (full path including `/x402` prefix, no query string), and `MORPH-ACCESS-BODY` (parsed JSON; omit the field entirely when there is no body). Query-param keys are flattened into the sign map as `string[]` values.
    - Recursively sorts the sign map keys lexicographically, compact-stringifies with `JSON.stringify`, computes HMAC-SHA256 with the secret key, Base64-encodes the digest.
    - Attaches `MORPH-ACCESS-KEY`, `MORPH-ACCESS-TIMESTAMP`, `MORPH-ACCESS-SIGN` as request headers.
    - Mirrors the TS reference at `.claude/skills/morph-network/references/x402-facilitator.md` lines 66–136.
  - `scraper/src/payment/facilitator/types.ts` — Zod-validated request/response shapes for verify/settle (do **not** redefine the `DiagnosePaidResponse` receipt — that's in `@sniffy/scraper` schemas)
  - `scraper/tests/payment/facilitator.test.ts`:
    - Unit test: HMAC signature matches a known input/output pair (use the Morph docs example if provided in research)
    - Unit test: sorted-keys JSON is deterministic across input orderings
    - Integration test: `getSupported()` against the real facilitator returns Hoodi if 01.s1 confirmed it (gated behind `RUN_LIVE_TESTS=1`)
- **Acceptance**:
  - `pnpm --filter @sniffy/scraper test -- facilitator` passes
  - `RUN_LIVE_TESTS=1 pnpm --filter @sniffy/scraper test -- facilitator.live` returns a non-empty supported network list
- **Out of scope**: do not call this client from any route yet (Phase 02 wires it into `/diagnose`); do not log the secret key
- **References**: `PLAN.md` §12; `x402-payments` skill, `morph-network` skill

### 01.p2 — Payment requirements builder (the 402 body)

- **Recommended agent**: `morph-x402-engineer` (skills: `x402-payments`)
- **Scope**: `scraper/src/payment/requirements.ts`
- **Inputs**:
  - `@sniffy/scraper` schemas (`DiagnoseUnpaidResponse` from `schemas/diagnose.ts`)
  - `scraper/docs/morph-facilitator-research.md`
  - `PLAN.md` §9 (unpaid response example), §12 (network, asset, payTo)
  - `business-model.md` §2.1 (pricing breakdown)
- **Deliverables**:
  - `buildPaymentRequirements({ sniffId, pricing, resourceUrl })` → `DiagnoseUnpaidResponse` with the **dual-shape** body: a §9-compatible `payment` object AND a canonical x402 v2 `accepts[]` array. Both reference the same Hoodi requirement.
    - `x402Version: 2` (both top-level and inside `payment`)
    - `scheme: 'exact'` (Hoodi advertises `exact` only)
    - `network: 'eip155:2910'` (configurable via `MORPH_NETWORK` for mainnet later)
    - `facilitator: 'https://morph-rails.morph.network/x402'` (from `MORPH_FACILITATOR_URL`)
    - `amount`: decimal display (e.g. `"0.05"`), derived from `pricing.estimatedTotal`
    - `atomicAmount`: integer wei units, derived as `parseUnits(amount, decimals)` using viem
    - `decimals`: from `SNIFFY_PAYMENT_ASSET_DECIMALS` (18 for HoodiTestToken)
    - `asset`: HoodiTestToken `0xEcF966Cc754BC411E1F1106fbb4e343b835E85E4` on Hoodi (env-driven; mainnet TBD)
    - `payTo`: merchant wallet from env (`SNIFFY_MERCHANT_ADDRESS`)
    - `maxTimeoutSeconds`: default `60`
    - `extra`: `{ name, version }` for EIP-712 domain — `HoodiTestToken` / `1.0` on Hoodi
    - `accepts[0]` mirrors `payment` but with `amount` in atomic units only (canonical x402 v2 shape)
  - `scraper/src/payment/pricing.ts` — `computePricing({ keywords, countries, competitorDepth })` returning the `pricing` block from `PLAN.md` §9 with `breakdown[]` items matching `business-model.md` §2.1 numbers
  - Unit tests for both, including a dual-shape consistency check: `accepts[0].amount === payment.atomicAmount`
- **Acceptance**:
  - `buildPaymentRequirements()` output parses as `DiagnoseUnpaidResponse` schema (dual-shape: both `payment` and `accepts[]`)
  - `computePricing({ keywords: ['a', 'b'] })` returns `estimatedTotal: '0.05'` with two breakdown items totaling correctly
  - `accepts[0].amount === payment.atomicAmount` (dual-shape stays in sync)
- **Out of scope**: do not wire this into a route (Phase 02); do not handle mainnet pricing yet (post-MVP)
- **References**: `PLAN.md` §9, §12; `business-model.md` §2.1

### 01.p3 — Receipt assembler (the paid response receipt block)

- **Recommended agent**: `morph-x402-engineer` (skills: `x402-payments`)
- **Scope**: `scraper/src/payment/receipt.ts`
- **Inputs**:
  - `@sniffy/scraper` schemas (`receipt` field from `DiagnosePaidResponse`)
  - `01.p1` facilitator `SettleResponse` shape
  - `PLAN.md` §9 (paid response example), §12 (receipt metadata required fields)
- **Deliverables**:
  - `assembleReceipt({ settleResponse, sniffId, requestId, pricing })` → the `receipt` object from `PLAN.md` §9:
    - `network`, `facilitator: 'morph-official' | 'fixture-receipt' | 'self-hosted-fallback'`, `amount`, `asset`, `transactionHash`, `settledAt`
  - Helper `formatExplorerLink(txHash, network)` returning `https://explorer-hoodi.morph.network/tx/0x...` (or mainnet equivalent)
  - Unit tests including a fixture-mode receipt (when `MORPH_FACILITATOR_MODE=fixture`) so `/sample` can carry a clearly-labeled fake receipt
- **Acceptance**:
  - `assembleReceipt({ settleResponse: <mockSuccess>, ... })` matches the example receipt in `PLAN.md` §9
  - `formatExplorerLink('0xabc', 'eip155:2910')` returns the Hoodi explorer URL
- **Out of scope**: do not parse the incoming `PAYMENT-SIGNATURE` header yet (Phase 02 does that); do not implement settlement retry logic in this task (keep it pure formatting)
- **References**: `PLAN.md` §9, §12

### 01.p4 — Payment header parser

- **Recommended agent**: `morph-x402-engineer` (skills: `x402-payments`)
- **Scope**: `scraper/src/payment/header.ts`
- **Inputs**:
  - `PLAN.md` §12 (x402 v2 protocol)
  - `x402-payments` skill (PAYMENT-SIGNATURE header format)
- **Deliverables**:
  - `parsePaymentHeader(raw: string | undefined, expectedNetwork: CAIP2): ParsedPayment | null` — parses the `PAYMENT-SIGNATURE` header (x402 v2 format: header value is `base64(JSON(PaymentPayload))`). Base64-decodes → JSON.parses → Zod-validates the `PaymentPayload` v2 shape (`x402Version: 2`, `scheme`, `network`, `payload: { signature, authorization: { from, to, value, validAfter, validBefore, nonce } }`). Returns `null` for missing/empty header; throws typed errors otherwise.
  - Specific error types: `MalformedHeaderError` (base64 / JSON / schema fail), `WrongNetworkError` (network ≠ `expectedNetwork`), `ExpiredAuthorizationError` (`validBefore < now`).
  - Unit tests covering each failure mode
- **Acceptance**:
  - `parsePaymentHeader('')` → `null`
  - `parsePaymentHeader(<valid v2 header>)` → parsed payload
  - `parsePaymentHeader(<wrong-network header>)` → throws `WrongNetworkError`
- **Out of scope**: do not call the facilitator from this module (Phase 02 orchestrates `parse → verify → run-report → settle`)
- **References**: `PLAN.md` §12; `x402-payments` skill

## Phase Verification

```bash
# Research deliverable exists and is non-empty
test -s scraper/docs/morph-facilitator-research.md

# Payment adapter tests pass
pnpm --filter @sniffy/scraper test -- payment

# HMAC + sorted-keys JSON are deterministic
pnpm --filter @sniffy/scraper test -- facilitator.hmac

# Live supported check works (optional, requires Morph access key)
RUN_LIVE_TESTS=1 pnpm --filter @sniffy/scraper test -- facilitator.live

# Schema round-trip: builder output matches DiagnoseUnpaidResponse schema
pnpm --filter @sniffy/scraper test -- payment.requirements
```

Manual smoke (if access keys are provisioned):

```bash
# /v2/supported is unauthenticated — no HMAC needed.
curl -sS https://morph-rails.morph.network/x402/v2/supported | jq .
# Should return { "kinds": [...], "signers": {...} }. As of 2026-05-16 only eip155:2818 is advertised.

# /v2/verify and /v2/settle require HMAC. Headers:
#   MORPH-ACCESS-KEY:       $MORPH_X402_ACCESS_KEY
#   MORPH-ACCESS-TIMESTAMP: <Date.now() in ms, as string>
#   MORPH-ACCESS-SIGN:      base64(HMAC-SHA256(secret, JSON.stringify(sortObject(signMap))))
# See .claude/skills/morph-network/references/x402-facilitator.md for the canonical sign-map shape.
```

## References

- `PLAN.md` §9 — API Requirements (unpaid + paid response shapes)
- `PLAN.md` §12 — Payment Requirements (facilitator, network, receipt)
- `PLAN.md` §21 — Open questions (Hoodi support, token EIP-712 fields)
- `PLAN.md` §24.2 — Pricing strategy
- `business-model.md` §2.1 — Hackathon pricing table
- `CLAUDE.md` "Load-Bearing Constraints"
- Skills: `x402-payments`, `morph-network`, `api-security-best-practices`
- Next phase: [`02-core-api.md`](./02-core-api.md)
