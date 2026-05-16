# Phase 03: Data Providers

## Goal

Build the data layer that feeds `/quote` (shallowScan) and `/diagnose` (full report): Apple iTunes provider, App Store page sampling for keyword rank, Android preview provider, Redis-backed cache, and the fixture-fallback orchestration that keeps `/sample` and weak-data states reliable. Every output is tagged with a provenance label.

## Status & Dependencies

- **Status**: not-started
- **Depends on**:
  - Phase 00 — `@sniffy/scraper` schemas (`Provenance`, `Coverage`, `Confidence` enums; report sub-schemas)
  - Phase 00 — fixture JSON (the fallback source)
- **Blocks**: Phase 04 (scoring needs structured input from providers), Phase 08 (QA covers weak-data states)
- **Can run in parallel with**: Phases 01 (payment), 02 (core API can scaffold against fixture-backed interfaces), 05 (frontend), 06 (distribution kit)

## Parallelizable Tasks

All tasks below are independent. The cache layer (03.p4) is consumed by the providers but has no upstream dependency itself, so it can be developed alongside them. Each provider implements the same interface so the orchestrator can swap them.

### 03.p1 — Apple iTunes provider (lookup + search)

- **Recommended agent**: `principal-backend-engineer` (skills: `senior-backend`, `api-security-best-practices`)
- **Scope**: `scraper/src/providers/apple/`
- **Inputs**:
  - `PLAN.md` §11 (Data Requirements — iOS first)
  - `@sniffy/scraper` schemas for the data shapes the orchestrator expects
- **Deliverables**:
  - `scraper/src/providers/apple/itunes.ts`:
    - `lookupApp({ id, country }): Promise<AppRecord>` → `https://itunes.apple.com/lookup?id=...&country=...`
    - `searchApps({ term, country, limit }): Promise<AppRecord[]>` → `https://itunes.apple.com/search?term=...&entity=software&country=...&limit=...`
    - `normalizeAppIdentifier(input): { id?: string; name?: string }` — parses App Store URLs (`apps.apple.com/.../id123456789`), bare numeric IDs, or free-text names
  - `scraper/src/providers/apple/types.ts` — `AppRecord` shape with name, developer, primary category, ratings summary, screenshots, subtitle, description, current version
  - Rate-limit handling: detect HTTP 403/429, return `{ source: 'apple', error: 'rate_limited' }` and let the orchestrator fall back to cache or fixture
  - Each return value tagged with `provenance: 'live'` when fetched, `provenance: 'cached'` when read from cache (handled by the cache wrapper, not this module)
  - Unit tests with `msw` or `nock` mocking the iTunes endpoints
- **Acceptance**:
  - `lookupApp({ id: '284882215', country: 'US' })` returns a non-empty record (live test, opt-in via `RUN_LIVE_TESTS=1`)
  - `normalizeAppIdentifier('https://apps.apple.com/us/app/example/id123456789')` returns `{ id: '123456789' }`
  - `normalizeAppIdentifier('id987654321')` returns `{ id: '987654321' }`
  - `normalizeAppIdentifier('Habit Tracker')` returns `{ name: 'Habit Tracker' }`
- **Out of scope**: do not implement keyword rank sampling (03.p2); do not call App Store Connect (post-MVP per PLAN.md §11); do not scrape Apple HTML in this module
- **References**: `PLAN.md` §11

### 03.p2 — App Store keyword rank sampling

- **Recommended agent**: `principal-backend-engineer` (skills: `senior-backend`, `api-security-best-practices`)
- **Scope**: `scraper/src/providers/apple/keyword-rank.ts`
- **Inputs**:
  - `PLAN.md` §11 (public App Store sampling)
  - `PLAN.md` §14 (weak-data states must produce useful next steps, not errors)
