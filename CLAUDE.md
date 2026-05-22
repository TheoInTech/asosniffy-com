# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current Repo State

This repository is **pre-implementation for code**. `PLAN.md` (the full PRD) is the source of truth; `SKILL.md`, the package skeletons under `packages/`, and the apps under `landing/`/`scraper/` will land per `PLAN.md` §17. Public-repo metadata is in place: `LICENSE` (MIT), `NOTICE`, `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `.gitignore`. Before writing code anywhere, read `PLAN.md` — it is canonical for product scope, API contracts, payment requirements, and tech-stack decisions.

## What This Project Is

Sniffy is a hackathon project for the **Morph x402 Agentic Payments** track. It is an x402-paywalled ASO (App Store Optimization) intelligence API + founder-facing demo UI + agent-distribution kit. Agents and indie founders submit an app + keywords + country, get a free quote (with a shallow-scan teaser), then pay per-request over x402 on Morph Mainnet for a structured diagnosis report.

The framing matters for every decision: **this is "agent-buyable app-store intelligence," not "an ASO dashboard that takes crypto."** When in doubt, optimize for the agentic API surface (SKILL.md, MCP, CLI, SDK) over the consumer UI.

## Architecture: pnpm Workspace, Two Deployable Apps, Three npm Packages

The repo is a pnpm workspace. Two apps deploy; three packages publish to npm.

```
asosniffy-com/
├── landing/                 Next.js + TypeScript → Vercel
├── scraper/                 Hono + TypeScript → Railway (Docker, node:22-slim)
├── packages/
│   ├── sdk/                 @gosniffy/sdk — typed TS client
│   ├── cli/                 @gosniffy/cli — `npx sniffy ...`
│   ├── mcp/                 @gosniffy/mcp — paid MCP server (quote / diagnose / sample)
│   └── aso-knowledge/       @gosniffy/aso-knowledge — free MCP server (curated ASO citations)
├── SKILL.md                 Vercel skills format, repo root
└── PLAN.md, CLAUDE.md, LICENSE, README.md, ...
```

- **`landing/`** — Next.js frontend deployed to **Vercel**. Hosts the demo UI, quote form, report view, wallet UX (Reown AppKit), and Lottie animations. Contains **no canonical API logic** — it calls the Railway backend over HTTPS.
- **`scraper/`** — Node.js backend deployed to **Railway** in a Docker container (`node:22-slim` base). Owns the `/api/v1/aso/{quote,diagnose,sample}` endpoints, the x402 payment adapter, all data providers (Apple/Google), Redis cache, fixture fallback, scoring, and AI synthesis.
- **`packages/sdk`, `packages/cli`, `packages/mcp`, `packages/aso-knowledge`** — npm-publishable. They do **not** deploy to Vercel or Railway. SDK request/response types derive from the Zod schemas in `scraper/` so SDK / CLI / MCP and SKILL.md stay aligned with the §9 API contract automatically. `@gosniffy/aso-knowledge` ships a separate, payment-free MCP server with a curated knowledge corpus that the scraper mirrors at `scraper/src/scoring/aso-knowledge.ts` — keep the two copies in sync (the package's `tests/sync-with-scraper.test.ts` guards against drift).

API framework for `scraper`: **Hono** preferred (fetch-native, small); Fastify acceptable if plugin ecosystem becomes load-bearing. Package manager is **pnpm**. Validation is **Zod**. Tests are **Vitest**.

Do **not** containerize `landing` — deploy via Vercel's native Next.js flow.

## Load-Bearing Constraints

These are non-obvious decisions from `PLAN.md` that will trip up future work if violated:

- **No relational database for the MVP.** Storage is: local fixture JSON (committed under `scraper/`), in-memory cache for local dev, and Redis-compatible cache (Upstash or Railway Redis) for deployed caching. Cache keys are deterministic by `(store, country, appId, keywordSet, providerVersion, reportVersion)`. Do not introduce Postgres/Supabase/Prisma unless explicitly asked.
- **Use the official Morph x402 facilitator** at `https://morph-rails.morph.network/x402`. Do not build or fork a facilitator unless the official route blocks judging.
- **Sniffy runs on Morph Mainnet only** (`eip155:2818`, chain ID 2818). Hoodi testnet support was dropped 2026-05-21; there is no longer a testnet path in the demo, MCP, or SDK.
- **The `/api/v1/aso/diagnose` endpoint MUST return a real HTTP `402 Payment Required`** with machine-readable x402 payment requirements when payment is missing — this is the judging-critical behavior. A mocked/UI-only paywall fails the track fit. The 402 response also sets the canonical `PAYMENT-REQUIRED` header (Base64 JSON of the offer); the 200 response sets `PAYMENT-RESPONSE` (Base64 JSON of the receipt). This is what makes `@x402/fetch`-style clients work without parsing the body.
- **The `/api/v1/aso/sample` endpoint must always work**, even when every live provider is down. Judges hit this without a wallet.
- **The `/api/v1/aso/quote` response includes a `shallowScan` block** — detected app identity, category, ratings summary, one preview keyword bucket. This closes the value-before-wallet gap for indie hackers. Do not move recommendations, full keyword diagnosis, competitor trail, metadata score, or ready-to-paste content into `shallowScan` — those stay paid-only. See `PLAN.md` §9 and §22.
- **Every report field carries a provenance label**: `live`, `cached`, `fixture`, or `inferred`. The UI and CLI distinguish these visually. Do not silently mix sources.
- **iOS-first.** Android is preview-quality only — lower-confidence labels, fixture fallback acceptable. Do not block on Play Store parity.

