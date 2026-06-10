# Sniffy Competitive Gap Analysis & Opportunity Ranking
*Synthesized from 10 research dimensions, 2026-06-10. Citations use `dimension → claim` shorthand.*

---

## 1. Capability Matrix

Legend per cell: **rating** | typical price | agent-accessible?

| Capability | Enterprise (AppTweak / Sensor Tower / MobileAction) | Mid (Appfigures / Asodesk / AppFollow / App Radar / FoxData) | Indie (ASOMobile / Astro / aso.dev / OSS) | **Sniffy today** |
|---|---|---|---|---|
| **Keyword intel (volume/difficulty)** | **Strong** \| $79–549/mo + API $166/mo floor; ST $30k+/yr \| API yes, agent-payable **no** | **Strong** \| popularity gated at $44.99/mo (Appfigures); methodology opaque except FoxData \| mostly no API | **Weak-medium** \| Astro $108/yr; facundoolano/aso abandoned, "arbitrary weights" \| free OSS but stale | **Medium** — ASA popularity broken upstream (Oct 2025 collapse), heuristic fallback exists but undocumented/unbranded; **fully agent-payable (x402)** |
| **Rank tracking + history** | **Strong** \| daily/hourly, history to 2014 \| API behind floors | **Strong** \| hourly at $149.99/mo (Appfigures) | **Medium** \| aso.dev every 4h/60 countries | **Medium-strong** — rank history, trend, regressions, /history endpoint shipped; depth limited by cache age; agent-payable |
| **Metadata audit** | **Strong** \| in-dashboard, AI metadata agents Enterprise-only | **Medium** \| Asodesk full metadata builder at $179/mo | **Weak** \| checklists in blogs, not machine-readable | **Medium** — keyword diagnosis + clamped report; no token-combination simulator, no dup/plural/camelCase waste linter, no screenshot OCR |
| **Competitor intel** | **Strong** \| All Ranked Keywords Enterprise-only; bidding apps $549/mo | **Weak-gated** \| Appfigures: ZERO competitors below $149.99/mo, then ONE | **Weak** \| App Radar caps 25–250 competitors/tier | **Medium** — competitor trail exists, quota-free by design; no review-gap mining, no inferred-keyword-field, no CPP detection |
| **Creative / conversion** | **Medium** \| AppTweak creative intel enterprise add-on; SplitMetrics = agency work | **Weak** | **Absent** | **Absent** — no screenshot/video/caption analysis, no conversion index, no staleness score |
| **Reviews / ratings intel** | **Strong** \| AppTweak Reviews $83–833/mo separate product | **Strong but quota'd** \| App Radar 50–100 AI summaries/mo at €169–299; Appbot $49–479/mo, API add-on $166+/mo | **Medium** \| ASOMobile metered AI limits | **Weak-medium** — iOS RSS review-keyword suggestions only; **no Play reviews provider**, no velocity, no reply-coverage, no theme clustering |
| **Localization** | **Strong** \| enterprise dashboards | **Gated** \| Asodesk keyword translations at $179/mo | **Weak** | **Medium-strong** — multi-storefront gap analysis (franc) shipped but underexposed; no iOS indexed-locale arithmetic, no Android hl/gl fingerprinting |
| **Web/SEO for apps** | **Absent** (app-specific markup) | **Absent** | **Absent** | **Absent** — nobody audits Smart App Banners, AASA, SoftwareApplication schema. Open lane. |
| **LLM visibility (GEO)** | **Strong but locked** \| AppTweak AI Visibility: demo-gated Enterprise, April 2026, only mobile-specific player | **Absent** (web-brand tools: Profound $99–499/mo, Otterly $29–489/mo, Ahrefs $828–1,148/mo full) | **Absent** | **Absent** — biggest greenfield given embeddings + AI synthesis already in stack |
| **Estimates / market data** | **Strong & moated** \| panel-calibrated; ST Usage Intelligence priciest module; AppTweak 500 credits/download estimate | **Gated** \| Appfigures DPR at $299.99/mo | **Absent** | **Absent** — and should stay absent (see Do-NOT-build); ratings-velocity proxy is the honest substitute |
| **Agent access (cross-cutting)** | API yes, **zero agent-payable**; AppTweak ships llms.txt but funnel dead-ends at credit card | No per-call pricing anywhere; App Radar API = "talk to sales"; prices hidden behind JS | Only ASO MCP is macOS-26-only local binary; Appfigures MCP = account + plan + 10 credits/req | **Unique** — real HTTP 402, wallet-payable, MCP/CLI/SDK/SKILL.md. **The monopoly position.** |