- **Deliverables**:
  - `sampleKeywordRank({ keyword, country, appId, depth = 50 })` that:
    - Queries `iTunes search` for the keyword (entity=software) with a configurable limit (1–200)
    - Finds the target `appId` in the results and returns its position
    - Buckets the rank as `1-10`, `11-30`, `31-50`, `51-100`, `100+`, or `not_found`
    - Returns `{ keyword, rankBucket, confidence: 'medium' | 'low', provenance: 'live' | 'cached' }`
    - `confidence` is `medium` if the search returned a full page, `low` if truncated or partial
  - Robust handling for: empty results (`not_found`), rate-limited responses (fall through to cache/fixture), HTML 403 responses if Apple gates the request
  - Unit tests covering each rank bucket boundary
- **Acceptance**:
  - `sampleKeywordRank({ keyword: 'habit tracker', country: 'US', appId: '123456789' })` returns a typed result with a valid `rankBucket`
  - `not_found` is a normal return value, **not an exception** (per `PLAN.md` §14)
- **Out of scope**: do not implement competitor detection from search results here — that's a Phase 04 derivation; do not estimate keyword volume (no such public source exists for free)
- **References**: `PLAN.md` §11, §14

### 03.p3 — Android preview provider

- **Recommended agent**: `principal-backend-engineer` (skills: `senior-backend`)
- **Scope**: `scraper/src/providers/android/`
- **Inputs**:
  - `PLAN.md` §11 (Android Preview — lower-confidence labels, fixture fallback acceptable)
- **Deliverables**:
  - `scraper/src/providers/android/play-store.ts`:
    - `lookupAppPreview({ packageName, country })` — best-effort Play Store lookup
    - `searchAppsPreview({ term, country })` — best-effort search
  - **All return values carry `confidence: 'low'` and `provenance: 'live' | 'cached' | 'fixture'`**. The README and CLI must surface these distinctions visually.
  - Captcha / 403 detection: when blocked, return `{ source: 'android', status: 'blocked', fallback: 'fixture' }` and let the orchestrator decide
  - Tests: mocked Play Store HTML in a fixture, parser smoke test
- **Acceptance**:
  - When mocked Play Store returns a valid response, the provider returns a typed `AndroidAppPreview` record
  - When mocked Play Store returns a 403, the provider does **not** throw — it returns the blocked status
- **Out of scope**: do not promise full Android rank accuracy (per `PLAN.md` §11); do not use a paid Play Store data provider
- **References**: `PLAN.md` §11, §14

### 03.p4 — Redis cache layer + key strategy

- **Recommended agent**: `principal-backend-engineer` (skills: `senior-backend`)
- **Scope**: `scraper/src/cache/`
- **Inputs**:
  - `PLAN.md` §10 (Cache and Fixture Layer; Redis-compatible, Upstash or Railway)
  - `business-model.md` §3 (cache hit ratio is the unit-economics lever)
- **Deliverables**:
  - `scraper/src/cache/redis.ts` — Redis client wrapper using `@upstash/redis` (Upstash Redis is preferred per `PLAN.md` §10). Falls back to in-memory `Map` when `REDIS_URL` is unset, so local dev works with no infra.
  - `scraper/src/cache/keys.ts` — deterministic key builder per `CLAUDE.md`:
    - `cacheKey({ store, country, appId, keywords[], providerVersion, reportVersion })` — sort keywords alphabetically; concatenate with `:`; hash if too long
  - `scraper/src/cache/wrapper.ts` — `withCache(fn, { ttlSeconds, keyParts })` higher-order function that wraps any provider call and **automatically rewrites provenance from `live` to `cached` on cache hit**
  - TTL defaults: app metadata 24h, keyword rank 6h, Android preview 12h, full report 1h
  - Cache hit/miss counter exported for the metrics required in `business-model.md` §6
  - Unit tests: cache miss → calls provider once; cache hit → calls provider zero times; provenance rewriting on hit
