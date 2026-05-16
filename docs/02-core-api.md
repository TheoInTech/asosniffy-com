# Phase 02: Core API

> **Pricing & funnel context**: The `pricing.breakdown` wire format and the `/quote` → `/diagnose` funnel intent come from [`business-model.md`](./business-model.md) and `PLAN.md` §24. Do not change the JSON shape without updating both.

## Goal

Stand up the Hono server in `scraper/` and implement the three public endpoints from `PLAN.md` §9: `POST /api/v1/aso/quote` (with `shallowScan`), `POST /api/v1/aso/diagnose` (real HTTP 402 → x402 → paid report), and `GET /api/v1/aso/sample` (always-works fixture endpoint).

## Status & Dependencies

- **Status**: not-started
- **Depends on**:
  - Phase 00 — `@sniffy/scraper` schemas (request/response Zod types)
  - Phase 00 — `scraper/fixtures/sample-report.json`, `scraper/fixtures/sample-quote.json`
  - Phase 01 — payment requirements builder (01.p2), receipt assembler (01.p3), header parser (01.p4) for the `/diagnose` flow
- **Blocks**: Phase 07 (deployment needs runnable server), Phase 08 (QA tests the HTTP surface)
- **Can run in parallel with**: Phases 03 (data providers — `/diagnose` calls them but routes can be wired against fixture data first), 04 (scoring/synthesis — same), 05 (frontend), 06 (distribution kit)

## Sequential Tasks

### 02.s1 — Hono app shell + middleware

- **Recommended agent**: `principal-backend-engineer` (skills: `senior-backend`, `hono`, `api-security-best-practices`)
- **Scope**: `scraper/src/index.ts`, `scraper/src/middleware/`
- **Inputs**:
  - `PLAN.md` §9, §10 (Tech Stack — Hono, Zod)
  - `CLAUDE.md` "API Contract" + "Load-Bearing Constraints"
- **Deliverables**:
  - `scraper/src/index.ts` — Hono app with:
    - CORS middleware (allow `landing/` deploy origin + `localhost` for dev)
    - Request-ID middleware (generate `req_<nanoid>`, attach to context, echo as `X-Request-ID` response header)
    - JSON body parser
    - Zod-validation middleware factory `validateBody(schema)`
    - Error-handling middleware that converts thrown errors to typed JSON responses (never leak stack traces)
    - Health endpoint `GET /health` returning `{ ok: true, version: <schema version>, network: <env> }`
    - Mount points for `/api/v1/aso/*` (handlers added in 02.p1–p3)
  - `scraper/src/middleware/logger.ts` — structured log lines (one JSON object per request) including `requestId`, `path`, `status`, `durationMs`. No payload bodies in logs.
  - `scraper/src/server.ts` — `@hono/node-server` boot file that reads `PORT` (default 3001) and starts the app
- **Acceptance**:
  - `pnpm --filter @sniffy/scraper dev` starts the server on `localhost:3001`
  - `curl localhost:3001/health` returns `{ ok: true, ... }`
  - A request with an invalid JSON body to any route returns HTTP 400 with a Zod-error-shaped response, **not** a 500 with a stack trace
- **Out of scope**: do not write route handlers in this task (those are the parallelizable tasks below)
- **References**: `PLAN.md` §9, §10; `hono` skill

## Parallelizable Tasks

Run after 02.s1 completes. Each task owns one endpoint and can be developed in parallel.

### 02.p1 — `GET /api/v1/aso/sample`

- **Recommended agent**: `principal-backend-engineer` (skills: `senior-backend`, `hono`)
- **Scope**: `scraper/src/routes/sample.ts`
- **Inputs**:
  - `@sniffy/scraper` `SampleResponse` schema
  - `scraper/fixtures/sample-report.json` from Phase 00
  - `PLAN.md` §9 (sample endpoint spec)
- **Deliverables**:
  - Handler that:
    - Reads the fixture from disk (or imports it at build time — prefer import for cold-start speed)
    - Adds `sample: true` flag
    - Validates against the `SampleResponse` schema before returning
    - Sets `Cache-Control: public, max-age=300`
  - Unit test that hits the route with `app.request('/api/v1/aso/sample')` and asserts shape
