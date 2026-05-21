# Phase 04: Scoring & Synthesis

> **Unit-economics note**: OpenAI synthesis is the **dominant variable cost** per paid `/diagnose` call (~$0.005–$0.020). See [`business-model.md` §3](./business-model.md#3-unit-economics) and `PLAN.md` §24.3. Keep prompt size disciplined; model choice and prompt length determine gross margin. Always tag synthesized output with `provenance: 'inferred'`.

## Goal

Turn the structured provider output from Phase 03 into the paid-report sections (keyword diagnosis, competitor trail, metadata score, recommendations, ready-to-paste content) in `PLAN.md` §9. Deterministic scoring runs first; AI synthesis adds founder-readable narrative on top; a template-only fallback runs when no OpenAI key is configured.

## Status & Dependencies

- **Status**: not-started
- **Depends on**:
  - Phase 00 — `@sniffy/scraper` report schemas (`KeywordDiagnosis`, `CompetitorTrail`, `MetadataScore`, `Recommendation`, `ReadyToPaste`)
  - Phase 03 — `getFullReportData(...)` orchestrator output
- **Blocks**: Phase 02 `/diagnose` paid response gets its content from here (Phase 02 was scaffolded against fixture; this phase swaps in the real synthesis); Phase 08 (QA tests report quality)
- **Can run in parallel with**: Phases 01, 05, 06

## Parallelizable Tasks

### 04.p1 — Deterministic metadata scoring

- **Recommended agent**: `principal-backend-engineer` (skills: `senior-backend`)
- **Scope**: `scraper/src/scoring/`
- **Inputs**:
  - Phase 03 `ReportInput` shape (app metadata + per-keyword rank samples + competitor candidates)
  - `PLAN.md` §9 (`metadataScore` shape), §11 (provenance)
- **Deliverables**:
  - `scraper/src/scoring/metadata.ts` — `scoreMetadata({ app, keywords })` producing:
    - `titleScore`: keyword coverage in title (does title use top-intent keyword?), length appropriateness (Apple title cap is 30 chars), keyword stuffing penalty
    - `subtitleScore`: same logic on subtitle (Apple cap 30 chars)
    - `keywordsFieldScore`: estimated coverage in the 100-char keywords field (if available — this is an App Store Connect field, not always visible publicly; mark `provenance: 'inferred'`)
    - `descriptionScore`: keyword density and call-to-action heuristic
    - `overallScore`: weighted average, 0–100 integer
    - Each subscore returns `{ value: number; reasons: string[] }` so the synthesis layer can verbalize the deterministic findings
  - `scraper/src/scoring/keyword-diagnosis.ts` — per-keyword: combines provider rank bucket with metadata coverage to produce a `KeywordDiagnosis[]` entry with `keyword`, `rankBucket`, `intentScore` (low/medium/high heuristic), `coverageInTitle`, `coverageInSubtitle`, `recommendation` (`add_to_title` | `add_to_subtitle` | `keep_in_keywords_field` | `drop`)
  - `scraper/src/scoring/competitors.ts` — given the search-result overlap from Phase 03, rank top-3 competitor apps for each keyword with an `overlapScore` and a list of unique keywords each competitor ranks for that the target app misses
  - **All outputs tagged `provenance: 'inferred'`** (scoring is a derivation, not a fetch)
  - Unit tests covering each rule (title length cap, keyword in title bonus, density penalty)
- **Acceptance**:
  - `scoreMetadata({ app: <fixture>, keywords: ['habit tracker'] })` returns a structurally valid `MetadataScore` with `overallScore` in [0, 100]
  - Each subscore's `reasons[]` is non-empty so synthesis has material to work with
  - Result is deterministic — same input always produces same output
- **Out of scope**: do not call OpenAI from this module — scoring is pure deterministic logic; do not synthesize ready-to-paste content here (04.p2/p3 own that)
- **References**: `PLAN.md` §9, §11

### 04.p2 — OpenAI synthesis layer

- **Recommended agent**: `principal-backend-engineer` (skills: `claude-api`, `senior-backend`) — note: `claude-api` skill covers Anthropic but the prompt-engineering and token-cost discipline apply to OpenAI work too; supplement with OpenAI's own docs via Context7 if needed
- **Scope**: `scraper/src/synthesis/openai.ts`
- **Inputs**:
  - Output of 04.p1 deterministic scoring
  - `PLAN.md` §9 (`summary`, `recommendations`, `readyToPaste` shapes)
  - `PLAN.md` §13 (voice — clean and professional in report content; playful is for UI only)
  - `business-model.md` §3 (OpenAI cost discipline)
- **Deliverables**:
  - `synthesizeReport({ scoringResult, reportInput, model })` that produces:
    - `summary`: 2–4 sentence founder-readable narrative summarizing the scoring findings
    - `recommendations`: ranked array of 3–5 next-action items, each with `action`, `rationale`, `expectedImpact: 'high'|'medium'|'low'`
    - `readyToPaste`: title, subtitle, keywords-field text, short-description suggestions, **each constrained to App Store character limits**
  - Prompt template lives in `scraper/src/synthesis/prompts/full-report.ts` as a typed string template. Keep prompt under ~1500 tokens; pass scoring output as JSON, not prose, so the model can read it efficiently
  - Use `gpt-5.4-mini` by default (current marketed lineup, ~$0.003 per call — 2× under the §24.3 budget); allow override via `OPENAI_MODEL` env var (e.g. `gpt-4o-mini` at ~$0.0004/call for maximum margin)
  - Response is JSON (use OpenAI's JSON mode); validate against the Zod schemas for `Recommendation` and `ReadyToPaste` before returning. On parse failure, fall through to the template fallback (04.p3)
  - **All outputs tagged `provenance: 'inferred'`**
  - Cost telemetry: log `{ requestId, modelInputTokens, modelOutputTokens, costUsd }` per call (for the `business-model.md` §6 dashboard)
  - Tests covering: happy path (mocked OpenAI response), JSON parse failure (falls through to fallback), schema validation failure (also falls through), missing API key (uses fallback directly)
- **Acceptance**:
  - `synthesizeReport(...)` with mocked OpenAI returns valid `Recommendation[]`, `ReadyToPaste`, and `summary`
  - When `OPENAI_API_KEY` is unset, the function delegates to 04.p3 and **does not throw**
  - Token-cost log line is emitted for every call
- **Out of scope**: do not implement a streaming response (the API is request/response); do not fine-tune or use a Claude model for this (cost target favors a `gpt-5.4-mini`-class OpenAI mini model); do not synthesize the deterministic `metadataScore` fields — those come from 04.p1 unchanged
- **References**: `PLAN.md` §9, §13; `business-model.md` §3; `claude-api` skill (for prompt-engineering discipline)

### 04.p3 — Template-only fallback synthesis

- **Recommended agent**: `principal-backend-engineer` (skills: `senior-backend`)
- **Scope**: `scraper/src/synthesis/template.ts`
- **Inputs**:
  - Output of 04.p1 deterministic scoring
  - `PLAN.md` §9 response shape
- **Deliverables**:
  - `synthesizeReportTemplate({ scoringResult, reportInput })` that:
    - Composes a `summary` using deterministic phrases keyed off the scoring `reasons[]` (template-string-builder pattern)
    - Generates `recommendations` deterministically from the keyword diagnosis (`add_to_title` → "Add '<keyword>' to your title — currently rank bucket <rankBucket>")
    - Generates `readyToPaste` by templating the existing app metadata with the top recommended keyword woven in
  - **Output is structurally identical to 04.p2** so the orchestrator can swap them without code changes
  - **All outputs tagged `provenance: 'inferred'`**
  - Tests asserting the output validates against `Recommendation` and `ReadyToPaste` schemas
- **Acceptance**:
  - `synthesizeReportTemplate(<fixture scoring result>)` returns a complete, schema-valid response
  - The output is deterministic and identical across repeated calls for the same input
  - When `OPENAI_API_KEY` is unset, the full `/diagnose` paid response is still useful (this is the reliability guarantee in `PLAN.md` §14 + the no-AI-required path in `PLAN.md` §10)
- **Out of scope**: do not call OpenAI from this module (the whole point is no external dependency)
- **References**: `PLAN.md` §9, §10, §14

### 04.p4 — Report orchestrator + provenance assembly

- **Recommended agent**: `principal-backend-engineer` (skills: `senior-backend`)
- **Scope**: `scraper/src/orchestrator/report.ts`
- **Inputs**:
  - Phase 03 `getFullReportData(...)`
  - 04.p1 scoring functions
  - 04.p2 OpenAI synthesis
  - 04.p3 template fallback
- **Deliverables**:
  - `generateReport({ store, app, country, keywords, competitors }): Promise<ReportPayload>` that:
    1. Calls `getFullReportData(...)` from Phase 03
    2. Calls deterministic scoring (04.p1)
    3. Tries OpenAI synthesis (04.p2); on failure or missing key, falls through to template synthesis (04.p3)
    4. Assembles the full paid-response report sections
    5. Builds the `dataProvenance` block by combining per-section provenance from the data layer + tagging synthesized sections as `inferred`
  - This is the function Phase 02's `/diagnose` route called as `generateReport(...)` while scaffolded against fixture — **replace the fixture-backed implementation with this real one**
  - End-to-end test: mocked Apple + mocked OpenAI → full schema-valid paid response with mixed provenance
- **Acceptance**:
  - `generateReport({...valid input...})` returns a `ReportPayload` that the `/diagnose` route handler embeds into the paid response unchanged
  - `dataProvenance` accurately reflects which sections were live vs cached vs fixture vs inferred (no section silently mislabeled)
- **Out of scope**: do not handle payment here (Phase 02 wraps this with the x402 flow); do not add a database
- **References**: `PLAN.md` §9, §10, §11, §14

## Phase Verification

```bash
# All synthesis tests pass
pnpm --filter @sniffy/scraper test -- scoring synthesis orchestrator.report

# Deterministic scoring is deterministic
pnpm --filter @sniffy/scraper test -- scoring.determinism

# Template fallback path works without OPENAI_API_KEY set
OPENAI_API_KEY= pnpm --filter @sniffy/scraper test -- synthesis.template

# End-to-end paid response is schema-valid
pnpm --filter @sniffy/scraper dev &
sleep 2
curl -sS -X POST localhost:3001/api/v1/aso/diagnose \
  -H "Content-Type: application/json" \
  -H "PAYMENT-SIGNATURE: <mocked-valid-header>" \
  -d '{"store":"ios","app":"https://apps.apple.com/us/app/duolingo/id570060128","country":"US","keywords":["language"],"sniffId":"sniff_test"}' \
  | jq '.dataProvenance.recommendations' | grep -q '"inferred"'
```

## References

- `PLAN.md` §9, §10 (Scoring and AI Synthesis), §11, §13 (voice), §14
- `PLAN.md` §24.3 — Unit economics (OpenAI cost dominates)
- `business-model.md` §3, §6 (metrics)
- `CLAUDE.md` "Load-Bearing Constraints"
- Prior phase: [`03-data-providers.md`](./03-data-providers.md)
- Next phase: [`05-frontend-landing.md`](./05-frontend-landing.md)
