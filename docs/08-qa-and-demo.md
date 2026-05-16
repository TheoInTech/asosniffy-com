# Phase 08: QA & Demo Polish

## Goal

Lock in reliability for the judging window: run the full test matrix from `PLAN.md` §18, verify weak-data and payment-error UX, write the curl examples that the submission docs use, and bake a fallback demo script so a flaky network during the 2-minute video does not sink the submission.

## Status & Dependencies

- **Status**: not-started
- **Depends on**:
  - Phase 07 — live URLs (`https://api.sniffy.io`, `https://sniffy.io`) reachable
  - Phase 06 — distribution kit live (so installs are smoke-testable end-to-end)
- **Blocks**: Phase 09 (submission video records the verified demo)
- **Can run in parallel with**: nothing — this is the QA gate

## Parallelizable Tasks

### 08.p1 — Full test matrix execution against the deployed surface

- **Recommended agent**: `general-purpose` (skill: `code-review`) — QA work is judgment-heavy and benefits from a generalist + code-review skill loaded
- **Scope**: `scraper/tests/integration/`, deployed-surface checks
- **Inputs**:
  - `PLAN.md` §18 (full test plan)
  - `PLAN.md` §14 (reliability requirements)
- **Deliverables**:
  - Run every test in §18 and capture results in `docs/qa-results.md` (markdown table: test name, run-date, outcome, notes)
  - **API tests** (against `https://api.sniffy.io`):
    - Quote with 1 keyword ✓
    - Quote with 5 keywords ✓
    - Quote with explicit competitors ✓
    - Diagnose without payment → 402 ✓
    - Diagnose with valid Hoodi payment → 200 with receipt ✓
    - Diagnose includes receipt metadata ✓
    - Sample returns valid JSON ✓
  - **Data tests**:
    - iOS lookup by App Store URL ✓
    - iOS lookup by app ID ✓
    - iOS lookup by app name ✓
    - Country-specific lookup ✓
    - Keyword not ranked → returns `not_found` bucket without error ✓
    - App not found → returns weak-data response, not 500 ✓
    - Android preview unavailable → returns blocked status, not crash ✓
  - **Payment tests**:
    - `/v2/supported` reachable ✓
    - HMAC signature valid against Morph facilitator ✓
    - Missing payment → 402 ✓
    - Wrong network (mainnet header against Hoodi config) → 402 rejected with clear code ✓
    - Valid Hoodi payment settles ✓
    - Receipt transaction link opens in Hoodi explorer ✓
- **Acceptance**:
  - `docs/qa-results.md` table is fully populated, every test outcome is `pass` or `known-issue` (with a written workaround)
  - No "untested" rows remain in §18
- **Out of scope**: do not fix every failure here — file an issue and assign back to the relevant phase if a regression is found
- **References**: `PLAN.md` §14, §18

### 08.p2 — Browser + mobile smoke matrix

- **Recommended agent**: `principal-frontend-engineer` (skills: `senior-frontend`)
- **Scope**: manual + automated browser checks against `https://sniffy.io`
- **Inputs**:
  - `PLAN.md` §18 (Frontend Tests)
  - Phase 05 outputs
- **Deliverables**:
  - Checks captured in `docs/qa-results.md`:
    - Desktop Chrome flow (full quote → unlock → report)
    - Desktop Safari flow (Reown AppKit behavior on Safari)
    - Mobile Safari (iPhone) flow
    - Mobile Chrome (Android) flow
    - Long app names render without breaking layout
    - 5 long keywords render without breaking the chips row
    - Free quote state (no wallet connected)
    - Payment required state (wallet connected, unlock pending)
    - Paid report state with explorer link click-through
    - No-data state (`sniffy-no-scent` Lottie + retry guidance)
    - Reduced-motion state (System Settings → Accessibility → Reduce motion → on)
  - Lighthouse run for `sniffy.io/`: capture scores; target Performance > 80, Accessibility > 95
- **Acceptance**:
  - Every row in the browser matrix shows `pass` or a written workaround
  - Lighthouse Accessibility > 95
  - At least one full flow recorded as screen-grab/screenshots for the Phase 09 video (raw frames OK)
