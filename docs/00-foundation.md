# Phase 00: Foundation

## Goal

Stand up the pnpm workspace, the shared Zod schema contract used by every other phase, and the fixture sample report — the minimum substrate every other phase depends on.

## Status & Dependencies

- **Status**: not-started
- **Depends on**: none (this is the root phase)
- **Blocks**: Phases 01, 02, 03, 05, 06 (everything downstream needs the workspace; everything API-shaped needs the schemas)
- **Can run in parallel with**: nothing — this is the foundation

## Sequential Tasks

These must run in order. They produce the workspace skeleton that the parallel tasks below operate inside of.

### 00.s1 — Initialize pnpm workspace + root configs

- **Recommended agent**: `principal-devsecops-architect` (skills: `senior-devops`, `senior-architect`)
- **Scope**: repo root files only
- **Inputs**:
  - `PLAN.md` §10 (Repo Layout, Tech Stack)
  - `CLAUDE.md` "Architecture" section
- **Deliverables**:
  - `pnpm-workspace.yaml` listing `landing`, `scraper`, `packages/*`
  - Root `package.json` with `private: true`, name `asosniffy-com`, pnpm scripts (`dev`, `build`, `test`, `lint`, `typecheck`) that fan out to workspaces
  - Root `tsconfig.json` with strict mode, path aliases for `@sniffy/*` packages, target ES2022, moduleResolution `bundler`
  - Root `.npmrc` with `node-linker=isolated` (default), `strict-peer-dependencies=true`
  - `.env.example` at repo root documenting every env var the project will use (placeholder values)
  - Update root `.gitignore` to include `.env*` (except `.env.example`), `node_modules/`, `dist/`, `.next/`, `.turbo/`, `*.tsbuildinfo`
- **Acceptance**:
  - `pnpm install` from repo root succeeds against the empty workspace
  - `pnpm run -r typecheck` is a defined command (even if it currently no-ops because workspaces are empty)
- **Out of scope**: do not scaffold individual workspaces yet (those happen in 00.p1/p2/p3); do not add Turborepo or Nx (pnpm scripts are enough for this MVP)
- **References**: `PLAN.md` §10 (Tech Stack — pnpm, TypeScript)

## Parallelizable Tasks

Run only after 00.s1 completes. Each task is independent — assign one agent per task.

### 00.p1 — `scraper/` skeleton + shared Zod schema contract

- **Recommended agent**: `principal-backend-engineer` (skills: `senior-backend`, `hono`, `api-security-best-practices`)
- **Scope**: `scraper/` directory
- **Inputs**:
  - `PLAN.md` §9 (API Requirements — this is the contract being encoded)
  - `PLAN.md` §10 (Tech Stack — Hono, Zod, Vitest, Docker `node:22-slim`)
  - `PLAN.md` §11 (Data Requirements — provenance label values)
  - `CLAUDE.md` "Load-Bearing Constraints" + "API Contract"
- **Deliverables**:
  - `scraper/package.json` — name `@sniffy/scraper` (private, not published), deps: `hono`, `@hono/node-server`, `zod`, `viem`, `redis` or `@upstash/redis`, devDeps: `typescript`, `tsx`, `vitest`, `@types/node`
  - `scraper/tsconfig.json` extending root
  - `scraper/src/index.ts` placeholder Hono app exporting `app` (route wiring happens in Phase 02)
  - `scraper/src/schemas/` directory with Zod schemas covering **every** request/response in `PLAN.md` §9:
    - `quote.ts` — `QuoteRequest`, `QuoteResponse`, `ShallowScan` (detected app, category, ratings summary, one preview keyword bucket)
    - `diagnose.ts` — `DiagnoseRequest`, `DiagnoseUnpaidResponse` (the 402 body), `DiagnosePaidResponse` (with `receipt`, `dataProvenance`, etc.)
    - `sample.ts` — `SampleResponse` (same shape as `DiagnosePaidResponse` with `sample: true`)
    - `shared.ts` — `Provenance` enum (`live | cached | fixture | inferred`), `Confidence` (`high | medium | low`), `Coverage` (per-section confidence), `CAIP2` (string regex `/^eip155:\d+$/`), `SniffId`, `RequestId`
    - `index.ts` re-exporting everything; this is **the** export the SDK and CLI consume
  - `scraper/src/schemas/index.ts` includes a `// SCHEMA_VERSION = '2026-05-mvp'` constant matching `reportVersion` in §9
  - `scraper/vitest.config.ts` minimal config
  - `scraper/tests/schemas.test.ts` — round-trip tests proving each schema parses the example payloads in `PLAN.md` §9