## Agent-Distribution Surface

Sniffy ships four installable surfaces for AI agents and indie hackers (`PLAN.md` §22):

- **`SKILL.md`** at repo root — Vercel / Agent Skills format, installable via `npx skills add TheoInTech/asosniffy-com`. Canonical API reference (endpoints, x402 payment, receipt verification, provenance, signal gaps).
- **`skills/`** — specialist Agent Skills catalog: `sniffy-router` (intent dispatch), `sniffy-context` (foundation workspace doc), and six specialists: `sniffy-audit`, `sniffy-keywords`, `sniffy-metadata`, `sniffy-compete`, `sniffy-localize`, `sniffy-momentum`. Each wraps the same `sniffy_quote` / `sniffy_diagnose` calls but focuses output on one section of the report. Discriminative `description:` triggers make per-task selection automatic in Cursor / Claude Code.
- **`@gosniffy/mcp`** — MCP server exposing `sniffy_quote`, `sniffy_diagnose`, `sniffy_sample`. Wallet config via `SNIFFY_PRIVATE_KEY` env var; mainnet payments are non-refundable so the tool descriptions warn before paid calls.
- **`@gosniffy/cli`** — `npx sniffy quote|diagnose|sample`. Provenance icons (`●live ◐cached ○fixture ◇inferred`); `--json` flag for piping.
- **`@gosniffy/sdk`** — typed `createSniffy({ baseUrl, signer? })` client; exports a typed `PaymentRequiredError` so consumers can intercept the x402 flow.

All four surfaces target the same `scraper` API. When changing the API contract, update the SDK in the same PR — and PLAN.md §9.

## API Contract (Authoritative)

The three endpoints and their request/response shapes are specified in `PLAN.md` §9. When implementing or modifying any endpoint, treat that section as the contract — including the `dataProvenance`, `receipt`, `pricing.breakdown`, `coverage`, and `shallowScan` fields. Paid responses must include receipt metadata (network, CAIP-2 chain ID, amount, asset, transaction hash, settled-at timestamp, facilitator mode).

## Open-Source Posture

The repo is **MIT-licensed** (see `LICENSE`, `NOTICE`, `PLAN.md` §23). Commercial strategy is **open client, commercial host**: the running `sniffy.io` instance, the wallet receiving x402 payments, and the accumulated cache/keyword history are the business; the code is the adoption funnel. The "Sniffy"/"ASOSniffy" wordmark and the pixel-detective mascot are reserved as trademarks (filing post-hackathon).

Concrete rules:

- Never commit secrets, wallet keys, or `.env*` files. The `.gitignore` covers them; verify before pushing.
- Code can be relicensed forward (MIT → BSL/SSPL on `scraper/`) but not backward. Don't propose making the repo private to "protect IP" — the moat is hosted infra + brand + data, not code obfuscation.
- The Vercel-skills install path (`npx skills add TheoInTech/asosniffy-com`) requires the repo to be public.

## Branch Protection

Branch protection on `main` requires PRs for non-admins; the repo owner (TheoInTech) bypasses via admin role and can push directly. Don't push to `main` from a non-owner account or from CI — open a PR.

## Branding Voice

Playful UI terms (`sniff test`, `scent trail`, `competitor trail`, `metadata suspects`, `best next sniff`) are intentional in the **UI**. API docs, JSON field names, MCP tool names, CLI command names, and report content stay clean and professional. Don't sprinkle dog puns into JSON keys, tool descriptions, or error messages.

Lottie animations live under `landing/public/lottie/`, target ~150 KB each, and must have static fallbacks for `prefers-reduced-motion`.

## Open Questions Still Unresolved

`PLAN.md` §21 lists open questions that block parts of the implementation — chiefly: which Mainnet USDC contract address the facilitator currently advertises (with what EIP-712 fields) for the `exact` scheme on `eip155:2818`. Verify against `GET https://morph-rails.morph.network/x402/v2/supported` before wiring the payment adapter to a specific token path (EIP-3009 vs Permit2 vs Morph-specific). The Hoodi facilitator path is no longer maintained.
