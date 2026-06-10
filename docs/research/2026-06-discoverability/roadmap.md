# Making Sniffy the Best Discoverability Tool for Indie Hackers & AI Agents

> **Amended 2026-06-10 after the Wave 0.2 verification sprint** (`verification-verdicts.md`). Nothing blocked; three claims reframed — corrections inline, marked **[V-corrected]**: screenshot-caption OCR is contested (conversion lever, not a rank fact); the LLM-visibility moat narrows to "only per-request/agent-buyable probe" (LLM Pulse exists at €49/mo); the absence claim narrows to "no agent-payable ASO *diagnosis*, no agent-payable *iOS* data" (x402 Play raw-data endpoints exist on Base). Play Core Value thresholds CONFIRMED on canonical Google URLs.

## Context

Sniffy today is a solid **store-search ASO auditor**: keyword rank sampling, difficulty, metadata scoring, localization gaps, competitor overlap, review keyword mining, ready-to-paste copy — all from free public data, paid per-request over x402, distributed via SKILL.md/MCP/CLI/SDK.

The question this plan answers: **what would make our scrape, results, insights, and recommendations the best** for indie hackers, solo founders, and AI coding agents whose apps need to be *discovered* and then *convert* — across App Store, Play Store, web search, and LLM recommendation surfaces.

Grounding (2026-06-10):
1. Full inventory of Sniffy's current signal surface (Explore agent).
2. 10-dimension firecrawl research sweep (Apple ranking, Play ranking, store conversion, 3 competitor tiers, LLM discoverability, programmatic SEO, keyword methodology, ratings/reviews — 141 sourced findings, 68 opportunities) + gap-analysis + first-principles synthesis + adversarial completeness critique. Workflow `wf_1b003380-826`.

**Research artifacts (ephemeral /tmp — persist in Wave 0, step 1):**
- Split corpus: `/tmp/sniffy-research/{gap-analysis,fp-model,critique,research-*}.md` (13 files, ~270 KB)
- Full JSON: `/private/tmp/claude-501/-Users-theointech-Projects-ASOSniffy-asosniffy-com/8dc72fd7-afc5-4f40-bd30-79ba55665096/tasks/wzs024ktj.output`

### Decisions taken with the user (2026-06-10)
- **Scope: full discoverability** — store + landing-page SEO + LLM visibility, new product surfaces included.
- **Timeline: best-product long game** — ignore the hackathon clock; sequence over weeks.
- **LLM/vision budget: allowed where unit economics hold** — vision/LLM signals OK on standard/expert tiers when per-request API cost stays well under tier price; quick tier stays deterministic.

### Standing constraints (unchanged)
No relational DB (Redis + fixtures); provenance on every field; free/cheap data only (no data licenses); iOS-first; official Morph facilitator; agent-buyable API is the product; API contract changes update PLAN.md §9 + SDK in the same PR.