- **Acceptance**:
  - `pnpm --filter @sniffy/scraper test` passes
  - `pnpm --filter @sniffy/scraper typecheck` passes
  - `grep -r "type.*Provenance" scraper/src` shows only one source (the schema), not redefined elsewhere
- **Out of scope**: do not implement any route handler logic (Phase 02); do not write data providers (Phase 03); do not write scoring (Phase 04); do not write the payment adapter (Phase 01)
- **References**: `PLAN.md` §9, §11, §10

### 00.p2 — Fixture sample report JSON

- **Recommended agent**: `general-purpose` (skills: none required; this is data authoring)
- **Scope**: `scraper/fixtures/` directory
- **Inputs**:
  - `PLAN.md` §9 (paid `/diagnose` response shape — fixture must match exactly)
  - `PLAN.md` §11 (provenance labels)
  - `PLAN.md` §13 (Sniffy voice — playful in UI strings; the JSON keys stay clean)
- **Deliverables**:
  - `scraper/fixtures/sample-report.json` — a complete, realistic ASO report following the §9 paid-response shape, with:
    - `requestId`: `req_sample_2026_05_mvp`
    - `sniffId`: `sniff_sample_001`
    - `reportVersion`: `2026-05-mvp`
    - `receipt`: synthetic but well-formed (network `eip155:2910`, facilitator `morph-official`, amount `0.05`, asset string for the demo token, transaction hash `0xsample...`, settledAt ISO timestamp, facilitator mode `fixture-receipt`)
    - `dataProvenance`: all values set to `"fixture"`
    - `summary`: 2–3 sentences founder-readable
    - `keywordDiagnosis`: 2 keywords with rank bucket, intent score, recommendation
    - `competitorTrail`: 2 competitor entries with overlap notes
    - `metadataScore`: title/subtitle/keywords/screenshots subscores plus overall
    - `recommendations`: 3 ranked next-action items
    - `readyToPaste`: title, subtitle, keywords field, short description suggestions
  - `scraper/fixtures/sample-quote.json` — corresponding `/quote` response with `shallowScan` block populated
  - `scraper/fixtures/README.md` explaining the fixture is used by `/sample`, by tests, and as the demo fallback when live providers fail
- **Acceptance**:
  - `node -e "JSON.parse(require('fs').readFileSync('scraper/fixtures/sample-report.json'))"` exits 0
  - A schema round-trip test (added by 00.p1) parses both fixtures cleanly
- **Out of scope**: the fixture is one app for one keyword set — do not author a fixture library; do not fake real App Store IDs (use clearly-synthetic IDs like `1000000001`)
- **References**: `PLAN.md` §9 (response shape), §11 (provenance), §13 (voice)

### 00.p3 — `landing/` Next.js skeleton

- **Recommended agent**: `principal-frontend-engineer` (skills: `senior-frontend`, `next-best-practices`)
- **Scope**: `landing/` directory
- **Inputs**:
  - `PLAN.md` §10 (Tech Stack — Next.js + Tailwind + lucide-react + lottie-react + Reown AppKit)
  - `CLAUDE.md` "Architecture" section
