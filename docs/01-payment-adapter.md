# Phase 01: Payment Adapter

> **Pricing context**: The amounts, breakdown structure, and pricing rationale used in this phase come from [`business-model.md` §2](./business-model.md#2-pricing-strategy) and `PLAN.md` §24.2. Read those before changing any defaults.

## Goal

Implement the Morph x402 payment adapter inside `scraper/`: validate Morph's official facilitator supports Hoodi, build the HMAC-signed verify/settle client, generate the machine-readable payment requirements for the 402 response, and assemble the receipt block for paid responses.

## Status & Dependencies

- **Status**: not-started
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
    - HMAC header format: which headers Morph expects, the signing canonicalization (sorted-keys JSON per `morph-network` skill), and an example signed request
  - Updated `.env.example` at repo root with `MORPH_X402_ACCESS_KEY`, `MORPH_X402_SECRET_KEY`, `MORPH_X402_FACILITATOR_URL` (default `https://morph-rails.morph.network/x402`)
- **Acceptance**:
  - The research doc unambiguously answers: token asset, decimals, EIP-712 fields, payment scheme. Subsequent tasks in this phase can wire to it without further investigation.
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
    - Sorts JSON keys recursively (per Morph's canonicalization rule)
    - Computes the signature over `{method}{path}{timestamp}{sorted-body}`
    - Attaches the headers Morph expects (per the research doc)
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
  - `buildPaymentRequirements({ sniffId, pricing })` → `DiagnoseUnpaidResponse` with:
    - `x402Version: 2`
    - `network: 'eip155:2910'` (configurable via env for mainnet later)
    - `facilitator: 'https://morph-rails.morph.network/x402'`
    - `amount`: derived from `pricing.estimatedTotal` (USDC-equivalent on Hoodi)
    - `asset`: token contract address from research doc (env var, with the contract address as a default constant)
    - `payTo`: merchant wallet from env (`SNIFFY_PAYTO_ADDRESS`)
    - `scheme`: the payment scheme name from the research doc (`exact`, `permit2`, etc.)
  - `scraper/src/payment/pricing.ts` — `computePricing({ keywords, countries, competitorDepth })` returning the `pricing` block from `PLAN.md` §9 with `breakdown[]` items matching `business-model.md` §2.1 numbers
  - Unit tests for both
- **Acceptance**:
  - `buildPaymentRequirements()` output parses as `DiagnoseUnpaidResponse` schema
  - `computePricing({ keywords: ['a', 'b'] })` returns `estimatedTotal: '0.05'` with two breakdown items totaling correctly
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
  - `parsePaymentHeader(raw: string): ParsedPayment | null` — parses the `PAYMENT-SIGNATURE` header (x402 v2 format), validates network matches expected `eip155:2910`, returns typed payload or `null` for missing/malformed
  - Specific error types for: missing header, wrong network, malformed signature, expired authorization
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
curl -X GET https://morph-rails.morph.network/x402/v2/supported \
  -H "X-Morph-Access-Key: $MORPH_X402_ACCESS_KEY" \
  -H "X-Morph-Signature: $(node scraper/scripts/sign-supported.mjs)"
# Should return a JSON body listing networks including eip155:2910
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