- **Acceptance**:
  - `curl localhost:3001/api/v1/aso/sample` returns the fixture report as JSON
  - The response includes `sample: true`, `dataProvenance` set to all-`fixture`, and a synthetic receipt
  - **The endpoint works even when Redis, Apple, and OpenAI are all unreachable** (this is a load-bearing CLAUDE.md constraint)
- **Out of scope**: do not parameterize the fixture (one sample is enough); do not require any env vars beyond what 02.s1 already needs
- **References**: `PLAN.md` §9

### 02.p2 — `POST /api/v1/aso/quote`

- **Recommended agent**: `principal-backend-engineer` (skills: `senior-backend`, `hono`)
- **Scope**: `scraper/src/routes/quote.ts`
- **Inputs**:
  - `@sniffy/scraper` schemas: `QuoteRequest`, `QuoteResponse`, `ShallowScan`
  - `scraper/src/payment/pricing.ts` from Phase 01 (`computePricing`)
  - `scraper/fixtures/sample-quote.json` for the dev path before Phase 03 lands
  - `PLAN.md` §8 (Quote functional requirements), §9 (quote spec), §11 (provenance)
- **Deliverables**:
  - Handler that:
    - Validates body against `QuoteRequest` (Zod 400 on failure)
    - Normalizes the app identifier (URL → App Store ID; app name → search → ID) — initially behind a `getDetectedApp()` interface that returns fixture data; Phase 03 implements the real version
    - Validates `keywords.length` between 1 and 5 (Zod schema enforces, but include a clear error message)
    - Calls `computePricing(...)` to assemble the `pricing.breakdown`
    - Calls `getShallowScan()` (interface; fixture-backed until Phase 03) to populate the `shallowScan` block — detected app identity, category, ratings, ONE preview keyword bucket
    - Generates `requestId` + `sniffId` (nanoid-based, prefixed)
    - Sets `coverage` from the data layer's availability hints (fixture-backed initially)
    - Validates the assembled response against `QuoteResponse` schema before returning
  - Unit tests covering: 1-keyword request, 5-keyword request, app URL input, app ID input, app name input (mocked detect), invalid country code (rejected)
- **Acceptance**:
  - `curl -X POST localhost:3001/api/v1/aso/quote -d '{"store":"ios","app":"https://apps.apple.com/us/app/example/id123456789","country":"US","keywords":["habit tracker"]}'` returns a valid `QuoteResponse`
  - The response **includes `shallowScan`** with detected app + ratings + one preview keyword bucket
  - The response does **not** include recommendations, full keyword diagnosis, competitor trail, metadata score, or ready-to-paste content (those are paid-only)
  - `pricing.breakdown` totals match `pricing.estimatedTotal`
- **Out of scope**: do not call live Apple APIs yet (Phase 03 swaps the fixture-backed `getDetectedApp` / `getShallowScan` for real implementations); do not synthesize recommendations into `shallowScan`
- **References**: `PLAN.md` §8, §9; `business-model.md` §2.1

### 02.p3 — `POST /api/v1/aso/diagnose` (real HTTP 402 → x402 → paid report)

This is the load-bearing endpoint. The track-fit verdict in `PLAN.md` §5A hinges on it returning a real 402.

- **Recommended agent**: `morph-x402-engineer` (skills: `x402-payments`, `hono`) — `morph-x402-engineer` for the payment-flow correctness, with `hono` skill loaded for the route plumbing
- **Scope**: `scraper/src/routes/diagnose.ts`, `scraper/src/orchestrator/`
- **Inputs**:
  - `@sniffy/scraper` schemas (`DiagnoseRequest`, `DiagnoseUnpaidResponse`, `DiagnosePaidResponse`)
  - `scraper/src/payment/*` from Phase 01 (header parser, requirements builder, facilitator client, receipt assembler)
  - `scraper/fixtures/sample-report.json` for the report payload until Phases 03 + 04 land
  - `PLAN.md` §8 (Diagnosis functional requirements), §9, §12