- **Acceptance**:
  - `withCache(provider.lookupApp, ...)` called twice with the same args calls `provider.lookupApp` exactly once
  - Output of second call has `provenance: 'cached'`
  - When `REDIS_URL` is unset, in-memory mode still works (no crashes, no Redis network calls)
- **Out of scope**: do not implement cache invalidation by report version yet (cache keys include `reportVersion`, which handles this implicitly); do not persist cache to disk
- **References**: `PLAN.md` §10; `business-model.md` §3

### 03.p5 — Provider orchestrator + fixture fallback chain

- **Recommended agent**: `principal-backend-engineer` (skills: `senior-backend`)
- **Scope**: `scraper/src/orchestrator/data.ts`
- **Inputs**:
  - All four provider modules above
  - `scraper/fixtures/sample-report.json` for the fallback
  - `PLAN.md` §10 (Agent Orchestrator), §14 (reliability — every critical state has fixture fallback)
- **Deliverables**:
  - `getDetectedApp({ store, app, country }): Promise<{ data, provenance }>` — tries: Apple lookup → Apple search by name → fixture. Provenance reflects which path won.
  - `getShallowScan({ app, country, previewKeyword }): Promise<ShallowScan>` — combines `getDetectedApp` + a single keyword-rank sample for the preview keyword. **Returns paid-only fields as undefined** (per `CLAUDE.md` constraints).
  - `getFullReportData({ app, country, keywords, competitors }): Promise<ReportInput>` — calls keyword-rank for each keyword, derives competitor candidates from search results overlap, returns the structured input that Phase 04 scoring consumes
  - **Every nested value carries its own provenance**. The orchestrator does not collapse provenance to a single label — `dataProvenance.appMetadata` and `dataProvenance.keywordRank` may differ.
  - Tests covering: all live (`provenance` = `live`), Apple rate-limited (`appMetadata` falls back to `cached`), all providers down (every section falls back to `fixture`)
- **Acceptance**:
  - When Apple is mocked to return data, `getDetectedApp` returns it with `provenance: 'live'`
  - When Apple is mocked to return 429, `getDetectedApp` returns cached data if present, otherwise fixture, with appropriate provenance
  - **When all live providers are mocked to fail, `getShallowScan` and `getFullReportData` still return a valid response, all marked `provenance: 'fixture'`** (load-bearing for `/sample` and weak-data UX)
- **Out of scope**: do not call OpenAI from here (Phase 04 does that); do not synthesize recommendations (Phase 04)
- **References**: `PLAN.md` §10, §11, §14

## Phase Verification

```bash
# Provider unit tests pass
pnpm --filter @sniffy/scraper test -- providers

# Cache wrapper rewrites provenance correctly
pnpm --filter @sniffy/scraper test -- cache

# Orchestrator falls back to fixture under provider failure
pnpm --filter @sniffy/scraper test -- orchestrator.fallback

# Live tests (optional)
RUN_LIVE_TESTS=1 pnpm --filter @sniffy/scraper test -- apple.live

# End-to-end: /quote returns live shallowScan when Apple is reachable
pnpm --filter @sniffy/scraper dev &
sleep 2
curl -sS -X POST localhost:3001/api/v1/aso/quote \
  -H "Content-Type: application/json" \
  -d '{"store":"ios","app":"https://apps.apple.com/us/app/duolingo/id570060128","country":"US","keywords":["language"]}' \
  | jq '.shallowScan.previewKeyword.provenance' | grep -q '"live"'
```

## References

- `PLAN.md` §8, §9, §10 (Data Provider Layer, Cache and Fixture Layer), §11, §14
- `business-model.md` §3 (cache hit ratio drives gross margin)
- `CLAUDE.md` "Load-Bearing Constraints" (provenance labels, fixture fallback)
- Prior phase: [`02-core-api.md`](./02-core-api.md)
- Next phase: [`04-scoring-and-synthesis.md`](./04-scoring-and-synthesis.md)