- **Out of scope**: do not add E2E browser automation (Playwright) for the hackathon — manual is faster and the judge does a live walk-through; revisit post-MVP
- **References**: `PLAN.md` §18

### 08.p3 — curl examples + API docs page

- **Recommended agent**: `general-purpose`
- **Scope**: `docs/api-examples.md`, optionally a `/docs` page on `landing/`
- **Inputs**:
  - `PLAN.md` §9 (API contract)
  - Live URL from Phase 07
  - Provenance icons used in CLI + frontend
- **Deliverables**:
  - `docs/api-examples.md` with:
    - Sample curl for `GET /sample` and the expected response (truncated)
    - Sample curl for `POST /quote` showing `shallowScan` in the response
    - Sample curl for `POST /diagnose` showing the 402 body
    - Sample curl + Node snippet showing how to sign x402 and retry (use the SDK helper to keep it short)
    - Provenance icon legend
    - Network info: `eip155:2910` Hoodi explorer link, fund instructions
  - Optionally: render the same content as `landing/src/app/docs/page.tsx` so judges can read it from the demo URL without leaving the browser
- **Acceptance**:
  - Every curl example, when copy-pasted into a fresh terminal pointed at the deployed backend, produces the documented output
  - The docs page is reachable from the landing site's footer
- **Out of scope**: do not publish a full OpenAPI spec for MVP (post-MVP enrichment)
- **References**: `PLAN.md` §9

### 08.p4 — Fallback demo script (kill-switch for live providers)

- **Recommended agent**: `general-purpose` (skills: `code-review`)
- **Scope**: `scraper/src/orchestrator/`, env-driven fallback mode
- **Inputs**:
  - `PLAN.md` §14 (reliability — every critical state has fixture fallback)
  - Phase 03 orchestrator
- **Deliverables**:
  - `SNIFFY_DEMO_MODE=fixture` env var that **forces every provider to return fixture-mode immediately**, bypassing live Apple / Play Store calls
  - When the env var is set, `dataProvenance` returns all-`fixture` and the response includes a top-level `demoMode: 'fixture'` flag (the frontend renders a small "Demo fixture mode" badge so the audience knows what they're seeing)
  - A separate `MORPH_FACILITATOR_MODE=fixture` already exists from Phase 01 — combine the two to allow a fully-offline demo if needed
  - Document the kill-switch in `docs/demo-runbook.md`:
    - Pre-demo checklist (verify live URLs)
    - How to flip to fixture mode in Railway (env var change → restart)
    - What the audience sees in fixture mode
    - How to flip back to live after the recording
- **Acceptance**:
  - With `SNIFFY_DEMO_MODE=fixture` set, every `/quote` and `/diagnose` response is fully populated with `provenance: 'fixture'` and the response shape is unchanged (no schema break)
  - The frontend displays the "Demo fixture mode" badge prominently when the flag is present
- **Out of scope**: do not use fixture mode by default in production — it's a kill-switch
- **References**: `PLAN.md` §14

## Phase Verification

```bash
# All deployed surface tests pass and captured in qa-results.md
test -s docs/qa-results.md
grep -E '\| pass \|' docs/qa-results.md | wc -l  # should be high

# curl examples reproduce the documented output
bash docs/api-examples.md.test.sh  # if scripted; otherwise manual

# Kill-switch works
curl -fsS https://api.sniffy.io/api/v1/aso/sample | jq '.sample' | grep -q true
# (Flip SNIFFY_DEMO_MODE=fixture on Railway, restart, verify quote+diagnose return fixture-mode, then flip back)

# Lighthouse on landing
npx -y unlighthouse https://sniffy.io  # check scores
```

## References

- `PLAN.md` §14, §18
- `PLAN.md` §15 (Success Metrics — demo reliability)
- `business-model.md` §6 (metrics we'll watch post-launch — establish baselines here)
- Prior phase: [`07-deployment.md`](./07-deployment.md)
- Next phase: [`09-submission.md`](./09-submission.md)