- **Deliverables**:
  - Handler implementing the flow:
    1. Validate body against `DiagnoseRequest`
    2. Read `PAYMENT-SIGNATURE` header. If absent → respond `402 Payment Required` with `buildPaymentRequirements(...)` body and `Content-Type: application/json`
    3. If present → `parsePaymentHeader(...)`. If parsing fails → 402 with the same body
    4. Call facilitator `verify(...)`. If invalid → 402 with the same body and an error code
    5. **Run the report** via the agent orchestrator (fixture-backed until Phases 03 + 04; abstracted behind `generateReport(input): Promise<ReportPayload>`)
    6. Call facilitator `settle(...)`. If settlement fails → 402 with retry guidance
    7. Assemble `receipt` via `assembleReceipt(...)`
    8. Return the full `DiagnosePaidResponse` with `receipt`, `dataProvenance`, and all the paid-only report sections
  - `scraper/src/orchestrator/index.ts` — `generateReport(input)` interface; initial implementation returns the sample fixture but echoes back the request's `app` / `keywords` so the response is shaped-real
  - Unit tests:
    - Missing payment header → 402 with valid `DiagnoseUnpaidResponse`
    - Malformed header → 402
    - Wrong network header → 402 with a clear error code
    - Valid header (mocked facilitator) → 200 with `DiagnosePaidResponse`, including a `receipt`
- **Acceptance**:
  - `curl -X POST localhost:3001/api/v1/aso/diagnose -d '{...valid request...}'` (no payment header) returns HTTP **402** (not 401, not 403, not 500) with a JSON body matching the `DiagnoseUnpaidResponse` schema
  - The 402 body includes `payment.x402Version`, `payment.network: 'eip155:2910'`, `payment.facilitator`, `payment.amount`, `payment.asset`, `payment.payTo`
  - With a valid (mocked) `PAYMENT-SIGNATURE`, the same curl returns HTTP **200** with a full report including the `receipt` block
- **Out of scope**: do not implement live data fetching or scoring here (Phases 03 + 04); do not require a real Hoodi wallet for the unit tests (mock the facilitator)
- **References**: `PLAN.md` §8, §9, §12; `x402-payments` skill

## Phase Verification

```bash
# Server starts and health check passes
pnpm --filter @sniffy/scraper dev &
sleep 2
curl -fsS localhost:3001/health
test $(curl -sS -o /dev/null -w '%{http_code}' localhost:3001/health) = "200"

# Sample endpoint works
curl -fsS localhost:3001/api/v1/aso/sample | jq '.sample == true' | grep -q true

# Quote endpoint works
curl -fsS -X POST localhost:3001/api/v1/aso/quote \
  -H "Content-Type: application/json" \
  -d '{"store":"ios","app":"https://apps.apple.com/us/app/example/id123456789","country":"US","keywords":["habit tracker"]}' \
  | jq '.shallowScan.previewKeyword.keyword' | grep -q "habit tracker"

# Diagnose returns real HTTP 402 without payment header
test $(curl -sS -o /dev/null -w '%{http_code}' -X POST localhost:3001/api/v1/aso/diagnose \
  -H "Content-Type: application/json" \
  -d '{"store":"ios","app":"https://apps.apple.com/us/app/example/id123456789","country":"US","keywords":["habit tracker"],"sniffId":"sniff_test"}') = "402"

# Diagnose 402 body matches schema
curl -sS -X POST localhost:3001/api/v1/aso/diagnose \
  -H "Content-Type: application/json" \
  -d '{...}' \
  | jq '.payment.network' | grep -q '"eip155:2910"'

# All unit + integration tests pass
pnpm --filter @sniffy/scraper test
```

## References

- `PLAN.md` §7 (Flow A, B, C), §8, §9, §12
- `PLAN.md` §24 — Monetization (pricing + funnel intent)
- `business-model.md` §2.1, §5
- `CLAUDE.md` "API Contract"
- Prior phase: [`01-payment-adapter.md`](./01-payment-adapter.md)
- Next phase: [`03-data-providers.md`](./03-data-providers.md)
