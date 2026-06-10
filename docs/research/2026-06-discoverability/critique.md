# Completeness Critique: Sniffy Research → Product Plan Readiness

*Note for orchestrator: the "Sniffy context + constraints" variable was interpolated as `undefined` in the prompt. Context was recovered from CLAUDE.md/PLAN.md references; fix the template variable.*

**Live checks performed during this review (2026-06-10):**
- arXiv 2602.23234 — **EXISTS**: "Scaling Search Relevance: Augmenting App Store Ranking with LLM-Generated Judgments" (HTTP 200). The corpus's strongest claim survives at the existence level; the +0.24% CVR figure and "tail queries" finding are still unchecked against the paper body.
- checkaso.io — **confirmed dead**: no A/NS/SOA records.
- Morph facilitator `GET /x402/v2/supported` — **live, HTTP 200**: `{scheme:"exact", network:"eip155:2818"}`, 3 signers. Payment rail works, but the response advertises no asset/EIP-712 detail — PLAN.md §21's USDC-contract question remains formally open (mooted in practice by the green 2026-05-22 smoke tests).

---

## CRITICAL GAPS (would change the plan)

**C1. Zero demand-side research.** All 10 dimensions are supply-side (competitors, mechanics, data access). Nothing validates that *buyers* exist for per-request crypto-settled ASO: no evidence any agent operator holds funded Morph wallets, no x402-ecosystem traffic data, no willingness-to-pay signal for per-call vs the $10–70/mo subscription anchor indies actually voiced. The entire "structural monopoly" moat is an untested assumption. *Mitigation: instrument the already-live 402 endpoint (quote→402→settle funnel counts by client attestation) and survey/interview 5–10 agent-framework operators before building Tier-1 features beyond #3.*

**C2. The two synthesis documents contradict each other on what to build first.** The first-principles model concludes the single highest-leverage missing section is the **conversion audit** (creative-stack gap vs top-10 + rating economics + experiment planner). The gap analysis's Tier 1 contains **no conversion-audit item** — screenshot OCR is #10 (Tier 2), conversion index #12 (Tier 2), and the creative-stack-vs-top-10 audit is absent from the ranking entirely. This must be reconciled before any roadmap is written.

