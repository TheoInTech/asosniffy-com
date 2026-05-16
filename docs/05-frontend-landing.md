# Phase 05: Frontend (`landing/`)

> **Pricing copy & funnel context**: The "why pay per sniff" framing and pricing copy on this surface come from [`business-model.md` §1, §2, §8](./business-model.md) and `PLAN.md` §24.1 / §24.7. The free `/sample` + `/quote` flow exists to deliver real value before the wallet step — do not gate them.

## Goal

Build the Vercel-deployed demo UI that lets a judge or indie hacker run a free sniff, view the `shallowScan`, unlock with x402 on Morph Hoodi, and see the paid report with a visible spend trail, provenance labels, and Sniffy's pixel-detective branding.

## Status & Dependencies

- **Status**: not-started
- **Depends on**:
  - Phase 00 — `landing/` Next.js skeleton; `@sniffy/scraper` schemas (the UI consumes the same Zod types via SDK or direct import)
- **Blocks**: Phase 08 (browser/mobile QA happens against this UI); Phase 09 (demo video records this surface)
- **Can run in parallel with**: Phases 01–04 (backend); Phase 06 (distribution kit). The frontend integrates with the backend through Phase 06's SDK; until that ships, use the typed fetch client built in 05.p1 against a local `scraper` dev server or mocked endpoints

## Sequential Tasks

### 05.s1 — App shell, palette, typography, layout

- **Recommended agent**: `principal-frontend-engineer` (skills: `senior-frontend`, `next-best-practices`, `frontend-design`)
- **Scope**: `landing/src/app/layout.tsx`, `landing/src/app/page.tsx`, `landing/src/components/Shell/`, `landing/tailwind.config.ts`
- **Inputs**:
  - `PLAN.md` §13 (palette, voice, visual direction)
  - `CLAUDE.md` "Branding Voice"
  - `business-model.md` §1, §8 (positioning copy)
- **Deliverables**:
  - Tailwind theme tokens for the §13 palette: `ink`, `paper`, `signal-yellow`, `bright-teal`, `warning-red-orange`, semantic aliases (`bg-paper`, `text-ink`, `accent-signal`)
  - Pixel-art friendly type pairing (humanist sans for body, monospace accent for `sniffId` / receipt fields)
  - `<Shell>` wrapper with the Sniffy header (mascot mark + wordmark), a slim "Hackathon: Morph Hoodi testnet" badge, footer linking to the GitHub repo and `business-model.md` / pricing page (post-MVP target)
  - Reduced-motion support: every animated component must have a static fallback under `prefers-reduced-motion: reduce`
  - **First screen is the tool, not a marketing page** (per `PLAN.md` §8 "Make the first screen the working tool")
- **Acceptance**:
  - `pnpm --filter @sniffy/landing dev` renders the shell at `localhost:3000` with the palette applied
  - Toggling system reduced-motion does not break the layout
  - The page passes basic a11y: every interactive element is keyboard-reachable, every image has alt text

## Parallelizable Tasks

After 05.s1 lands, the following can be built in parallel.

### 05.p1 — Typed API client + quote form

- **Recommended agent**: `principal-frontend-engineer` (skills: `senior-frontend`, `next-best-practices`)
- **Scope**: `landing/src/lib/api/`, `landing/src/components/QuoteForm/`
- **Inputs**:
  - `@sniffy/scraper` schemas (typed responses)
  - `PLAN.md` §7 (Flow A), §8, §9 (quote endpoint)
  - `business-model.md` §1 (why pay per sniff)
- **Deliverables**:
  - `landing/src/lib/api/client.ts` — typed fetch client `getQuote(...)`, `getSample()`, `getDiagnose(...)` pointing at `process.env.NEXT_PUBLIC_SCRAPER_BASE_URL` (defaults to `http://localhost:3001` in dev). Parses with Zod before returning.
  - `<QuoteForm>` with:
    - App input (URL, App Store ID, or app name)
    - Country select (default `US`, top-10 markets)
    - Keyword chips (1–5; live validation; show counter)
    - Optional competitor IDs (collapsible "Advanced" section)
    - Submit button labeled **"Run free sniff test"** (per `PLAN.md` §7)
    - Inline error states (Zod validation errors shown next to fields, not in an alert)
- **Acceptance**:
  - Submitting the form calls `POST /api/v1/aso/quote` and renders the response below the form
  - 1-keyword and 5-keyword inputs both work; 0 or 6 are rejected client-side with a clear message
  - Loading state shows the `sniffy-sniffing-loader` Lottie (or static fallback under reduced-motion)
- **Out of scope**: do not implement the wallet flow here (05.p4); do not render the paid report (05.p3)
- **References**: `PLAN.md` §7, §8, §9

