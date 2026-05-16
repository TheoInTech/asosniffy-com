# Phase 09: Submission

> **Pitch framing**: The 200-word write-up and demo video both emphasize the **agent-buyable revenue model** ([`business-model.md` §1](./business-model.md#1-revenue-thesis), `PLAN.md` §24.1), not just the technology demo. The submission story is "an HTTP resource agents can pay for one call at a time", not "we wrapped ASO in crypto."

## Goal

Land every artifact the hackathon submission needs: a 2-minute demo video, three build-diary posts, the 200-word writeup, the architecture diagram, and smoke-tested install paths for each agent surface in §22. After this phase, the project is judge-ready.

## Status & Dependencies

- **Status**: not-started
- **Depends on**:
  - Phase 07 — public URLs reachable, repo public
  - Phase 08 — QA matrix passed, fallback runbook ready
- **Blocks**: nothing — this is the final phase
- **Can run in parallel with**: nothing (recordings reference verified state)

## Parallelizable Tasks

### 09.p1 — Demo video (2 minutes)

- **Recommended agent**: `general-purpose` (producer/director role; the agent helps script + storyboard, the human records)
- **Scope**: `docs/demo-video-script.md`, recording + edit
- **Inputs**:
  - `PLAN.md` §15 (Success Metrics), §20 (Demo Video Structure)
  - `business-model.md` §1 (agent-buyable thesis — first 30s framing)
  - Phase 08 verified surface
- **Deliverables**:
  - `docs/demo-video-script.md` with shot-by-shot script matching `PLAN.md` §20:
    - **0:00–0:30 — Problem framing**: "Agents need paid app-market intelligence without subscriptions or API contracts. This is the x402 use case." Title card with Sniffy mascot.
    - **0:30–1:00 — Free quote + `shallowScan`**: paste an App Store URL, run free sniff, show the shallow scan with provenance icons. Verbal: "Here is the value-before-wallet preview."
    - **1:00–1:30 — Raw 402 → x402 unlock → paid report**:
      - Show the curl returning HTTP 402 with the payment requirements body (live terminal split-screen with the browser)
      - Show the wallet flow in the browser: connect Reown AppKit on Hoodi, click "Unlock full trail", sign, wait
      - Show the receipt + transaction hash + click-through to Hoodi explorer
      - Show the paid report rendered with the spend trail panel
    - **1:30–2:00 — Next steps + agent surfaces**:
      - Show the same flow from the CLI: `npx sniffy diagnose ... -k ...` running, formatted output
      - Show the MCP server installed in Claude Desktop, agent invoking `sniffy_diagnose` autonomously
      - Voiceover: "Indie hackers get a co-pilot. Agents get a paid API. Same endpoint, same JSON, same x402 on Morph."
  - Recorded `demo.mp4` (or hosted on YouTube unlisted / Loom)
  - Captions auto-generated and reviewed
- **Acceptance**:
  - Video is exactly 2:00 or under
  - Every claim in the script can be verified against the live surface
  - Audio is clear; no whispered debug talk; no unresolved errors in the recording
- **Out of scope**: do not record a longer "deep dive" cut for the submission — keep one focused 2-minute video; the deep dive can be a post-MVP follow-up
- **References**: `PLAN.md` §15, §20

### 09.p2 — 200-word write-up

- **Recommended agent**: `general-purpose`
- **Scope**: `docs/submission-writeup.md`
- **Inputs**:
  - `PLAN.md` §20 (existing draft)
  - `business-model.md` §1 (revenue thesis)
- **Deliverables**:
  - Refined version of the `PLAN.md` §20 draft. Strengthen by:
    - Open with the agentic-payment thesis (not the ASO problem)
    - Cite the concrete on-chain artifact: "Each `/diagnose` returns a transaction hash on Morph Hoodi explorer..."
    - Close with the four agent surfaces (SKILL.md, MCP, CLI, SDK)
    - Word count strictly ≤ 200
  - Saved as `docs/submission-writeup.md` and copy-pasted into the hackathon submission form
- **Acceptance**:
  - `wc -w docs/submission-writeup.md` ≤ 200
  - The first sentence mentions agentic payments / x402, not ASO
- **Out of scope**: do not write a long-form writeup; submit-form only
- **References**: `PLAN.md` §20; `business-model.md` §1

### 09.p3 — Architecture diagram

- **Recommended agent**: `general-purpose` (skills: optional `imagegen` if rasterizing)
- **Scope**: `docs/architecture.md`, optionally `docs/architecture.png`
- **Inputs**:
  - `PLAN.md` §10 (Mermaid diagram)
  - Live deployment topology from Phase 07
- **Deliverables**:
  - `docs/architecture.md` containing the Mermaid diagram from `PLAN.md` §10, plus:
    - An overlay listing the deployed URLs (Railway `https://api.sniffy.io`, Vercel `https://sniffy.io`, Upstash Redis region)
    - A second diagram showing the x402 payment flow (client → 402 → sign → retry → verify → settle → receipt)
  - Exported PNG for the submission form / social posts
- **Acceptance**:
  - Diagram renders correctly in GitHub's Mermaid preview
  - PNG is high-resolution enough to read at standard Twitter/X preview size
- **Out of scope**: do not over-design — clarity > polish for hackathon judges
- **References**: `PLAN.md` §10

### 09.p4 — Build-diary posts (3 posts)

- **Recommended agent**: `general-purpose`
- **Scope**: `docs/build-diary/`
- **Inputs**:
  - `PLAN.md` §20 (build diary structure)
  - `business-model.md` (for Post 2 framing)
- **Deliverables**:
  - `docs/build-diary/post-1.md` — "Problem, product story, and Sniffy mascot": position the agent-buyable thesis, introduce the mascot, link to live demo. Use hashtags `#MorphBuildSprint` and `#MorphBuildPH`.
  - `docs/build-diary/post-2.md` — "Morph x402 quote/unlock architecture": show the 402 → sign → retry → settle flow, the Hoodi explorer link, a screenshot of the receipt panel. Reference `business-model.md` §1 for the revenue model.
  - `docs/build-diary/post-3.md` — "Live ASO report and agent-readable API": show the paid report, the CLI invocation, the MCP install. Close with the four agent surfaces.
  - Each post is platform-ready (X / LinkedIn) with a screenshot
- **Acceptance**:
  - Three posts saved as Markdown
  - Each post under 280 characters for X (a longer LinkedIn variant per post is fine)
  - Hashtags present
- **Out of scope**: do not publish on schedule — let the human pick the timing
- **References**: `PLAN.md` §20

### 09.p5 — Install smoke-tests + README finalization

- **Recommended agent**: `general-purpose`
- **Scope**: `README.md` at repo root, verification of each install path
- **Inputs**:
  - `PLAN.md` §22.6 (install commands)
  - `PLAN.md` §23.4 (README requirements)
  - Phase 07 + Phase 08 outputs
- **Deliverables**:
  - Updated repo-root `README.md` with:
    - Hero block: tagline, live demo link, hackathon track badge
    - "Install" section listing the three one-liners verbatim from `PLAN.md` §22.6:
      - `npx skills add TheoInTech/asosniffy-com`
      - `npm i @sniffy/sdk`
      - `npx @sniffy/cli quote <url> -k <keywords>`
      - The MCP config snippet for Claude Desktop / Cursor
    - "Try it" — link to the live demo + the `/sample` curl
    - "Docs" — link to the `docs/` folder
    - "Architecture" — embed the diagram from 09.p3
    - "Business model" — one-line summary linking to `docs/business-model.md`
    - "License" — MIT badge
  - Smoke-test each install path on a fresh machine / sandbox:
    - `npx skills add TheoInTech/asosniffy-com` in a fresh Claude Code project
    - `npm i @sniffy/sdk` in a blank Node project + run a smoke call against `https://api.sniffy.io`
    - `npx @sniffy/cli sample --base-url https://api.sniffy.io`
    - Claude Desktop config snippet → restart Claude Desktop → invoke `sniffy_sample`
  - Capture results in `docs/install-smoke-tests.md`
- **Acceptance**:
  - All four install paths succeed on a fresh environment
  - README renders cleanly on GitHub (preview before merging)
  - The Vercel skills install command works inside Claude Code
- **Out of scope**: do not publish a Cursor `.cursorrules` snippet yet (post-MVP, see `99-post-mvp.md`)
- **References**: `PLAN.md` §22.6, §23.4

## Phase Verification

```bash
# Submission artifacts exist
test -s docs/demo-video-script.md
test -s docs/submission-writeup.md
test -s docs/architecture.md
test -s docs/build-diary/post-1.md
test -s docs/build-diary/post-2.md
test -s docs/build-diary/post-3.md
test -s docs/install-smoke-tests.md

# Write-up is ≤ 200 words
test $(wc -w < docs/submission-writeup.md) -le 200

# Install paths verified
grep -q "passed" docs/install-smoke-tests.md  # each row shows passed

# Public demo accessible without login
curl -fsS -o /dev/null https://sniffy.io/

# Public API sample accessible without auth
curl -fsS -o /dev/null https://api.sniffy.io/api/v1/aso/sample

# SKILL.md install path works
mkdir -p /tmp/skill-final && cd /tmp/skill-final && npx -y skills add TheoInTech/asosniffy-com
```

## References

- `PLAN.md` §15, §20
- `PLAN.md` §22.6 — install commands
- `PLAN.md` §23.4 — README requirements
- `business-model.md` §1, §5
- Prior phase: [`08-qa-and-demo.md`](./08-qa-and-demo.md)
- Reference doc: [`99-post-mvp.md`](./99-post-mvp.md)
