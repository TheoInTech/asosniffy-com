# Sniffy Build Docs

Phase-by-phase implementation guides optimized for **parallel AI developer agents**. Each phase doc maps a slice of `PLAN.md` to an executable task list with dependencies, parallelism markers, and a recommended subagent per task.

These docs are **not** a rewrite of `PLAN.md`. They are operational: each doc points back to the PRD for canonical spec and adds dependency wiring, task-level parallelism, recommended subagents, and verifiable acceptance criteria.

## Source of truth

- **`/PLAN.md`** — canonical PRD. Phase docs reference its sections; do not duplicate spec content here.
- **`/CLAUDE.md`** — contributor guide and load-bearing constraints. Every agent must honor these.
- **`docs/business-model.md`** — canonical monetization doc; PLAN.md §24 mirrors it.

## Dependency graph

```
Phase 00 (foundation) ──┬─► Phase 01 (payment)    ──┐
                        ├─► Phase 03 (data)       ──┤
                        ├─► Phase 06 (dist kit)*  ──┤
                        └─► Phase 05 (frontend)   ──┤
                                                    ├─► Phase 02 (core API)** ──┐
                                                    │                            ├─► Phase 07 (deploy) ─► Phase 08 (QA) ─► Phase 09 (submission)
                                                    └─► Phase 04 (scoring)    ──┘
```

\* `@gosniffy/sdk` in Phase 06 derives types from Phase 00 schemas; CLI/MCP can start in parallel with backend work and integration-test later against deployed `scraper`.

\** Phase 02 needs Phase 01 ready for `/diagnose` 402 generation; routes for `/quote` and `/sample` can be scaffolded earlier against fixtures.

## Phase index

| Phase | Title | Status |
|---|---|---|
| [00](./00-foundation.md) | Foundation — workspace, shared Zod schemas, fixtures | not-started |
| [01](./01-payment-adapter.md) | Payment adapter — Morph x402 facilitator, HMAC, receipts | done |
| [02](./02-core-api.md) | Core API — Hono server, `/quote`, `/diagnose`, `/sample` | not-started |
| [03](./03-data-providers.md) | Data providers — Apple, App Store sampling, Android preview, Redis | not-started |
| [04](./04-scoring-and-synthesis.md) | Scoring & synthesis — deterministic scoring, OpenAI, template fallback | not-started |
| [05](./05-frontend-landing.md) | Frontend (landing) — Next.js, wallet UX, Lottie, spend trail | not-started |
| [06](./06-distribution-kit.md) | Distribution kit — SDK, CLI, MCP, `SKILL.md` | not-started |
| [07](./07-deployment.md) | Deployment — Docker, Railway, Vercel, Redis, public-repo flip | not-started |
| [08](./08-qa-and-demo.md) | QA & demo polish — test matrix, fallback script | not-started |
| [09](./09-submission.md) | Submission — video, build diary, 200-word writeup, diagram | not-started |
| [99](./99-post-mvp.md) | Post-MVP roadmap | reference only |
| [biz](./business-model.md) | Business model — pricing, unit economics, GTM | reference for 01/02/04/05/06/09 |

## How to dispatch parallel agents

A coordinating agent (human or model) follows this loop:

1. **Read this README first** to load the dependency graph and constraints.
2. **Pick the next phase** where every entry in `Depends on` is `done`.
3. **Open that phase's doc.** Within it:
   - Run anything under `Sequential Tasks` for that phase first, in listed order.
   - Then dispatch every `Parallelizable Tasks` entry in parallel, **one agent per task**. Use each task's `Recommended agent:` line to choose the subagent and pass the task's `Inputs`, `Deliverables`, `Acceptance`, `Out of scope`, and `References` as the briefing.
4. **Run `Phase Verification`** when all tasks return. Only then flip the phase status from `in-progress` to `done` in two places: the phase doc and the index above.
5. **Repeat** from step 2.

Phases higher in the graph that share a `Depends on` can themselves be worked in parallel. For example, after Phase 00 completes, Phases 01, 03, 05, and 06 can all start concurrently — different agents on different folders.

## Subagent assignment map

| Area | Recommended subagent | Supporting skills |
|---|---|---|
| Morph facilitator, x402 protocol, EIP-712/3009, receipts | `morph-x402-engineer` | `x402-payments`, `morph-network` |
| Backend (Hono routes, Zod, scoring, data providers, SDK/CLI/MCP code) | `principal-backend-engineer` | `senior-backend`, `hono`, `api-security-best-practices` |
| Frontend (Next.js, Tailwind, Lottie, Reown AppKit) | `principal-frontend-engineer` | `senior-frontend`, `next-best-practices`, `frontend-design` |
| Deployment, Docker, Railway, Vercel, secrets | `principal-devsecops-architect` | `senior-devops`, `docker-expert` |
| AI synthesis prompts | `principal-backend-engineer` | `claude-api`, `senior-backend` |
| Open-ended research (Morph `/v2/supported`, token EIP-712 fields) | `Explore` / `general-purpose` | `morph-network`, `firecrawl-search` |
| QA, demo verification, code review | `general-purpose` | `code-review` |
| Submission assets (video, posts, writeup) | `general-purpose` | — |

## Load-bearing constraints (repeat for every agent)

These are non-obvious decisions that will trip up a cold agent. Repeat them at the top of any new agent briefing:

- **No relational database.** Storage = fixture JSON + in-memory + Redis (Upstash or Railway).
- **Official Morph facilitator** at `https://morph-rails.morph.network/x402`. Default network: Morph Hoodi (`eip155:2910`, chain ID 2910).
- **`/api/v1/aso/diagnose` must return a real HTTP 402** with machine-readable x402 payment requirements. A mocked/UI-only paywall fails the hackathon track fit.
- **`/api/v1/aso/sample` must always work** even when every live provider is down.
- **`/api/v1/aso/quote` includes `shallowScan`** (detected app, category, ratings, one preview keyword bucket). Recommendations, full keyword diagnosis, competitor trail, metadata score, and ready-to-paste content stay paid-only.
- **Every report field carries a provenance label**: `live`, `cached`, `fixture`, or `inferred`.
- **iOS-first.** Android is preview-quality only — lower-confidence labels, fixture fallback acceptable.
- **MIT licensed.** Verify no secrets in commit history before flipping the repo public.
- **Voice**: playful in UI (`sniff test`, `scent trail`, `metadata suspects`); clean and professional in API field names, JSON keys, MCP tool names, CLI command names, and error messages.

## Business model

`business-model.md` is the canonical operational doc for pricing, unit economics, and the revenue roadmap. `PLAN.md` §24 mirrors it. Phase docs **01, 02, 04, 05, 06, and 09** cross-link to it for pricing and distribution decisions — read the relevant section before making product or copy decisions in those phases.

## Updating phase status

When a phase moves between states:

1. Edit `## Status & Dependencies` in the phase doc.
2. Edit the corresponding row in the **Phase index** table above.
3. Mention the change in the PR description so reviewers can verify the `Phase Verification` block passed.

Status values: `not-started` → `in-progress` → `done`. A phase that is blocked goes back to `in-progress` with a note explaining the blocker.