---

## 2. Top Opportunities (ranked)

Scores 1–5: **IV** = indie-hacker value, **AM** = agent-moat (can competitors' business model follow?), **DF** = differentiation, **FS** = feasibility under Sniffy constraints. Effort S/M/L.

### Tier 1 — build next

**1. LLM share-of-voice probe + free "AI mention check" teaser** — IV 5 / AM 5 / DF 5 / FS 4 (19) — **M**
Run ~10–20 category-intent prompts against 2–3 LLM APIs; report mention/position/sentiment for app vs detected competitors; one binary check in shallowScan ("ChatGPT did not name your app for your top intent"). Grounded: AppTweak's AI Visibility is the *only* mobile player and it's demo-gated Enterprise (llm-discoverability → AppTweak April 2026 claim); web GEO tools are $29–499/mo dashboards with zero per-request option; AI recs are upstream of store rank (llm-discoverability → intent-driven shortlists). Data: GPT-4o-mini/Haiku/Gemini Flash calls, cents per report, cache by (appId, promptSet, week). New report section: `aiVisibility` (provenance `live`); teaser in shallowScan. Citation drift (40–60% monthly) makes re-runs a natural repeat purchase on existing /history infra.

**2. Transparent observable-signal keyword score (popularity + difficulty + chance + KEI + impressions translation)** — IV 5 / AM 4 / DF 4 / FS 5 (18) — **M**
Upgrade the existing `popularitySource:'heuristic'` fallback into the headline, documented methodology (RespectASO-style six-signal blend), add AppTweak-analog Difficulty/app-relative Chance/KEI from top-10 SERP strength, translate to "est. max daily impressions" via the published SplitMetrics exponential. Grounded: ASA popularity publicly collapsed Oct 2025 (−77.4% in 4 days), passthrough vendors floored (keyword-methodology → collapse claim); formulas are derivable from free iTunes data (keyword-methodology → RespectASO claim); works on all 175 storefronts vs ASA's 91. Data: iTunes Search API + existing rank data, all free, deterministic, provenance `inferred`. Paid-tier; one component teased in shallowScan. Marketing line: "we never depended on the metric that broke."

**3. Agent-distribution wedge: llms.txt + OpenAPI + Bazaar listing + MCP registry submissions + per-call price anchoring** — IV 3 / AM 5 / DF 5 / FS 5 (18) — **S**
Highest leverage-per-hour item on the list. Grounded: AppTweak ships llms.txt "for AI agents" but funnel dead-ends at a credit card (competitors-enterprise); the only free ASO MCP requires macOS 26 Apple Silicon and the most-starred App Store MCP was archived Feb 2026 (competitors-indie-ai); no x402/crypto-payable ASO API exists anywhere. Data: none — generate OpenAPI from existing Zod schemas, submit to mcpservers.org/registries, add `vsSubscriptions` comparison to landing + SKILL.md. Pure positioning conversion of an already-built structural monopoly.

**4. Standalone x402 per-keyword intelligence endpoint (~$0.02/keyword)** — IV 4 / AM 5 / DF 5 / FS 5 (19, but depends on #2) — **S**
Popularity + difficulty + related searches per keyword, priced into the vacuum the deprecated Apify actor left ($20/1,000, proven demand, dead route). Grounded: keyword-methodology → Apify actor claim; AppTweak API floor $166/mo; SensorTower $2,000+/mo. Packaging work on existing providers + a per-keyword tier in the x402 offer. This is also the natural backend for opportunity #12.

**5. iOS metadata mechanics linter (token-combination simulator)** — IV 5 / AM 4 / DF 5 / FS 5 (19) — **S/M**
Encode Apple's documented deterministic rules: token combination within locale, plural stemming, cross-field dedup, camelCase splitting, auto-indexed free words. Output: "7 wasted characters; 12 new phrase permutations reachable if you move X to subtitle." Grounded: apple-ranking → keyword-field rules + token-combination claims (first-party Apple docs). Data: free iTunes lookup + static rules. Paid-tier section `metadataMechanics`; deterministic and auditable — the ideal Sniffy-shaped feature. Ready-to-paste output is exactly what agents executing ASC changes need.

**6. Cross-localization gap arithmetic (iOS indexed-locale table + Android machine-translation fingerprint)** — IV 5 / AM 4 / DF 4 / FS 5 (18) — **S/M**
iOS: compute unused indexed-but-empty keyword surfaces per target country (US indexes 10 locales — up to 9 wasted 100-char fields) with fill-ready per-locale keyword sets. Android: detect "auto-translated short description + English title" as the neglected-locale fingerprint via hl/gl calls. Grounded: apple-ranking → territory-indexes-10-locales claim; play-ranking → auto-localization claim. Extends the already-shipped franc module; undercuts Asodesk's $179/mo translation gate. Teaser: storefront-gap *count* in shallowScan; detail paid-only (PLAN.md §22-safe).

**7. Web discoverability audit (app-specific web markup)** — IV 4 / AM 5 / DF 5 / FS 5 (19) — **M**
Given marketingUrl/sellerUrl (already in iTunes lookup): grade SoftwareApplication JSON-LD against Google's exact required fields, apple-itunes-app Smart App Banner with per-page app-argument, AASA + assetlinks.json integrity matched against detected bundleId/package, schema-vs-store rating drift, GPTBot/PerplexityBot robots blocks. Grounded: pseo-landing → Google required-fields, Apple web-markup, AASA claims; zero competitor audits any of this (the join requires both store identity and web crawl — Sniffy uniquely has both). Data: 1 HTML fetch + 2 .well-known fetches + robots.txt, all free, deterministic. New paid section `webDiscoverability`; boolean teaser ("Smart App Banner: missing") in shallowScan.

### Tier 2 — fast follows

**8. Play reviews provider + unified review intelligence** — IV 4 / AM 4 / DF 4 / FS 4 (16) — **M**
Continuation-token Play reviews (vendored _gplay.ts pattern), then derive: review velocity per week, displayed-vs-lifetime rating delta, reply-coverage + median reply lag (reply fields in payload), crash/ANR complaint rate vs Google's published 1.09%/0.47% thresholds (provenance `inferred`), LLM complaint-theme clusters. Grounded: play-ranking → batchexecute scrapability; ratings-reviews → recent-weighted rating (official), reply-impact analytics, velocity-beats-rating claims. Closes Sniffy's biggest Android gap; competitors quota this hard (App Radar 50 summaries/mo at €169).

**9. Competitor negative-review positioning-gap miner + quota-free overlap** — IV 5 / AM 5 / DF 4 / FS 4 (18) — **M**
Pull competitors' recent 1–2★ reviews, cluster complaints, emit positioning gaps with ready-to-paste subtitle/caption copy; include 3–5 competitors' keyword-coverage deltas in every diagnosis. Grounded: ratings-reviews → Appbot/AppFollow gating; competitors-mid → Appfigures ZERO competitors below $149.99/mo. Per-report pricing makes per-tracked-entity quotas structurally unfollowable — the purest agent-moat play after #1.

**10. Screenshot caption OCR audit** — IV 5 / AM 4 / DF 5 / FS 3 (17) — **M**
Extract caption text from app + competitor screenshots, score keyword alignment, flag passive captions and OCR-illegibility. Grounded: apple-ranking → OCR-indexing since June 2025 (Appfigures-verified, biggest 2025 algo change); incumbents treat screenshots as conversion-only, dashboard-locked. Data: free screenshot URLs + vision LLM pass (~10 images/report — price into the x402 charge). Paid section `screenshotIndexing`.

**11. Pre-build keyword validation mode (vibe-coder wedge)** — IV 5 / AM 5 / DF 5 / FS 4 (19, but new contract surface) — **M**
Accept a niche phrase with no appId; return build-worthiness verdict (difficulty components, demand proxy, incumbent weakness). Grounded: competitors-indie-ai → "ASO is the new SEO" / one-app-per-phrase trend, "research before you build" advice, and zero tools serving the pre-app moment. Reuses #2/#4 internals minus detection. Requires PLAN.md §9 contract extension + SDK update in same PR. Pair with an "ASO for AI-built apps" guide + Agent Skill recipe.

**12. estimatedConversionIndex + rating threshold bands** — IV 4 / AM 4 / DF 3 / FS 5 (16) — **S**
Star-rating multiplier curve (4.0→0.83, 3.0→0.57) × category CVR baseline, returned as `{low, high, source, year}` ranges with the 3.5-suppression / 4.0-credibility / 4.5-top-3 bands. Grounded: store-conversion → NP Digital curve + conflicting-benchmarks claims; ratings-reviews → thresholds. Static benchmark corpus extends @gosniffy/aso-knowledge; one-line band verdict in shallowScan (ratings summary already allowed), ranges paid.

**13. Keyword Impact before/after (metadata-change delta)** — IV 4 / AM 4 / DF 3 / FS 4 (15) — **S/M**
Detect title/subtitle diffs between cached snapshots; report per-keyword rank deltas across the change boundary. Grounded: competitors-enterprise → AppTweak sells this at $299/mo Grow. Pure derivation over existing rank-history + cache; closes the agent feedback loop (diagnose → change → re-diagnose → measure). Value compounds with cache age (the commercial-host moat).

**14. Citation-source footprint (Reddit/listicle/comparison scan)** — IV 4 / AM 4 / DF 4 / FS 4 (16) — **M**
Reddit mention count/recency, presence in "best X apps" listicles, comparison-page existence — scored as consensus footprint with named gaps. Grounded: llm-discoverability → 4x Reddit citation lift + 32k-domain trust cliff (indie sites can't be cited directly; third-party consensus is their only path). Data: Reddit JSON (free) + Firecrawl search (cheap). Paid add-on bundled with #1.

**15. Ratings-velocity install-momentum proxy** — IV 4 / AM 4 / DF 4 / FS 4 (16) — **S**
Snapshot userRatingCount per (app, country) on the existing rank-history cadence; weekly delta benchmarked vs top-10 category median, provenance `inferred`. Grounded: store-conversion → install estimates are the most-paywalled number in ASO (Sensor Tower thousands/mo); velocity is a defensible free proxy. Near-zero marginal cost; value accrues with snapshot history.

**16. Apple LLM review-summary preview** — IV 3 / AM 4 / DF 5 / FS 4 (16) — **S**
Synthesize what Apple's iOS 18.4+ auto-generated review summary will say (weekly refresh, developer can't edit). Grounded: ratings-reviews → official Apple claim; no tool optimizes this surface. Same review corpus + LLM pass as #9, marginal cost ~zero. Demo-friendly: "Apple will tell users X about your app."

### Tier 3 — opportunistic / parked

**17. AI tag intelligence (App Store Tags diffing)** — IV 4 / AM 4 / DF 5 / FS 3 (16) — **M/L**. Tags are the concept layer Apple is building search around (apple-ranking → WWDC25 claim) and almost untracked — but requires storefront-aware SERP scraping of a new, drifting surface. Build after schema-drift monitoring proves stable on it.

**18. Inferred competitor keyword field reconstruction** — IV 5 / AM 5 / DF 5 / FS 2 (17 raw, feasibility-capped) — **L**. "See your competitor's hidden 100-char keyword field" is the highest-perceived-value item in the research (keyword-methodology), but quality scales with breadth of Sniffy's accumulated rank cache. Park until the cache is months deeper; then it's a moat feature nobody can replicate per-request.

---

## 3. Do NOT Build

| Item | Why |
|---|---|
| **Download/revenue estimates** | Panel-calibrated proprietary moat (Sensor Tower's priciest module; AppTweak 500 credits/call). Unreplicable from public data; faking it destroys Sniffy's provenance-honesty brand. Ship ratings-velocity proxy (#15) instead. (competitors-enterprise → moats claim) |
| **ASA popularity passthrough as primary signal** | The metric collapsed Oct 2025, floored below ~50, no Apple acknowledgement, custom-reports 403'd March 2026. Keep the flag-gated provider as a labeled overlay only. (keyword-methodology) |
| **AI review-reply management / CRM** | Commoditized to $15/mo (MobileAction) and done deeply by AppFollow (10B tokens, autonomous agent coming). Seat-shaped workflow product, not agent-buyable intelligence. (competitors-mid, competitors-indie-ai) |
| **Apple Ads impression-share / paid-keyword history** | Requires years of cross-account ASA harvesting; even point-in-time sponsored-slot detection needs private storefront APIs — legally and technically delicate. Defer "bidding apps" indefinitely. (competitors-enterprise → hard opportunity) |
| **CPP-in-organic detection** | Per-keyword SERP scraping + screenshot diffing, rate-limit hostile, enterprise-niche value. (apple-ranking → hard opportunity) |
| **Mass pSEO page generation for gosniffy.com or as a product** | March 2026 core update hit template pages with 30–80% losses; indexing throttle gates new domains anyway. Sell capped 5–10 page *briefs* inside the report instead. (pseo-landing) |
| **Play Console / App Store Connect OAuth integrations** | Owner-only data (vitals, retention, CVR) breaks the no-account, agent-buyable model and adds credential custody risk. Report Google's published thresholds as `inferred` proxies instead. (play-ranking) |
| **Subscription/seat tiers, dashboards, relational DB, custom facilitator** | Each contradicts a load-bearing constraint (PLAN.md): the per-request model IS the differentiation; no Postgres; official Morph facilitator only. |
| **Generic web SEO auditing** | Ahrefs/Semrush own it; Sniffy's edge is only the app-specific markup join (#7). |
| **Promo-content/LiveOps detection on Play** | JS-heavy, algorithmically targeted rendering → partial detection at best; binary signal not worth the scraper maintenance yet. (play-ranking → hard opportunity) |

---

## 4. Pricing-Asymmetry Callouts

The specific seat-locked features Sniffy can sell for cents per request:

| Locked feature | Where it's gated | Sniffy equivalent |
|---|---|---|
| Keyword popularity scores | Appfigures **$44.99/mo**; AppTweak API **$166/mo floor** (~$0.0066/datapoint marginal) | #2/#4: documented score, ~$0.02/keyword, no account |
| Competitor tracking | Appfigures **$149.99/mo for ONE competitor**; App Radar caps 25–250/tier | #9: 3–5 competitors fresh in every diagnosis, quota-free |
| Keyword translations / localization | Asodesk **$179/mo Guru** | #6: already-built franc analysis + locale arithmetic, per-report |
| AI review summaries | App Radar **50–100/mo quota at €169–299**; AppTweak Reviews **$83–833/mo**; Appbot API add-on **$166+/mo** | #8/#9/#16: uncapped per-report, LLM cost priced into x402 charge |
| Keyword Impact (before/after) | AppTweak **$299/mo Grow** | #13: derived from existing snapshots, included in diagnosis |
| AI visibility / prompt intelligence | AppTweak **Enterprise demo-gated**; Profound **$99–499/mo**; Ahrefs Brand Radar **$828–1,148/mo full** | #1: one-shot probe for ~$1–2, re-runs agent-schedulable |
| Schema/crawler GEO audits | Writesonic **$99–499/mo** (and app-blind) | #7: deterministic app-specific audit, free data, per-request |
| API access itself | Sensor Tower **$30k–150k/yr contracts**; MobileAction quote-only; App Radar "talk to sales" | The 402 offer **is** the price list — the only ASO data an agent can buy with money it holds |

**The structural sentence for all marketing surfaces:** every competitor's marginal data cost is near Sniffy's price, but their *minimum* price is a monthly seat plus a human with a credit card; Sniffy's minimum price equals its marginal price, settled autonomously over x402. No incumbent can follow without cannibalizing their subscription base — that asymmetry, not any single feature, is the moat. Convert it into distribution (#3) before building anything else large.