### Assumption (state in PLAN.md, revisit if challenged)
**Games are out of the ICP for now.** Games discovery is browse/event/featuring-heavy and materially different; Sniffy optimizes for apps. (Critique gap #2.)

---

## Part 1 — First principles: the physics of discoverability → conversion

The funnel is **multiplicative**, with a feedback loop:

```
Need (human OR AI agent) → Discovery surface → Product page → Install → Retention/quality
                            D1 store search        ↑   conversion multiplies   │
                            D2 browse/featuring    │   EVERY surface           │
                            D3 web search          │                           │
                            D4 LLM recommendation  └── ratings/velocity feed back into
                            D5 social/referral         rank, conversion, and LLM source material
```

installs ≈ Σ over surfaces (demand × visibility × tap-through × page-CVR). **Diagnosing only keyword rank measures one factor of one term.** Conversion is the multiplicative gate on all five surfaces AND, via the feedback loop, upstream of rank itself.

Evidence grades used throughout (and to ship in reports): **[CAUSAL]** experimentally/officially confirmed · **[MECH]** documented deterministic mechanism · **[CORR]** correlational · **[FOLK]** vendor folklore · **[CONFLICT]** sources disagree (ship as `{low, high, source, year}` ranges).

### What actually drives each surface (the load-bearing facts)

**iOS search rank** — Apple officially names two signal classes: textual relevance (title, subtitle, keyword field, category) + behavioral (downloads, ratings, engagement). Three game-changers:
- **Apple's production ranker is LLM-augmented** (Feb 2026 arXiv 2602.23234, verified live): semantic-relevance labels from a fine-tuned 3B model, gains concentrated in **tail queries** — exactly where indies compete. Semantic fit now rivals literal match. [CAUSAL]
- **[V-corrected] Screenshot-caption OCR indexing is CONTESTED.** The June 2025 algorithm shift is real, but Apple reportedly denied OCR indexing and the only controlled test (ConsultMyApp, 64 phrases × 8 apps) refuted broad caption ranking. Screenshots remain the #1 *conversion* element; any caption→rank effect ships as `inferred` with the dispute cited — never as fact.
- **Deterministic metadata mechanics**: tokens combine across title/subtitle/keyword-field within one locale; plurals stem as duplicates; camelCase splits; cross-field dupes waste bytes; **each territory indexes multiple locales' metadata**. **[V-corrected]** Three vendors agree the US indexes 10 locales (up to 1,440 keyword-field chars vs 160), but the multiplier is territory-specific — UK/DE/JP index ~2. Community-tested lore (2022 fake-keyword tests), never Apple-documented → `inferred` provenance.
- Folklore correction: **iOS description/promotional text are NOT indexed** (Apple first-party; AppRadar 2026 claims otherwise — treat as wrong; nuance: the tag-generation LLM does read descriptions).

**Play search rank** — title(30) > short desc(80) > long desc(4000) indexed; 2-3 natural mentions, stuffing penalized. Uniquely, **the behavioral side is published policy**: crash 1.09%/8% per-device, ANR 0.47%/8% suppress discoverability; "Core Value" gates (DAU/MAU <8%, user-loss >5% → surface ineligibility) **[V-corrected: CONFIRMED — Play Console Help answer 9844486 + developer.android.com/quality/core-value/user-metrics; enforcement discretionary ("may"), minimum-volume condition applies]**. **On Android, engineering quality IS ASO.** AI layer: Ask Play / Gemini discovery reads listings, reviews, and external web content — reviews are now positioning data.

**Store conversion** — 90% of iOS visitors see only the top 10% of the page: icon, title, stars, first 1-3 screenshots decide nearly everything. Star-rating CVR multiplier curve: 1.00@5.0 → 0.96@4.5 → 0.83@4.0 → 0.57@3.0 → 0.15@2.0 [CORR]; thresholds 3.5 (suppression), 4.0 (credibility/featuring floor), 4.5 (top-3 cluster). Creative element ranking from thousands of A/B tests: screenshots > icon > video (+15-40%, [CONFLICT] — ship as range). Category baselines vary ~100x → all grading must be category-relative, range-based, source-attributed. Zero-budget levers: Apple PPO (traffic-gated: 3 treatments/90d/90% confidence) and Play Listing Experiments (+20-45% in Google case studies).

**Web** — indie-owned sites face an authority cliff (~32k referring domains for citation odds); indies win web via **third-party consensus** (Reddit, listicles, comparison pages), not their own domains. App-specific web plumbing is binary and spec-defined: SoftwareApplication JSON-LD, Smart App Banner with per-page `app-argument`, AASA/assetlinks integrity. Mass pSEO is dead (March 2026 core update: 30-80% losses on template pages). Web-to-app can *cannibalize* store rank signal — audit hygiene without recommending install diversion.

**LLM recommendation** — AI shapes the consideration set upstream of stores (info-seeking ≈ 24% of ChatGPT use; ChatGPT 800M WAU > App Store's 650M). Mechanism: training-set association + live retrieval of high-consensus web passages; **store rank is NOT a direct input**. Reddit/Quora mentions ≈ 4x citation lift; cited domains churn 40-60% monthly (natural repeat-purchase for re-scans). New metadata-governed surfaces: ChatGPT App Directory (MCP server required; app NAME carries most indexation weight) and Apple WWDC26 App Intents/IndexedEntity ("discoverable by Apple Intelligence" is literally a checklist).

### Platform asymmetry (where an indie hour pays most — drives recommendation ordering)
- **iOS** → metadata mechanics: cross-localization arithmetic + screenshot captions + tail-query semantic coverage (deterministic, free, newly winnable).
- **Android** → crash/ANR fixes (literal causal ranking intervention) + short description + overriding auto-translated locale defaults.
- **Web/LLM** → earning third-party consensus (two Reddit/listicle mentions beat any on-site SEO); vendor comparison pages are the one owned asset that punches above its authority.

### Measurability (the headline number)
Of ~45 causally-relevant drivers: Sniffy measures **~7 today**; **~24 are public-data-and-unbuilt**; ~8 have defensible proxies; ~8 are owner-only (ingestable if the user pastes ASC/Console numbers); only ~4 are unmeasurable. **Sniffy currently measures <20% of the causal surface; >70% is reachable with free/cheap data.**

---

## Part 2 — Competitive reality and the moat

Full matrix in `gap-analysis.md`. The conclusions that matter:

1. **[V-corrected] No agent-payable ASO *diagnosis* exists anywhere, and no agent-payable *iOS* app-store data exists at all** (full 23,863-listing Bazaar sweep, 2026-06-10). Edges that DO exist and must not be denied in copy: OpenWebNinja sells x402-payable Play *raw scrape* data ($0.01/call, Base), and free local ASO-scraper MCPs exist (no hosting, no intelligence layer). AppTweak API floor $166/mo; Sensor Tower median contract $74k/yr; Appfigures MCP rides plan+credits (per-call billing did NOT happen). **Sniffy's 402 offer is the only ASO *intelligence* an agent can buy with money it holds — and the only anything-ASO settling on Morph.** The moat sentence stands: competitors' marginal cost ≈ Sniffy's price, but their *minimum* price is a seat + a human.
2. **The popularity metric everyone resells broke.** ASA popularity collapsed Oct 2025 (-77.4% of US keywords above floor); custom-reports 403'd Mar 2026; ASA covers only 91/175 storefronts. Sniffy's heuristic fallback is the *durable* approach — it just needs to become a documented, validated, headline methodology instead of an unbranded fallback.
3. **Empty lanes:** nobody audits app-specific web markup (requires store-identity + web-crawl join Sniffy uniquely has); **[V-corrected]** LLM visibility for apps has two players — AppTweak (enterprise demo-gated, ChatGPT-only) and LLM Pulse (€49–299/mo self-serve subscription since Nov 2025) — but **zero per-request/agent-buyable options**; conversion intelligence is agency/dashboard-locked (SplitMetrics/Storemaven); competitor tracking is brutally quota'd (Appfigures: ONE competitor at $149.99/mo).
4. **Critique caveat C1 — demand side is unvalidated.** No evidence yet that agent buyers with funded wallets exist at volume. Mitigation built into Wave 0: instrument the 402 funnel + talk to agent-framework operators; the distribution wedge (near-zero cost) is how we find out cheaply.

---

## Part 3 — Reconciled priority (resolving the synthesis conflict)

The gap analysis ranked discrete features; the first-principles model says the single highest-leverage missing *section* is the **conversion audit** (it multiplies every surface and feeds back into rank; strongest non-Apple causal evidence; agency-locked by incumbents). The critique flagged the contradiction (C2). **Resolution:** both are right at different altitudes —
- **Distribution wedge first** (days, zero factual dependencies, tests the moat assumption).
- **Conversion audit is the centerpiece new section** of the diagnosis (Wave 1).
- **Verification sprint gates** everything built on single-source claims (OCR indexing, locale table, Core Value docs, impressions curve, heuristic validity, probe variance).
- Report restructure (funnel-stage organization) lands with Wave 1 so every later wave slots into a stable contract.

---

## Part 4 — Roadmap

### Wave 0 — Persist, verify, instrument, distribute (~1 week, mostly S items)

0.1 **Persist the research corpus** into `docs/research/2026-06-discoverability/` (copy the 13 /tmp files + a distilled README). It is on /tmp and will not survive a reboot.

0.2 **Verification sprint** (2-4 focused days, uses existing scraper infra) — each gates a later item:
| # | Claim to verify | Gates | Method |
|---|---|---|---|
| V1 | Screenshot-caption OCR indexing (single source: Appfigures) | Wave 3 OCR audit | Find 10 apps ranking for caption-only terms across 2 storefronts with existing rank provider; or independent confirmation (Phiture/AppTweak) |
| V2 | Play "Core Value" thresholds are published policy | Wave 3 vitals-proxy copy | Locate exact Play Console Help page; else downgrade to FOLK, keep only crash/ANR bars |
| V3 | iOS territory→indexed-locales table ("US indexes 10") | Wave 3 localization arithmetic | Cross-check 3 current vendor tables; empirically confirm one borrowed-locale rank |
| V4 | Observable-signal popularity validity | Wave 1 keyword score | Backtest RespectASO-style blend against Sniffy's cached pre-Oct-2025 ASA values; **publish the correlation as the methodology page** (verification doubles as marketing; nobody has published autocomplete-order-vs-ASA either — own that study) |
| V5 | LLM probe variance | Wave 2 share-of-voice | Pilot: same prompt set × 10 reruns × 3 models × 5 known apps; define sample size + confidence bands before pricing |
Also: confirm WWDC26 App Intents/IndexedEntity against shipped docs; re-confirm AppTweak AI Visibility is still enterprise-gated; sweep x402 Bazaar/MCP registries for any new ASO entrant.

0.3 **COGS table** (critique C4): one page, per report section per tier — vision pass (~10 images), LLM probes (~20 prompts × 2-3 cheap models), competitor review pulls, web fetches, synthesis. Output: which sections land in standard ($0.20) vs expert ($1.00), and whether expert price moves. Quick tier stays deterministic. Rule: per-request API cost < 30% of tier price.

0.4 **402-funnel instrumentation** (critique C1): count quote→402→settle conversions by `X-Sniffy-Client` attestation in existing audit logging; this is the demand-side telemetry that validates (or kills) bigger bets.

0.5 **Distribution wedge** (gap-analysis #3 — highest leverage-per-hour): `llms.txt` on landing; OpenAPI spec generated from existing Zod schemas; submit MCP server to registries (mcpservers.org etc.); list on x402 Bazaar/discovery indexes; add `vsSubscriptions` price-anchoring to SKILL.md + landing ("$0.20/report vs $166/mo API floor"). Pure positioning conversion of an already-built monopoly.

### Wave 1 — The conversion audit + honest keyword score + funnel-stage report (the core product upgrade)

1.1 **Restructure the diagnosis by funnel stage** (contract change; PLAN.md §9 + SDK + MCP + CLI + skills/ in same PR): §1 Demand · §2 Visibility mechanics · §3 Behavioral standing · §4 Conversion · §5 Off-store discovery · §6 Best next sniff. Existing sections map into stages (keywordDiagnosis→§1/§2, metadataScore→§2, competitorTrail→§2, regressions/momentum→§3, localization→§2, recommendations→§6). Additive Zod changes; bump `reportVersion`.

1.2 **`conversionAudit` section (§4) — the missing multiplicative gate** (vision-LLM; standard/expert per COGS):
   - **Creative-stack gap vs top-10** for the app's #1 keyword: video presence rate, screenshot count/orientation/first-3 message, caption style — public screenshot URLs + page scrape + one vision pass (one pass also feeds the Wave-3 OCR rank audit). New provider `scraper/src/providers/apple/serp-creatives.ts`; reuse `storefront-page.ts` + keyword-rank top-15.
   - **`estimatedConversionIndex`**: rating-curve multiplier × category CVR baseline, returned as `{low, high, source, year}` with 3.5/4.0/4.5 band verdicts. Static benchmark corpus → extend `@gosniffy/aso-knowledge` (+ scraper mirror, sync test).
   - **Rating-reset advisor**: current-version vs lifetime rating per territory (already in iTunes lookup fields) → one-shot iOS reset lever; Play displayed-rating recent-weighting note.
   - **Zero-budget experiment planner**: can this app's estimated impressions reach PPO 90% confidence in 90 days; if not, the single highest-leverage treatment; Play Experiments path for Android. Deterministic math from rank-estimated impressions.
   - **Replaces the misnomer**: the current "screenshots" metadata subscore (a description-density proxy) is superseded by real creative analysis.

1.3 **Transparent observable-signal keyword score (§1)** — promote the heuristic fallback to headline methodology (gated on V4): RespectASO-style six-signal popularity blend + AppTweak-analog Difficulty/Chance/KEI from top-10 SERP strength (mostly extends existing `keyword-difficulty.ts`) + "est. max daily impressions" translation (SplitMetrics exponential, cited, staleness-caveated per V5 of critique — ship as "illustrative ceiling, 2019 data" unless recalibrated with ~$50 ASA discovery campaign). Works on all 175 storefronts. Publish the methodology page. Marketing: "we never depended on the metric that broke." Keep flag-gated ASA provider as labeled overlay only.

1.4 **iOS metadata mechanics linter (§2)** — deterministic simulator of Apple's documented rules: token combination, plural stemming, cross-field dedup, camelCase splitting, auto-indexed free words. Output: "7 wasted characters; 12 new phrase permutations reachable if X moves to subtitle" + ready-to-paste fix. Separate Apple-first-party rules from community lore in provenance labels (critique). New `scraper/src/scoring/metadata-mechanics.ts`; pure functions; ideal-Sniffy-shaped (free, deterministic, auditable). Add an **App Review safety pass** on all ready-to-paste output (iOS 4.3/name-stuffing, Play banned words "free/best/#1") — generated metadata that triggers rejection is product liability.

1.5 **shallowScan teaser upgrade** (one bit per funnel edge, no paid leakage; PLAN.md §22-safe):
rating threshold verdict (one line) · localization waste **count** · web plumbing booleans ("Smart App Banner: missing") · AI mention **bit** (one canonical prompt, one cheap model, cached weekly, <$0.001/quote — the emotionally strongest hook) · existing identity/preview-keyword stay. Each teaser maps to a paid section.

1.6 **§6 recommendations re-ranked by causal leverage-per-hour for the app's platform** (the Part-1 asymmetry table operationalized), each tagged [CAUSAL]/[CORR]/[FOLK] so agents know which advice is mechanical. Extend `deterministic-prose.ts` + synthesis prompts.

### Wave 2 — Off-store discovery (§5): the greenfield

2.1 **LLM share-of-voice probe** (gated on V5 variance pilot; standard/expert per COGS): N intent prompts × 2-3 cheap models (GPT-4o-mini/Haiku/Gemini Flash) → mention/position/sentiment for app vs detected competitors; memory-vs-retrieval split (tools off/on). Cache by `(appId, promptSet, week)`. New `scraper/src/providers/llm-probe.ts` + `aiVisibility` schema section, provenance `live`. **[V-corrected] Positioning: "the only per-request, agent-buyable LLM visibility probe for apps"** — vs AppTweak (enterprise demo-gated, ChatGPT-only) and LLM Pulse (€49-299/mo subscription); never claim capability uniqueness. 40-60% monthly citation churn → natural re-run purchases on existing /history infra.

2.2 **Web discoverability audit** (`webDiscoverability`, deterministic, free): given marketingUrl/sellerUrl (already in lookup) — SoftwareApplication JSON-LD required-fields grade, Smart App Banner + per-page `app-argument`, AASA/assetlinks integrity vs detected bundleId/package, schema-vs-store rating drift, GPTBot/PerplexityBot robots blocks. 1 HTML + 2 .well-known + robots.txt fetches. Upgrade/extend `providers/product-context.ts`. Editorial stance (critique contradiction #3): grade plumbing hygiene; do NOT recommend diverting install signal to web.

2.3 **Citation-source footprint**: Reddit mention count/recency (free JSON API) + listicle/comparison-page presence (cheap search API) vs competitors → consensus footprint with named gaps + capped 5-10 page *briefs* (not mass pSEO — that's in Do-NOT-build).

2.4 **New-surface readiness checklist** (knowledge-grade, `inferred`): ChatGPT App Directory presence/viability + competitor presence; Apple App Intents checklist ("is your app legible to Apple Intelligence") — recommendations, not measurements. **[V-corrected] Checklist order per Apple docs: AppEntity/AppIntent modeling → IndexedEntity + indexingKey macros (iOS 18/26) → app schema domain conformance (WWDC26's "Siri AI" front door, session 240) → onscreen context/donations. iOS-27 items carry beta labels until fall 2026; don't market IndexedEntity as new.**

### Wave 3 — Deepen the stores (gated items)

3.1 **Cross-localization arithmetic** (V3 verdict: proceed): per-territory indexed-locales table (favor AppTweak/MobileAction rows — US=10, most others ~2), iOS indexed-but-empty locale slots with fill-ready per-locale keyword sets (extends shipped franc module + multi-storefront provider); territory-specific multiplier copy, `inferred` provenance; one borrowed-locale empirical confirmation before launch. Android `hl/gl` machine-translation fingerprint ("auto-translated short desc + English title" = neglected locale).
3.2 **[V-corrected] Screenshot caption audit — conversion-first, rank claim dropped.** Caption extraction (same vision pass as 1.2): message clarity, readability, first-3 narrative, keyword *alignment* framed as listing-consistency advice. Any search-signal mention ships `inferred` + "contested — Apple has denied OCR indexing" with both citations. Section renamed from `screenshotIndexing` to part of `conversionAudit.captions`.
3.3 **Play reviews provider** (continuation-token batchexecute, vendored pattern) → unified review intelligence: velocity/week, displayed-vs-lifetime delta, reply coverage + median lag, crash/ANR complaint rate vs published gates (`inferred`, framing per V2), LLM complaint-theme clusters (expert). Closes the biggest Android gap; document the silent-ratings blind spot.
3.4 **Competitor negative-review positioning miner** (expert): competitors' recent 1-2★ reviews → complaint clusters → positioning gaps with ready-to-paste subtitle/caption copy. Quota-free by construction (incumbents: ONE competitor at $149.99/mo).
3.5 **Ratings-velocity install-momentum proxy**: snapshot `userRatingCount` per (app,country) on existing rank-history cadence; weekly delta vs top-10 category median, `inferred`. The honest substitute for download estimates.
3.6 **Apple LLM review-summary preview** (expert, ~zero marginal cost over 3.3/3.4): simulate what iOS 18.4+ auto-summary will say; `inferred` (actual summary not retrievable).

### Wave 4 — Productize the wedge

4.1 **Standalone x402 per-keyword endpoint** (~$0.02/keyword: popularity + difficulty + related searches) — priced into the deprecated Apify actor's vacuum ($20/1k, proven demand). New route + x402 offer tier; reuses Wave-1 internals.
4.2 **Pre-build keyword validation mode** (vibe-coder wedge): niche phrase, no appId → build-worthiness verdict (demand proxy, difficulty components, incumbent weakness). Contract extension (PLAN.md §9 + SDK same PR) + "ASO for AI-built apps" guide + Agent Skill recipe. Zero tools serve the pre-app moment.
4.3 **Keyword Impact before/after**: detect metadata diffs between cached snapshots; per-keyword rank deltas across the change boundary (AppTweak sells this at $299/mo). Closes the agent loop: diagnose → change → re-diagnose → measure. Value compounds with cache age (the commercial-host moat).
4.4 **Knowledge corpus expansion** (uncovered angles from critique): featuring/editorial pitching mechanics, category choice strategy, pre-launch (pre-orders/waitlist/TestFlight velocity), paid-UA × organic halo ("will $5/day ASA lift organic?") — knowledge-grade answers with citations, not measurements.

### Parked / Do NOT build
**Parked:** App Store Tags diffing (wait for schema-drift monitoring on the new surface); inferred competitor keyword-field reconstruction (wait until rank cache is months deeper — then it's an unreplicable moat feature).
**Never (per research):** download/revenue estimates (panel-moated; faking destroys provenance honesty) · ASA popularity as primary signal (broken upstream) · review-reply CRM (commoditized at $15/mo) · Apple Ads impression-share history · CPP-in-organic detection · mass pSEO page generation (March 2026 core update) · ASC/Play Console OAuth (breaks no-account agent model; offer paste-in calibration instead — 3 ASC numbers convert §4 estimates to measurements) · subscriptions/dashboards/Postgres/custom facilitator · generic web SEO (Ahrefs owns it; our edge is only the app-specific join).

---

## Part 5 — Architecture & contract implications

- **New Zod sections** (`scraper/src/schemas/diagnose.ts` + `quote.ts`): `conversionAudit`, `aiVisibility`, `webDiscoverability`, `citationFootprint`, `metadataMechanics`, `screenshotIndexing`, keyword-score methodology fields; shallowScan additions. All additive; every conflicted benchmark ships as `{low, high, source, year}`; every estimate carries provenance (`inferred` for proxies, `live` for LLM-probe outputs); evidence tags ([CAUSAL]/[CORR]/[FOLK]) on recommendations.
- **New providers:** `serp-creatives.ts`, `llm-probe.ts`, `play-reviews.ts`, web-audit (extend `product-context.ts`). All must follow the existing never-throw/degraded pattern (`morph-facilitator-boundary` discipline) and clamp via `lib/clamp-report.ts`.
- **New scoring modules:** `metadata-mechanics.ts`, `conversion-index.ts`, `creative-gap.ts`, `citation-footprint.ts`; extend `keyword-difficulty.ts` (Chance/KEI), `localization.ts` (locale arithmetic), `review-*.ts` (Play unification).
- **Flags:** `LLM_PROBE_ENABLED`, `VISION_CREATIVE_ENABLED`, `WEB_AUDIT_ENABLED`, `PLAY_REVIEWS_ENABLED` — default off until COGS-cleared; fixture fallbacks for /sample.
- **Cache keys** stay deterministic: add `(promptSetVersion, week)` for LLM probes; screenshot-URL hashes ride the existing rank-history snapshot cadence.
- **Same-PR rule** for every contract change: PLAN.md §9, `@gosniffy/sdk` (tsup bundle), MCP tool descriptions, CLI renderers (provenance icons), SKILL.md, `skills/` specialists. CI build order traps already documented (landing→scraper, cli/mcp→sdk).
- **Knowledge corpus:** new topics (rating curve/thresholds, caption-indexing dispute [both sides cited], Core Value gates [canonical Google URLs from V2], PPO/experiments math, featuring pitch, paid-UA halo, App Intents/App Schemas) added to `packages/aso-knowledge` + scraper mirror; sync test guards drift. The existing `screenshot-captions-indexed` corpus entry must be REWRITTEN per V1 — it currently states the contested claim as fact.
- **Pricing:** quick stays deterministic-only; COGS table (0.3) decides standard vs expert placement; per-keyword endpoint gets its own x402 offer line. Surface real costs in `pricing.breakdown`.

## Risks
- **Demand-side unproven (C1)** — mitigated by 0.4 instrumentation + 0.5 wedge before large builds; revisit roadmap if 402 settle-rate stays ~zero after distribution push.
- **Scraping sustainability (C5)** — batchexecute/SERP scraping at production volume needs rate-limit economics + ToS review; the Apify actor's death is the cautionary tale. Keep kill-switch flags + fixture fallbacks on every new provider.
- **Competitor watch**: Appfigures adding per-call billing to its MCP is the most plausible moat breach; re-sweep registries at each wave boundary (optionally a firecrawl monitor on their pricing page).

## Verification (per wave)
- **Wave 0:** V1-V5 each produce a written verdict in `docs/research/`; V4 publishes the correlation study; COGS table reviewed before any flag flips.
- **Each feature:** Vitest unit tests on scoring modules (deterministic, fixture-driven); schema round-trip + clamp tests; `packages/*` typecheck chain green; `/sample` still works with all new flags off AND on (fixtures).
- **E2E:** quote→402→pay→diagnose smoke on Railway against a real app (the existing 4-smoke suite + new sections present); MCP `sniffy_diagnose` returns new sections; CLI renders new provenance icons; `npx skills add` path still installs.
- **Honesty audit:** every new field grep-checked for provenance label; conflicted benchmarks render as ranges with sources in landing UI.