### 05.p2 — Quote response view + `shallowScan` card

- **Recommended agent**: `principal-frontend-engineer` (skills: `senior-frontend`, `frontend-design`)
- **Scope**: `landing/src/components/QuoteResponse/`
- **Inputs**:
  - `QuoteResponse` schema with `shallowScan` block
  - `PLAN.md` §9 (shallowScan shape — detected app, category, ratings, one preview keyword bucket)
  - `business-model.md` §1 (shallowScan is the value-before-wallet preview)
- **Deliverables**:
  - `<QuoteResponse>` showing:
    - Detected app card: app icon (if available), name, developer, primary category, ratings (average + count)
    - **`shallowScan.previewKeyword`** badge: keyword, rank bucket, confidence, provenance icon (●live ◐cached ○fixture ◇inferred — same icons as the CLI)
    - Itemized pricing breakdown matching `pricing.breakdown[]`
    - Coverage hints for each report section (`appMetadata: high`, `keywordRank: medium`, etc.) — visual progress-bar style
    - **"Unlock full trail"** primary CTA (leads to 05.p4 wallet flow)
    - Sniff ID (`sniff_...`) shown as monospace, copy-on-click
  - The view **does not** show recommendations, full keyword diagnosis, competitor trail, metadata score, or ready-to-paste content (those are paid-only; `CLAUDE.md` constraint)
- **Acceptance**:
  - Pasting a known App Store URL into the form and submitting renders the detected app card with real ratings (when backend is live)
  - The preview keyword bucket renders with the right provenance icon
  - The "Unlock full trail" CTA is the only primary action visible on this screen
- **Out of scope**: do not synthesize or guess recommendations here (paid-only)
- **References**: `PLAN.md` §9; `business-model.md` §1

### 05.p3 — Paid report view + spend trail

- **Recommended agent**: `principal-frontend-engineer` (skills: `senior-frontend`, `frontend-design`)
- **Scope**: `landing/src/components/Report/`, `landing/src/components/SpendTrail/`
- **Inputs**:
  - `DiagnosePaidResponse` schema
  - `PLAN.md` §9 (paid response shape), §8 (UI must show spend trail), §13 (voice)
- **Deliverables**:
  - `<Report>` rendering each section from the paid response:
    - `summary` (founder-readable headline)
    - `keywordDiagnosis[]` table with rank bucket, intent, coverage, recommendation pill
    - `competitorTrail[]` cards with overlap notes
    - `metadataScore` — overall score gauge + subscore breakdown
    - `recommendations[]` ranked list with expected-impact tag
    - `readyToPaste` — copyable code-style blocks for title, subtitle, keywords field, short description
    - **Every section shows its `dataProvenance` icon** (●live ◐cached ○fixture ◇inferred)
  - `<SpendTrail>` panel:
    - Receipt amount in USDC + USD equivalent
    - Network badge (`eip155:2910` → "Morph Hoodi")
    - Facilitator (`morph-official`)
    - Transaction hash with explorer link (Hoodi explorer)
    - Request ID + Sniff ID
    - Settled-at timestamp
    - Cache key (collapsed by default, expandable for nerds)
  - Trigger `sniffy-report-reveal` Lottie on first render (or static fallback)
- **Acceptance**:
  - A mocked `DiagnosePaidResponse` renders every section with no missing fields
  - The transaction hash links to a real explorer URL (Hoodi or mainnet depending on `network`)
  - Provenance icons match the JSON exactly; nothing silently mislabeled
- **Out of scope**: do not implement the wallet/payment flow here (05.p4); do not write report data (Phase 04)
- **References**: `PLAN.md` §8, §9, §13

### 05.p4 — Reown AppKit wallet + x402 unlock flow

- **Recommended agent**: `principal-frontend-engineer` (skills: `senior-frontend`, `next-best-practices`) — pair with `morph-x402-engineer` for the x402 client-side payment shape if any subtleties surface
- **Scope**: `landing/src/lib/wallet/`, `landing/src/components/WalletConnect/`, `landing/src/components/UnlockTrail/`
- **Inputs**:
  - Reown AppKit docs (use Context7 via `mcp__claude_ai_Context7__query-docs`)
  - `PLAN.md` §12 (network, facilitator), §6 (Reown AppKit)
  - `business-model.md` §2.1 (hackathon pricing for the unlock amount)