- **Deliverables**:
  - `landing/package.json` — name `@sniffy/landing` (private, not published), deps: `next`, `react`, `react-dom`, `tailwindcss`, `lucide-react`, `lottie-react`, `zod`, devDeps: `typescript`, `@types/react`, `@types/node`
  - `landing/tsconfig.json` extending root, configured for Next.js (`"jsx": "preserve"`, `"plugins": [{"name": "next"}]`)
  - `landing/next.config.ts` with `experimental.typedRoutes: true`
  - `landing/tailwind.config.ts` extending the brand palette from `PLAN.md` §13 (off-white/ink base, signal yellow, bright teal, red-orange warning)
  - `landing/postcss.config.js`
  - `landing/src/app/layout.tsx` — minimal root layout, sets `<html lang="en">`, imports Tailwind globals
  - `landing/src/app/page.tsx` — placeholder home page that says "Sniffy" (Phase 05 builds the real UI)
  - `landing/src/app/globals.css` with Tailwind directives + reduced-motion media query baseline
  - `landing/public/` directory (empty, ready for `lottie/` subdir in Phase 05)
- **Acceptance**:
  - `pnpm --filter @sniffy/landing dev` starts Next.js on `localhost:3000` and renders the placeholder
  - `pnpm --filter @sniffy/landing build` succeeds
- **Out of scope**: do not build the quote form, report view, wallet UX, or Lottie integration (Phase 05); do not call the scraper API yet
- **References**: `PLAN.md` §10, §13

### 00.p4 — `packages/sdk` skeleton (types-only first cut)

- **Recommended agent**: `principal-backend-engineer` (skills: `senior-backend`)
- **Scope**: `packages/sdk/` directory
- **Inputs**:
  - `PLAN.md` §22.5 (`@gosniffy/sdk` surface)
  - The schemas exported by 00.p1
- **Deliverables**:
  - `packages/sdk/package.json` — name `@gosniffy/sdk`, license MIT, deps: `zod`, peerDep: `viem` (for the signer interface)
  - `packages/sdk/tsconfig.json` extending root, `composite: true`, `declaration: true`
  - `packages/sdk/src/index.ts` re-exporting types from `@sniffy/scraper`'s schema package (via workspace path)
  - `packages/sdk/src/errors.ts` — `PaymentRequiredError` class (extends `Error`, carries the parsed `DiagnoseUnpaidResponse` payload)
  - `packages/sdk/src/client.ts` — stub `createSniffy({ baseUrl, signer? })` that returns `{ quote, diagnose, sample }` with `throw new Error("not implemented")` bodies — Phase 06 fills these in
- **Acceptance**:
  - `pnpm --filter @gosniffy/sdk build` produces `dist/`
  - `pnpm --filter @gosniffy/sdk typecheck` passes
  - SDK imports `Provenance` and `QuoteResponse` types from `@sniffy/scraper` schemas (proving the single source of truth)
- **Out of scope**: do not implement the actual HTTP client or payment retry logic (Phase 06); do not publish to npm yet (Phase 07)
- **References**: `PLAN.md` §22.5

## Phase Verification

Run all of the following — every command must exit 0 before flipping status to `done`:

```bash
# Workspace is initialized
test -f pnpm-workspace.yaml
test -f tsconfig.json

# Schemas exist and tests pass
pnpm --filter @sniffy/scraper test

# Fixture is valid JSON and round-trips through schemas
pnpm --filter @sniffy/scraper test -- schemas

# Frontend skeleton builds
pnpm --filter @sniffy/landing build

# SDK skeleton typechecks and builds
pnpm --filter @gosniffy/sdk build

# Workspace-wide typecheck passes
pnpm -r typecheck
```

A second verification: `grep -rn "Provenance\|RequestId\|SniffId" packages/sdk landing scraper/src` should show every usage routing through `@sniffy/scraper`'s schema exports — no duplicated type definitions.

## References

- `PLAN.md` §9 — API Requirements (schema contract)
- `PLAN.md` §10 — Architecture, Repo Layout, Tech Stack
- `PLAN.md` §11 — Data Requirements (provenance labels)
- `PLAN.md` §13 — Branding (palette for Tailwind config)
- `PLAN.md` §22.5 — `@gosniffy/sdk` surface
- `CLAUDE.md` "Architecture" + "Load-Bearing Constraints"
- Next phase: [`01-payment-adapter.md`](./01-payment-adapter.md)
