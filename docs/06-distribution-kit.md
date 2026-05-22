# Phase 06: Distribution Kit

> **Funnel context**: Each artifact in this phase is a distinct revenue path in the [`business-model.md` §5](./business-model.md#5-distribution--revenue-funnel) funnel mapping. `SKILL.md` install → free `/quote` → paid `/diagnose`; MCP install → recurring agent-driven calls; CLI → release-pipeline embedding; SDK → custom workflows. The open-source posture (`PLAN.md` §23) is what makes all four one-liners work.

## Goal

Ship the four installable agent-distribution surfaces from `PLAN.md` §22: `SKILL.md` at repo root, `@gosniffy/sdk` (typed client), `@gosniffy/cli` (`npx sniffy ...`), and `@gosniffy/mcp` (MCP server). All target the same `scraper` API. SDK request/response types derive from the Zod schemas in Phase 00 so all four stay aligned with the §9 contract automatically.

## Status & Dependencies

- **Status**: not-started
- **Depends on**:
  - Phase 00 — `@sniffy/scraper` schemas, `@gosniffy/sdk` skeleton with `PaymentRequiredError` exported
  - Phase 02 — running `scraper` server (for integration tests; can mock during dev)
- **Blocks**: Phase 07 (deployment includes npm publish + repo public flip); Phase 09 (submission smoke-tests these install paths)
- **Can run in parallel with**: Phases 03 (data), 04 (scoring), 05 (frontend). Each artifact below can be developed by a different agent.

## Parallelizable Tasks

### 06.p1 — `@gosniffy/sdk` HTTP client + x402 retry

- **Recommended agent**: `principal-backend-engineer` (skills: `senior-backend`, `x402-payments`)
- **Scope**: `packages/sdk/src/`
- **Inputs**:
  - `@sniffy/scraper` schemas
  - `PLAN.md` §22.5 (SDK surface)
  - `PLAN.md` §9 (endpoint contract)
- **Deliverables**:
  - Fill in the skeleton from Phase 00 (00.p4):
    - `createSniffy({ baseUrl, signer? })` — `signer` is an optional `viem` `Account`; required for `.diagnose()` if `auto-pay` is left enabled
    - `client.quote(input)` → calls `POST /api/v1/aso/quote`, parses with `QuoteResponse` schema
    - `client.sample()` → calls `GET /api/v1/aso/sample`
    - `client.diagnose(input, { autoPay = true })`:
      - First request without payment header
      - If response is `402` and `autoPay` is `true` and `signer` is set → build x402 payment header (use the shared helper from Phase 01), retry once
      - If `autoPay` is `false` or no signer → throw `PaymentRequiredError(unpaidResponse)`
      - On `200` → parse with `DiagnosePaidResponse` and return
  - **Exported `PaymentRequiredError`** carries the parsed `DiagnoseUnpaidResponse` (`payment.x402Version`, `payment.network`, etc.) so consumers can build their own payment UX
  - Retry policy: max 1 retry on 402; no retry on 5xx (let consumers decide)
  - `packages/sdk/README.md` — usage example matching `PLAN.md` §22.5 verbatim
  - Tests: mocked fetch, happy path, 402 → retry → 200, 402 with `autoPay: false` throwing `PaymentRequiredError`
- **Acceptance**:
  - `import { createSniffy, PaymentRequiredError } from '@gosniffy/sdk'` works in a fresh consumer project
  - `const quote = await sniffy.quote({...})` returns a fully-typed `QuoteResponse` with autocomplete
  - `await sniffy.diagnose({...})` with a configured signer returns a fully-typed `DiagnosePaidResponse`
  - `await sniffy.diagnose({...}, { autoPay: false })` throws `PaymentRequiredError` containing the payment requirements
- **Out of scope**: do not bundle a wallet — the SDK accepts a `signer` interface; the caller (CLI / MCP / user code) brings the wallet
- **References**: `PLAN.md` §22.5; `business-model.md` §5

### 06.p2 — `@gosniffy/cli`

- **Recommended agent**: `principal-backend-engineer` (skills: `senior-backend`)
- **Scope**: `packages/cli/`
- **Inputs**:
  - `@gosniffy/sdk` from 06.p1
  - `PLAN.md` §22.4 (CLI surface)
  - `CLAUDE.md` "Branding Voice" (clean CLI; playful UI vocabulary is for the web demo, not the CLI flags)
- **Deliverables**:
  - `packages/cli/package.json` — name `@gosniffy/cli`, license MIT, `bin: { sniffy: './dist/index.js' }`, deps: `@gosniffy/sdk`, `commander` (or `cac`), `picocolors`, `viem`
  - `packages/cli/src/index.ts` — commander entrypoint
  - Commands:
    - `npx sniffy quote <url-or-id> -k <keyword1,keyword2,...> [-c <country>]`
    - `npx sniffy diagnose <url-or-id> -k <keyword1,keyword2,...> [-c <country>]`
    - `npx sniffy sample`
  - Wallet config: `SNIFFY_PRIVATE_KEY` env var; on `diagnose`, print **"⚠️  Testnet only — do not use a mainnet private key"** before the request goes out
  - Default human-readable output:
    - Provenance icons: `●` live, `◐` cached, `○` fixture, `◇` inferred
    - Section headers with the `chalk`/`picocolors` palette matching the brand (signal yellow for primary, bright teal for emphasis)
    - Compact tables for `keywordDiagnosis[]` and `recommendations[]`
    - Receipt block at the bottom with explorer link
  - `--json` flag pipes the raw API response without formatting (for scripting)
  - `--base-url` flag overrides the default (`https://api.sniffy.io`; falls back to `http://localhost:3001` if `SNIFFY_BASE_URL` is set)
  - Tests: snapshot the formatted output against a fixture report
- **Acceptance**:
  - `npx sniffy sample --base-url http://localhost:3001` prints a formatted report from the local server
  - `npx sniffy sample --json --base-url http://localhost:3001` prints raw JSON
  - `npx sniffy diagnose ...` without `SNIFFY_PRIVATE_KEY` exits with code 1 and a helpful error
  - Output uses the provenance icons consistently (no provenance field rendered without its icon)
- **Out of scope**: do not implement interactive prompts (`inquirer`) — keep the CLI flag-driven so it's pipeable; do not embed a TUI
- **References**: `PLAN.md` §22.4

### 06.p3 — `@gosniffy/mcp`

- **Recommended agent**: `principal-backend-engineer` (skills: `senior-backend`)
- **Scope**: `packages/mcp/`
- **Inputs**:
  - `@gosniffy/sdk` from 06.p1
  - `PLAN.md` §22.3 (MCP surface)
  - MCP SDK docs (use Context7)
- **Deliverables**:
  - `packages/mcp/package.json` — name `@gosniffy/mcp`, license MIT, `bin: { 'sniffy-mcp': './dist/index.js' }`, deps: `@modelcontextprotocol/sdk`, `@gosniffy/sdk`, `viem`
  - MCP server using stdio transport (the standard MCP transport for `npx`-launched servers)
  - Three tools exposed:
    - `sniffy_quote` — input schema: `{ store, app, country, keywords[], competitors[]? }`; calls `client.quote(...)`; returns the full `QuoteResponse` including `shallowScan`
    - `sniffy_diagnose` — input schema: same as `sniffy_quote` plus `{ sniffId }`; calls `client.diagnose(..., { autoPay: true })`; returns `DiagnosePaidResponse` with receipt
    - `sniffy_sample` — no input; calls `client.sample()`; returns the canned sample
  - Each tool **description** is written for agent consumption (clear input/output, when to use, cost implications)
  - Each tool description includes a **"testnet only — do not use a mainnet key"** warning (load-bearing per `CLAUDE.md`)
  - `SNIFFY_PRIVATE_KEY` env var for the signer; `SNIFFY_BASE_URL` for the backend
  - Error mapping: `PaymentRequiredError` from the SDK is surfaced to the MCP client as a structured tool error so the agent can decide whether to retry or surface to the user
  - `packages/mcp/README.md` with the Claude Desktop / Cursor config snippet matching `PLAN.md` §22.6 verbatim
  - Tests: stdio harness that calls each tool with mocked SDK and validates the JSON-RPC response shape
- **Acceptance**:
  - `npx @gosniffy/mcp` starts a stdio server that responds to MCP `tools/list` with the three tools
  - Adding the `PLAN.md` §22.6 config snippet to Claude Desktop makes the tools available to Claude
  - Calling `sniffy_sample` returns the canned sample without requiring a wallet
- **Out of scope**: do not implement an SSE / HTTP transport (stdio is enough for `npx` launches); do not bundle the private key (env-var only)
- **References**: `PLAN.md` §22.3, §22.6

### 06.p4 — `SKILL.md` at repo root

- **Recommended agent**: `general-purpose` (skills: `claude-code-guide`) — `claude-code-guide` informs how Vercel skills are consumed; the doc itself is plain Markdown
- **Scope**: `/SKILL.md` (repo root)
- **Inputs**:
  - `PLAN.md` §22.2 (`SKILL.md` shape)
  - `PLAN.md` §9 (API endpoints)
  - `business-model.md` §5 (funnel intent)
- **Deliverables**:
  - `SKILL.md` at repo root with the Vercel skills frontmatter:
    ```yaml
    ---
    name: sniffy
    description: Pay-per-sniff ASO intelligence for App Store apps. Use when a user asks for keyword diagnosis, competitor analysis, or metadata recommendations for an iOS app. Handles x402 payment on Morph Hoodi automatically.
    ---
    ```
  - Body teaches the agent **general API instruction**, not named recipes:
    - The three endpoints + their request/response shapes (concise — link out to `PLAN.md` §9 for the canonical spec)
    - How to read a `402 Payment Required` body, sign x402 on Morph Hoodi (`eip155:2910`), and retry
    - Provenance labels (`live | cached | fixture | inferred`) and how to surface them in the agent's reply to the user
    - Error semantics: `payment_required`, `app_not_found`, `no_rank`, `unsupported_country`
    - **Hard rule**: testnet only — agents must not use a mainnet key in this kit
  - The body is intentionally instruction-style, not recipe-style. Agents compose workflows from the primitives.
- **Acceptance**:
  - `npx skills add TheoInTech/asosniffy-com` inside a fresh Claude Code project installs the skill and the agent picks up the description
  - The body fits on one screen — under ~150 lines — so an agent reads it efficiently each session
- **Out of scope**: do not embed full PLAN.md content in `SKILL.md` (link to it instead); do not write recipes for specific user prompts (we let the agent figure out the workflow)
- **References**: `PLAN.md` §22.2

## Phase Verification

```bash
# All three packages build and typecheck
pnpm -r --filter "@gosniffy/sdk" --filter "@gosniffy/cli" --filter "@gosniffy/mcp" build
pnpm -r --filter "@gosniffy/sdk" --filter "@gosniffy/cli" --filter "@gosniffy/mcp" typecheck

# SDK consumer smoke test (against local scraper running at :3001)
pnpm --filter @gosniffy/sdk test

# CLI smoke against local backend
pnpm --filter @sniffy/scraper dev &
sleep 2
pnpm --filter @gosniffy/cli build
SNIFFY_BASE_URL=http://localhost:3001 node packages/cli/dist/index.js sample | grep -q "summary"

# MCP server starts and lists tools
pnpm --filter @gosniffy/mcp build
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node packages/mcp/dist/index.js | jq '.result.tools | length' | grep -q 3

# SKILL.md exists and parses
test -f SKILL.md
grep -q "^name: sniffy" SKILL.md
```

Manual smoke (post-Phase 07 deploy):
- Add `@gosniffy/mcp` to Claude Desktop using the `PLAN.md` §22.6 config snippet → start a chat → ask "what keywords could improve this app?" with an App Store URL → Claude should invoke `sniffy_quote` then `sniffy_diagnose`

## References

- `PLAN.md` §22 (all subsections)
- `PLAN.md` §24.5 — Distribution funnel
- `business-model.md` §5
- `CLAUDE.md` "Agent-Distribution Surface", "Branding Voice"
- Prior phase: [`05-frontend-landing.md`](./05-frontend-landing.md)
- Next phase: [`07-deployment.md`](./07-deployment.md)