**C3. LLM share-of-voice probe (#1, the headline feature) has no measurement methodology.** LLM answers are stochastic and model versions churn; AppTweak uses 10,000+ prompts where Sniffy proposes 10–20. Nobody verified that a 10–20-prompt probe yields a stable, repeatable mention rate rather than noise. *Mitigation: run a variance pilot (same prompt set × 10 reruns × 3 models × 5 known apps) and define sample size / confidence bands before pricing this as a paid section.*

**C4. No unit economics.** "Cents per report" is asserted, never accounted. The $0.20–$1.00 diagnosis now bundles: vision-LLM pass on ~10+ screenshots (#10), multi-model probes (#1), competitor review pulls (#9), web fetches (#7), synthesis. *Mitigation: one-page COGS table per report section before fixing the x402 price.*

**C5. Scraping sustainability/ToS risk unassessed.** ~24 of the roadmap's drivers are class-(b) "public, unbuilt" — all assume sustained scraping of iTunes APIs, Play batchexecute, App Store SERPs, and screenshot CDNs. No research on rate-limit economics, ToS exposure, or upstream tolerance at production volume (the Apify actor's deprecation is itself a warning sign nobody interrogated).

### Top 5 load-bearing claims that MUST be verified before building

| # | Claim | Rests on | Verification step |
|---|---|---|---|
| 1 | **Screenshot caption OCR is indexed for iOS rank** (June 2025) | Opportunity #10; "double-duty screenshots" physics | Single source (Appfigures). Replicate with the existing scraper: find 10 apps ranking for terms that appear *only* in captions (not title/subtitle/inferable keyword field) across 2 storefronts; or find one independent confirmation (Phiture/AppTweak) |
| 2 | **Play "Core Value" thresholds are published policy** (DAU/MAU <8%, user-loss >5% → surface ineligibility) | Graded [CAUSAL]; vitals-proxy feature copy | Locate the exact Play Console Help / Android Developers page stating these numbers. If absent, downgrade to FOLK and strip "officially numeric" framing — only crash/ANR bars are confirmed policy |
| 3 | **iOS cross-locale indexing table ("US indexes 10 locales")** | All of opportunity #6's arithmetic | Apple has never published this; it's a community table that has changed over time. Cross-check 3 current (2025–26) vendor tables for agreement, then empirically confirm one borrowed-locale rank on a target storefront |
| 4 | **Observable-signal heuristic popularity is valid** (RespectASO-style) | Opportunity #2's headline methodology | Research admits no published correlation study exists. Backtest the heuristic against Sniffy's own cached ASA popularity values (pre-Oct-2025 cohort); publish the correlation as the methodology page — verification doubles as marketing |
| 5 | **SplitMetrics impressions curve** (254.44·e^(0.0615·SP), 2019 US) | "Est. max daily impressions" output in #2 | Pre-dates the Oct 2025 popularity refloor — likely invalid at the floor. Either re-calibrate with a small ASA discovery campaign (~$50) or ship as "illustrative ceiling, 2019 data" only |

---

## MINOR GAPS (nice to verify)

- **Thin dimensions:** none failed outright, but competitors-mid has holes (1/6 tools dead — confirmed; AppFollow + FoxData pricing JS-hidden, so 2/6 cells in the pricing matrix are estimates). llm-discoverability leans on vendor marketing (AppTweak/Profound blogs); its only intervention study (Princeton GEO) is 2023 — stale for 2026 engines. pseo-landing drifted into web-payments territory (RevenueCat) at the expense of pSEO depth.
- **WWDC26 claims are ~48 hours old** (keynote coverage, June 8). Verify App Intents/IndexedEntity "discoverable by Apple Intelligence" against shipped developer docs before encoding as checklist advice.
- **ChatGPT App Directory mechanics** ("app NAME carries most indexation weight") — verify against OpenAI's official Apps SDK submission docs, not third-party commentary.
- **App Review rejection risk for generated metadata** (iOS 4.3 spam, name keyword stuffing; Play metadata policy beyond the banned-words list). Ready-to-paste output that triggers a rejection is a product liability; needs a rules pass.
- **AppTweak AI Visibility gating/pricing** — re-confirm it's still Enterprise/demo-only (the #1 opportunity's "only competitor" framing depends on it).
- **camelCase splitting / token-combination sub-rules** in #5's linter: some rules are Apple first-party, some are community lore — separate them so the linter's claims match its provenance labels.
- **"No x402 ASO API exists anywhere"** — absence claim from 6 searches; sweep x402 Bazaar/discovery indexes and MCP registries once more at build time (also required for #3 anyway).

## RESEARCH ANGLES NOT COVERED AT ALL

1. **Featuring/editorial pitching** — App Store featuring nomination form, Today-tab pitch mechanics, Play featuring. A classic zero-budget indie lever; only eligibility correlation was touched.
2. **Category choice strategy** — primary/secondary selection, category-switch effects, low-competition category arbitrage; and the **games vs apps split** (games discovery is browse/event-heavy and materially different — decide explicitly whether games are in the ICP).
3. **Pre-launch mechanics** — iOS pre-orders (launch-velocity spike), waitlists, TestFlight/open-beta effects on day-1 ranking. Natural companion to opportunity #11, which only covers pre-*build* keyword validation.
4. **Paid UA × organic interplay** — ASA organic halo/cannibalization, brand defense, Google App Campaigns. Deferred as "bidding apps," but "will $5/day on ASA lift my organic rank?" is a question the report's recommendations section *will* be asked; needs at least a knowledge-corpus answer.
5. **Seasonality/temporal keyword demand** — absent entirely.
6. **Competitor reaction monitoring** — Appfigures adding per-call billing to its MCP is the single most plausible moat breach; no watch plan exists.

## CONTRADICTIONS

1. **Build-priority conflict between the two synthesis docs** (see C2) — the only contradiction that blocks planning.
2. **Recycled retention bands**: D1>35%/D7>15% appears verbatim in both apple-ranking and play-ranking — almost certainly one vendor source echoed twice, graded FOLK in one place and near-causal in the other. Treat as a single low-confidence source, not independent confirmation.
3. **Web-funnel advice coherence**: pseo-landing says web-to-app can *hurt* store rank (and RevenueCat's own A/B lost 6% revenue), while opportunity #7 sells a web-discoverability audit. The audit must grade plumbing hygiene without implicitly recommending install-signal diversion — needs an explicit editorial stance in the report copy.
4. **Install-origin arithmetic never reconciled**: "~65% of downloads follow store search" vs "82% of top apps use web-to-app" [FOLK] vs "discovery moving upstream into LLMs." The plan weights surfaces (e.g., AI-mention as "the emotionally strongest hook") without any unified picture of where installs actually originate per app class.
5. **ASA popularity stance**: keyword-methodology says the passthrough signal broke (Oct 2025); competitors-mid cites FoxData as "validating Sniffy's ASA integration." Plan handles it (labeled overlay only), but marketing copy must not cite the FoxData validation.
6. **Already-flagged source conflicts** (fine, handled as ranges): iOS description indexing (Apple/Appfigures NO vs AppRadar YES), video lift (+15–25 vs +20–40%), rating uplift (+89–92 vs +30–35%), iOS CVR benchmarks by year, Play keyword-repetition advice.

## VERDICT

**Sufficient to plan from — conditionally.** The supply-side landscape, pricing asymmetry, and mechanism inventory are unusually well-grounded (and the single most-cited claim, Apple's LLM-ranker paper, verified live during this review). The do-not-build list is sound. But it is not yet a product plan because: (a) the central moat assumption — that agent buyers with funded wallets exist — has zero supporting evidence (C1); (b) the two synthesis documents disagree on the top build priority (C2); (c) four single-source load-bearing claims (OCR indexing, Core Value thresholds, locale table, impressions curve) and one unbuilt methodology (heuristic-popularity validity, probe variance) remain unverified; (d) per-report COGS is unspecified.

**Safe to start immediately:** #3 (distribution wedge — zero new factual dependencies), #5 and #7 (spec-grounded, deterministic), #12 (with ranges). **Gate on the verification list:** #1 (probe variance pilot), #2/#4 (heuristic backtest + curve recalibration), #6 (locale table), #10 (OCR replication), #8's vitals framing (Core Value doc). Estimated verification effort: 2–4 focused days, most of it executable with the scraper infrastructure already in the repo.