- **Deliverables**:
  - Reown AppKit configured for Morph Hoodi (`eip155:2910`) and optionally Morph mainnet (`eip155:2818`)
  - `<WalletConnect>` button + connected-state pill (address truncated + balance)
  - "How to fund testnet wallet" panel (collapsible) with: bridge link, faucet link if available, plain-English steps (per `PLAN.md` §5A)
  - `<UnlockTrail>` flow:
    1. User clicks "Unlock full trail" from 05.p2
    2. If wallet not connected → open AppKit modal
    3. Build the x402 payment header for the diagnose request (sign EIP-3009 / Permit2 per Phase 01 research) — use a shared helper that the SDK will also use
    4. POST `/api/v1/aso/diagnose` with the `PAYMENT-SIGNATURE` header
    5. On 402 retry (rare) → show clear retry guidance with new payment requirements
    6. On 200 → trigger `sniffy-x402-unlock` Lottie, then render 05.p3 report
  - Error states: wrong network (Hoodi expected; offer "Switch to Morph Hoodi" button), insufficient balance (show fund instructions), user rejected signature (show "Try again")
- **Acceptance**:
  - Connecting MetaMask/Reown on Hoodi shows the address and balance
  - Clicking "Unlock full trail" with a funded wallet completes the x402 flow and renders the paid report
  - The receipt explorer link in `<SpendTrail>` (05.p3) points to a real Hoodi transaction
- **Out of scope**: do not implement an on-ramp UI for testnet (`PLAN.md` §6); do not store the wallet address server-side
- **References**: `PLAN.md` §5A, §6, §12; `business-model.md` §2.1

### 05.p5 — Lottie animations + reduced-motion fallbacks

- **Recommended agent**: `principal-frontend-engineer` (skills: `senior-frontend`, `frontend-design`)
- **Scope**: `landing/src/components/Lottie/`, `landing/public/lottie/`
- **Inputs**:
  - `PLAN.md` §13 (four required Lottie files: `sniffy-sniffing-loader`, `sniffy-x402-unlock`, `sniffy-no-scent`, `sniffy-report-reveal`)
- **Deliverables**:
  - `landing/public/lottie/` contains the four `.json` Lottie files (~150 KB each)
  - `<Lottie>` wrapper component reading `prefers-reduced-motion` and rendering a static pixel-art PNG fallback when reduced motion is set
  - The wrapper accepts a `name` prop matching one of the four animations and a `play` mode (`loop` | `once` | `paused`)
- **Acceptance**:
  - Each animation plays at full quality with motion enabled
  - Each animation shows a static PNG fallback with reduced motion enabled
  - No animation exceeds 200 KB
- **Out of scope**: do not animate page transitions; do not auto-play on every component mount (only the four named animations under §13)
- **References**: `PLAN.md` §13

### 05.p6 — `sniffy-no-scent` weak-data state

- **Recommended agent**: `principal-frontend-engineer` (skills: `senior-frontend`, `frontend-design`)
- **Scope**: `landing/src/components/NoScent/`
- **Inputs**:
  - `PLAN.md` §7 (Flow C — Weak Data), §14 (weak-data UX)
- **Deliverables**:
  - `<NoScent>` view triggered when:
    - App not found
    - All keywords return `not_found` rank bucket
    - Country unsupported
    - All providers fall back to fixture under user-provided input
  - Visual: `sniffy-no-scent` Lottie + actionable next steps (try broader keywords, another country, manual competitor input) — text reads from the `recommendations[]` field when present
- **Acceptance**:
  - When the backend returns weak data, the user sees a useful next-action prompt — **not a broken error**
- **Out of scope**: do not render technical errors here (those go to a separate error boundary)
- **References**: `PLAN.md` §7, §14

## Phase Verification

```bash
# Frontend builds without errors
pnpm --filter @sniffy/landing build

# Lint + typecheck
pnpm --filter @sniffy/landing typecheck

# Manual browser smoke (against local scraper)
# 1. Start backend: pnpm --filter @sniffy/scraper dev (in another terminal)
# 2. Start frontend: pnpm --filter @sniffy/landing dev
# 3. Open http://localhost:3000
# 4. Paste a known App Store URL, submit, see shallowScan with provenance
# 5. Connect Reown AppKit wallet on Hoodi
# 6. Click "Unlock full trail"
# 7. See sniffy-x402-unlock animation + paid report + spend trail with explorer link

# Reduced-motion check (macOS):
# System Settings > Accessibility > Display > Reduce motion → on
# Reload page → animations replaced by static pixel-art frames
```

## References

- `PLAN.md` §7 (User Flows), §8 (UI), §9, §12 (network for wallet), §13 (branding)
- `PLAN.md` §24.1, §24.7 — positioning copy
- `business-model.md` §1, §2, §8 — pricing + positioning
- `CLAUDE.md` "Branding Voice", "Load-Bearing Constraints"
- Prior phase: [`04-scoring-and-synthesis.md`](./04-scoring-and-synthesis.md)
- Next phase: [`06-distribution-kit.md`](./06-distribution-kit.md)
