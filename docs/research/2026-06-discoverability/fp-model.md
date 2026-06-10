# First-Principles Model of App Discoverability + Conversion
### Synthesized from 10 research dimensions for Sniffy (2026-06-10)

**Citation notation:** `(dimension: claim-key)` references the research JSON. Evidence grades used throughout:
- **[CAUSAL]** — experimentally or officially confirmed (A/B test, published policy with numeric gates, first-party spec)
- **[MECH]** — documented deterministic mechanism (can be encoded as rules)
- **[CORR]** — correlational; plausible but no intervention evidence
- **[FOLK]** — practitioner folklore / vendor reverse-engineering; treat as prior, not fact
- **[CONFLICT]** — sources materially disagree

---

## 1. The causal model

```
                         ┌──────────────────────────────────────────────────────┐
                         │ FEEDBACK LOOP (the "physics engine")                 │
                         ▼                                                      │
[N] Need arises ──► [D] Discovery surface ──► [P] Product page ──► [I] Install ──► [R] Retention/quality
 (human or agent)     D1 store search                │                  │              │
                      D2 store browse/featuring      │                  ├─ ratings/reviews emitted
                      D3 web search                  │                  │   (→ rank, → conversion,
                      D4 LLM recommendation          │                  │    → LLM source material)
                      D5 social/referral             │                  └─ velocity signal → D1, D2
                                                     └─ web landing page is a parallel P for D3/D5
```

The funnel is **multiplicative**: installs ≈ Σ_surfaces (demand × visibility × tap-through × page-CVR), and the install/quality outcomes feed back into visibility. Any diagnosis that only measures keyword rank measures one factor of one term.

### Edge N → D: query/need formation
- **Driver: which words/intents users (and agents) express.** ~65% of App Store downloads follow a search (store-conversion: AppTweak ASA benchmarks, [CORR] but first-party-adjacent — Apple's own stat). Autocomplete actively steers query formation [MECH] (play-ranking: suggest endpoint; keyword-methodology: autocomplete is load-bearing in every commercial model).
- **New: intent is increasingly formed *inside* an AI** before any store is opened — info-seeking is 24% of ChatGPT interactions; zero-click ~60% (llm-discoverability: macro shift, [CORR]). The AI shapes the consideration set upstream of ASO entirely (llm-discoverability: "intent-driven shortlists... store rank NOT a direct input", [CAUSAL]-grade vendor analysis of mechanism).
- **Demand magnitude per keyword:** Apple's ASA popularity is the industry's only iOS ground truth, it is undocumented, campaign-gated, and **publicly broke in Oct 2025** (-77.4% of US keywords above floor) (keyword-methodology: collapse claim, [CAUSAL] as an observed event). The only published popularity→impressions mapping is impressions/day ≈ 254.44·e^(0.0615·SP) (keyword-methodology: SplitMetrics study, [CORR], 2019 data — stale floor behavior).

### Edge D1: store search rank (iOS)
Two officially named signal classes (apple-ranking: Apple developer page, **[CAUSAL]** — first-party):
1. **Textual relevance** — title, subtitle, keyword field, primary+secondary category. Mechanics are deterministic [MECH]: token combination within one locale only, plural stemming = duplicates, cross-field dedup, camelCase splitting, free auto-indexed words (apple-ranking: keyword field rules + token-combination claims). Each territory indexes multiple locales (US = 10) [MECH] — the cheapest keyword-space expansion that exists.
2. **Behavioral relevance** — downloads, ratings/reviews, engagement [CAUSAL that they matter; weights unknown]. Industry consensus puts download *velocity relative to category* first, then CVR, review velocity, retention (apple-ranking: AppRadar weights, **[FOLK]** — vendor reverse-engineering, no published weights).
3. **NEW third class: LLM semantic relevance.** Apple's Feb 2026 paper confirms the production ranker is augmented with LLM relevance labels, A/B-tested worldwide, +0.24% CVR, gains concentrated in **tail queries** (apple-ranking: arXiv 2602.23234, **[CAUSAL]** — the strongest single piece of evidence in the entire corpus). Semantic fit now competes with literal match exactly where indies compete.
4. **Expanded indexable surfaces** [MECH/empirical]: screenshot caption OCR since ~June 2025 (apple-ranking: Appfigures natural experiment across thousands of keywords — strong quasi-causal); CPP keywords rank organically since July 2025; in-app event names; promoted IAP names; LLM-generated App Store Tags. **Folklore correction:** descriptions and promotional text are NOT indexed on iOS (Apple first-party) — AppRadar's 2026 claim otherwise is [CONFLICT] and should be treated as wrong, with the nuance that the tag-generation LLM *does* read descriptions (apple-ranking: description conflict claim).

### Edge D1′: store search rank (Play)
- **Textual:** title (30) > short description (80) > full description (4,000), category, tags, promo cards [CAUSAL — Google's listing docs]. 2-3 natural mentions is current best practice; stuffing penalized ([CONFLICT]: AppTweak still advises repetition — direction agrees, aggressiveness disputed) (play-ranking).
- **Hard quality gates, officially numeric [CAUSAL]:** crash 1.09%/8%, ANR 0.47%/8% suppress discoverability with public listing warnings; **Core Value** thresholds — DAU/MAU < 8% or user-loss > 5% → warnings + surface ineligibility (play-ranking: vitals + Core Value claims). This is the only store where the behavioral side of ranking is published policy, i.e., genuinely causal.
- **Policy linter is causal:** banned words ("free", "best", "#1") trigger documented enforcement up to suspension (play-ranking: metadata policy, [CAUSAL]).
- **AI layer:** Ask Play / Gemini discovery reads listings, reviews, and *external web content*; reviews function as positioning data (play-ranking: I/O 2026 + Appbot analysis, [MECH] for surfaces, [CORR] for ranking effect).

### Edge D1″: SERP impression → tap (both stores)
- The search-result card (icon + title + stars + first screenshots) is the conversion unit before the page is ever opened; benchmark CTR-equivalent: impression→page-view 6-12%, iOS impression→install 3.6-3.8% (store-conversion, [CORR] benchmarks, source-conflicting by year — must be presented as ranges).
- Rating display gates taps: <3.5 visibility suppression, 4.0 credibility floor, top-3 cluster >4.5 (ratings-reviews-lever + apple-ranking: AppTweak thresholds — **[CORR]**, widely replicated but never intervention-tested; the 3.5 "cliff" is plausibly partly algorithmic, partly user behavior).

### Edge D2: browse / featuring / similar
- Featuring is editorial [unmeasurable process], but eligibility correlates with 4.0-4.4+ ratings ([CORR]) and on Play, promotional content is a Google-quantified lever: 2x explore acquisitions during featuring, median +106%; beta +5% MAU/+4% revenue (store-conversion + play-ranking, **[CAUSAL-ish]** — first-party quasi-experiment, selection bias possible).
- Similar Apps mechanics: category, comparable downloads, ratings, vitals, visual/text similarity (play-ranking, **[FOLK]** — 2020-era analysis, explicitly stale).

### Edge D3: web search → app
- Indie-owned sites face an **authority cliff**: ~32k referring domains ≈ 3.5x citation/visibility odds; below it, flat (llm-discoverability: SE Ranking, [CORR] with step-function shape). Practical consequence: indies win web discovery via third-party pages, not their own.
- App-specific web plumbing is binary, spec-defined [MECH/CAUSAL]: SoftwareApplication JSON-LD required fields, Smart App Banner with per-page app-argument (Apple uses it to index app content), AASA/assetlinks integrity (pseo-landing: Google/Apple spec claims).
- pSEO still works at long-tail but March 2026 core update targets scaled templates (30-80% losses) and the index-budget throttle binds first (910/65k indexed) (pseo-landing, [CORR] agency analysis on official policy).
- **Coupling warning:** web-to-app funnels can cannibalize store rank by diverting install/rating signal (pseo-landing: RevenueCat, [MECH] via the feedback loop; their own A/B found web checkout *reduced* net revenue 6% — [CAUSAL] within their test). The "82% of top apps use web-to-app" figure is **[FOLK]** (unverified methodology).

### Edge D4: LLM recommendation
- Mechanism [MECH, vendor-stated]: (training-set association between app name and use case) + (live retrieval of high-consensus web passages). Store rank is not a direct input (llm-discoverability: AppTweak Feb 2026).
- What moves it: Reddit/Quora mention volume ≈ 4x citation lift [CORR]; fact-dense "answer-block" content up to +40% in the Princeton GEO experiments (**quasi-CAUSAL** — actual intervention study, but 2023, generative engines have changed); vendor-owned comparison pages overweighted by ChatGPT vs Google (+11.1pts, [CORR]); citation behavior differs by engine — Perplexity cites 97%, AI Overviews 34%, ChatGPT 16% [CORR]; cited sources churn 40-60% monthly (llm-discoverability + pseo-landing).
- Two brand-new metadata-governed surfaces [CAUSAL specs]: ChatGPT App Directory (MCP server required; app NAME carries most indexation weight) and Apple's WWDC26 App Intents/IndexedEntity ("discoverable by Apple Intelligence" is literally a developer checklist).

### Edge D5: social/referral
- Reddit presence does double duty: direct referral + the dominant LLM citation substrate for "best app for X" (pseo-landing: Omnia; llm-discoverability). Referrer-sourced store traffic converts far higher than search-sourced (up to 67.5% impression→page-view vs ~3-6%, store-conversion: Storemaven, [CORR]).

### Edge P → I: product page conversion
- **90% of iOS visitors see only the top 10% of the page** (store-conversion: SplitMetrics scroll data, [CORR] but mechanically decisive): icon, title, stars, first 1-3 screenshots decide nearly everything; description first-lines barely matter on iOS.
- Star rating → CVR multiplier curve: 1.00 @5.0, 0.96 @4.5, 0.83 @4.0, 0.57 @3.0, 0.15 @2.0 (store-conversion: NP Digital, **[CORR]** — 49 firms, no intervention; cross-domain PowerReviews data adds that flat 5.0 converts like 3.0-3.49, so "perfect rating, thin volume" is a liability, [CORR]).
- Creative element ranking from thousands of A/B tests: screenshots > icon > video (**[CAUSAL] within tests**, SplitMetrics); video lift +15-25% vs 20-40% **[CONFLICT]** — present as range; landscape-video-with-portrait-screenshots demotion is a detectable defect [MECH].
- Conversion uplift from rating-band moves: 3→4 stars +89-92% (Apptentive-era, stated-preference, **[FOLK]**) vs +30-35% for 3.5→4.5 (Storemaven, 100M visitors, observed — prefer this) **[CONFLICT — must ship as labeled range]**.
- Category baselines vary ~100x (Navigation >100% vs board games 1.2%) and across years/sources **[CONFLICT]** — all grading must be category-relative, range-based, source-attributed (store-conversion).
- New surfaces composed from reviews: Apple's LLM review summaries (weekly, uneditable) and Play "Users are saying" — review themes are now literal listing copy [CAUSAL as mechanism] (ratings-reviews-lever, play-ranking).
- Zero-budget experiment levers [CAUSAL within-app]: Apple PPO (3 treatments/90d/90% confidence — traffic-bounded) and Play Listing Experiments (+20-45% in Google's case studies).

### Edge I → R → feedback (the loop)
- Play: retention/engagement/uninstall gates are **published policy** [CAUSAL] (Core Value). iOS: retention bands D1>35%/D7>15% are **[FOLK]** vendor consensus.
- Ratings/review emission: velocity is the recency-weighted input both stores reward (Play's displayed rating recent-weighting is **official [CAUSAL]**; "4.2 with 100 fresh reviews/wk beats 4.5 with 5/wk" is **[FOLK]** with mechanism support). Replies: Play reply-impact analytics are official; "responsiveness is a direct Play ranking signal" is a vendor claim **[FOLK]** (ratings-reviews-lever).
- Installs → ratings-count growth → both rank (behavioral) and conversion (social proof) → more installs: this loop is why velocity, not stock, is the operative variable everywhere.

---

## 2. Measurability classification of every driver

Classes: **(a)** Sniffy measures today · **(b)** public data, not yet built · **(c)** proxy (named, with validity) · **(d)** owner-only — ingestable if user pastes/connects ASC/Play Console · **(e)** unmeasurable.

### D1 iOS search-rank drivers
| Driver | Grade | Class | Notes / proxy validity |
|---|---|---|---|
| Title/subtitle tokens per locale | CAUSAL | **(a)** | iTunes lookup; multi-storefront already built |
| Hidden 100-char keyword field | MECH | **(c)** | Proxy: ranked-keyword-set minus visible tokens → inferred field. Validity: good for terms the app ranks on; blind to wasted keywords. Improves with Sniffy's cache breadth |
| Category (primary/secondary) | CAUSAL | **(a)** | |
| Token-combination/dedup/stemming waste | MECH | **(b)** | Deterministic simulator from documented rules; zero external data |
| Cross-localization indexation arithmetic | MECH | **(b)** | Static territory-locale table × existing per-locale fetches; extends built franc analysis |
| Screenshot caption text (OCR-indexed) | MECH (empirical) | **(b)** | Public screenshot URLs + OCR/vision LLM |
| App Store Tags (LLM concept layer) | CAUSAL (surface) | **(b)** | Scrape search results/product pages; storefront-aware; fragile |
| CPP-assigned keywords (own + competitors) | CAUSAL (surface) | **(b, hard)** | Screenshot-set diffing per keyword SERP; partial detection only |
| In-app event names / promoted IAPs | MECH | **(b)** | Page scrape; events render server-side |
| Semantic (LLM-label) relevance to tail queries | CAUSAL (exists) | **(c)** | Proxy: embedding similarity of metadata vs tail-query clusters (Phase 9 embeddings exist). Validity: directionally supported by Apple's paper; uncalibrated against actual ranker — label `inferred` |
| Keyword demand (search popularity) | CORR | **(c)** | Proxy stack: ASA popularity (provider built, flag off; upstream broken Oct 2025 + 91/175 market coverage), autocomplete presence/order (built; order-vs-popularity correlation is an **open, unpublished validation gap**), observable-signal heuristic (RespectASO formula — open-source reference, no published correlation study). Honest answer: nobody outside Apple has truth |
| Download velocity | FOLK weight / CAUSAL existence | **(c)** + **(d)** | Proxy: userRatingCount delta over snapshots vs category top-10 median. Validity: assumes stable review-emission rate per category — decent within-category, weak cross-category. Owner truth: ASC units |
| Conversion rate (search) | CAUSAL existence | **(d)** | ASC only. Weak proxy (c): rating-curve × creative-stack benchmarks |
| Engagement/retention | FOLK (iOS weights) | **(d)** / weak **(c)** | Proxy: review complaint themes ("crashes", "deleted") — low validity, label `inferred` |
| Update cadence | FOLK/CORR | **(b)** | currentVersionReleaseDate in lookup; full history via snapshots |
| Ratings avg/count per territory | CAUSAL (confirmed input) | **(a)** | |
| Review velocity/recency | FOLK (vs rating), MECH (Play) | **(b)** | iOS RSS timestamps already fetched; needs snapshot accumulation — near-zero marginal cost |

### D1′ Play search-rank drivers
| Driver | Grade | Class | Notes |
|---|---|---|---|
| Title/short/full description coverage | CAUSAL | **(a)** (preview) | gplay payload already fetched; Android is preview-tier by design |
| Policy-banned terms | CAUSAL | **(b)** | Static linter, trivial |
| Keyword stuffing (>3 mentions) | CONFLICT | **(b)** | Deterministic count; advice carries conflict label |
| Vitals (crash/ANR) | CAUSAL | **(d)** + **(c)** | Proxy: review crash-mention rate + public warning-badge detection. Validity: order-of-magnitude only ("4.1% of reviewers mention crashes; Google's gate is 1.09% user-perceived") — honest as `inferred` |
| DAU/MAU, user-loss rate | CAUSAL | **(d)** | Console only; thresholds reportable as knowledge-corpus facts |
| Per-locale localization fingerprint | CORR | **(b)** | "machine-translated summary + English title" detectable via hl/gl diffs; mirrors built iOS path |
| Promo content / LiveOps presence | CAUSAL-ish | **(b, hard)** | JS-heavy listing render; partial detection, label `inferred` when absent |
| Play autocomplete demand | CORR | **(b)** | suggest endpoint, free, plugs into Phase 9 pipeline |
| Review positioning vocabulary (feeds Ask Play) | CORR/MECH | **(b)** | Paginated public reviews per (lang,country); written reviews only — silent ratings invisible (document the blind spot) |
| Developer reply coverage/lag | FOLK (rank), CAUSAL (analytics exist) | **(b)** Play / **(e)** iOS | Reply fields in public Play payload; absent from iOS RSS |

### D2 browse/featuring
| Driver | Grade | Class | Notes |
|---|---|---|---|
| Editorial selection process | — | **(e)** | Only eligibility correlates measurable |
| Featuring presence / top-chart positions | CORR | **(b)** | Charts/featured lists scrapeable |
| Similar-apps placement | FOLK (stale) | **(b)** | gplay similar endpoint; mechanics low-confidence |

### D3 web
| Driver | Grade | Class | Notes |
|---|---|---|---|
| SoftwareApplication schema, Smart App Banner, app-argument depth, AASA/assetlinks integrity, robots/AI-crawler access | CAUSAL (spec) | **(b)** | One HTML fetch + two .well-known fetches; bundleId join Sniffy already has — uniquely positioned (store+web identity) |
| Schema-vs-store drift (stale rating/price in JSON-LD) | MECH | **(b)** | Compare against held store values; free |
| Domain authority / referring domains | CORR (cliff) | **(c)** / **(e)** | True count needs paid Ahrefs-class data; proxy: presence in top SERPs for canonical queries (cheap search API). Validity: coarse but actionable |
| Listicle/comparison-page presence | CORR | **(b)** | Cheap search API |
| Web-to-app funnel presence/quality | CORR | **(b)** | marketingUrl already in lookup |
| Indexation throttle status | CORR | **(d)** | Search Console only |

### D4 LLM
| Driver | Grade | Class | Notes |
|---|---|---|---|
| Mention/position in LLM answers per intent | MECH (output) | **(b, cheap-api)** | Direct measurement of the output, not a proxy: ~20 prompts × 2-3 cheap models ≈ cents. Provenance `live`. Nobody sells this per-request |
| Training-memory vs retrieval visibility | MECH | **(b, cheap-api)** | Probe with tools off vs on; binary, sharp verdict |
| Reddit/Quora mention footprint | CORR (4x lift) | **(b)** | Free Reddit JSON; per-competitor comparison |
| Citation-source composition per engine | CORR | **(b, cheap-api)** | Perplexity API returns citations; engines differ 97%/34%/16% |
| ChatGPT App Directory presence | CAUSAL (surface) | **(b, fragile)** | Directory scrape |
| App Intents / IndexedEntity adoption (Siri AI) | CAUSAL (spec) | **(e)** externally | Not visible from outside; ship as a checklist recommendation, not a measurement |
| Model internals / personalization | — | **(e)** | |

### P → I conversion
| Driver | Grade | Class | Notes |
|---|---|---|---|
| Star rating (displayed, per territory, current-version vs lifetime) | CORR (curve) | **(a)** | Curve translation = new derived field |
| Screenshot count/order/orientation, video presence | CAUSAL (within tests) | **(b)** | Lookup URLs + page scrape for video; vision LLM for caption/style classification |
| Caption OCR readability + keyword alignment | MECH | **(b)** | Same OCR pass as the rank-side audit — one pass, two report sections |
| Creative staleness (refresh cadence vs top-10) | CORR | **(b)** | Screenshot-URL hashing over existing snapshots; compounds with cache age (moat) |
| Apple LLM review summary content | CAUSAL (surface) | **(c)** | Proxy: simulate from same recent-review corpus, label `inferred` — actual summary not programmatically retrievable |
| CPP/PPO experiment configuration | CAUSAL | **(d)** | ASC-only; Sniffy can *plan* (sample-size math from rank-estimated impressions, class (c)) |
| Actual page CVR / impressions | CAUSAL | **(d)** | The single most valuable paste-in: 3 numbers from ASC (impressions, page views, installs) would calibrate the whole conversion section |
| Price/IAP structure | CORR | **(a)** | Lookup |

### R loop
| Driver | Grade | Class | Notes |
|---|---|---|---|
| D1/D7 retention, uninstall, DAU/MAU | CAUSAL (Play), FOLK (iOS) | **(d)** | Paste-in/Console-connect opportunity |
| Rating-prompt budget usage (3/365 iOS; Play quota) | CAUSAL (limits) | **(d)** behavior / knowledge for advice | |
| Review-velocity trajectory & displayed-vs-lifetime delta | CAUSAL (Play weighting) | **(b)** | Pure derived math on data already fetched |
| Rating-reset opportunity (iOS per-territory) | CAUSAL (mechanism) | **(b)** | current-version vs summary rating per territory — already in lookup fields |

**Summary count:** of ~45 distinct drivers, ~7 are (a) today, ~24 are (b) — public and unbuilt, ~8 are (c) with defensible proxies, ~8 are (d) ingestable owner data, and only ~4 are truly (e). The model says Sniffy currently measures <20% of the causally relevant surface while >70% is reachable with free/cheap data. The (d) class is an unexploited product: a "paste your ASC numbers" calibration input would convert several [CORR] estimates into [CAUSAL] per-app measurements.

---

## 3. Platform physics — where the same effort pays differently

| Effort | iOS | Android | Web | LLM surfaces |
|---|---|---|---|---|
| **Writing a long description** | ~Worthless for rank (not indexed — Apple first-party); indirect value only via tag-generation LLM | **High**: indexed (4,000 chars), source for Gemini "app highlights" and Ask Play | Moderate (page content) | High — it's what the models read |
| **Screenshots** | **Double-duty**: OCR-indexed for rank (since 6/2025) AND #1 conversion element — highest ROI asset on iOS | Conversion-only (no OCR-indexing evidence) | Reused as social proof | Marginal |
| **Localization** | **Arithmetic windfall**: each territory indexes up to 10 locales' metadata → ~10x keyword space for pure metadata work, no translation quality bar for the borrowed-locale trick | Linear: per-locale listings; auto-translated short descriptions mean a *bad default already exists* — effort = overriding it; documented ranking advantage | Per-market content cost | Regional source preference (US→Reddit, DE→forums) |
| **Engineering quality (crash/perf)** | Opaque behavioral weight [FOLK] | **IS ASO**: published numeric gates (1.09% crash / 0.47% ANR / 8% DAU-MAU / 5% loss) — fixing crashes is a literal, causal ranking intervention | n/a | Indirect via review sentiment |
| **Review velocity & replies** | Velocity [FOLK]-weighted; replies = conversion only; rating resettable per version/territory (one-shot lever) | Displayed rating officially recent-weighted → **recovery is faster**; reply-impact natively measured; responsiveness possibly direct signal [FOLK] | Reviews feed listicles | Reviews are positioning data the models quote |
| **A/B testing** | Traffic-gated: PPO needs impressions to reach 90% confidence in 90 days — low-traffic indies often can't run 3 treatments | **More accessible**: Play Experiments are flexible, localized, with official +20-45% case studies | Free (own site) | n/a |
| **Tail-query targeting** | **Newly winnable**: Apple's LLM labels rank tail queries on semantic fit where behavioral incumbency is weak [CAUSAL] — the indie's best fight | Guided Search groups by intent; semantic coverage matters | Long-tail pSEO still works below the scaled-abuse radar but index throttle binds | Tail intents are exactly what users ask LLMs |
| **Owned website** | Smart Banner/AASA = deep-link hygiene, binary payoff | assetlinks same | **Authority cliff**: below ~32k referring domains your site won't be cited — indies must *borrow* authority (Reddit, listicles, comparison pages) rather than build it | ChatGPT overweights vendor comparison pages (+11.1pts) — the one owned asset that punches above its authority |
| **One unit of "being talked about" (a Reddit thread)** | Weak direct effect | Weak direct | Moderate (link) | **Strongest**: 4x citation lift; consensus is the ranking function |

**The structural asymmetry:** on iOS, returns concentrate in *metadata mechanics* (deterministic, free, arithmetic); on Android, in *product quality and listing text* (published causal gates); on web/LLM, in *third-party consensus* (which the indie doesn't control but can measurably instrument). An indie hour is worth most on: iOS → cross-localization + screenshot captions; Android → crash fixes + short description; LLM → earning two Reddit/listicle mentions.

---

## 4. The ideal free teaser, the ideal $0.20-$1.00 diagnosis, and the missing section

### Ideal free quote (`shallowScan`) — one bit per funnel edge, zero paid leakage
Stays within PLAN.md §22 (identity, category, ratings summary, one keyword bucket) and adds **count-level/boolean hooks** that each create a distinct reason to pay:

1. **Identity + catalogVerified** (built).
2. **Rating threshold verdict** — one line positioning the existing ratings summary against the 3.5/4.0/4.5 bands: "3.8★ — below the 4.0 credibility threshold in 3 of 5 requested countries." (Derived from data shallowScan already includes.)
3. **One preview keyword bucket** (built).
4. **Localization waste counter** — a number only: "7 indexed-but-empty locale slots in your target storefront." (Count, not the fill list.)
5. **AI mention bit** — one canonical intent prompt to one cheap model, cached weekly: "ChatGPT did not name your app for your top intent." (<$0.001/quote; the emotionally strongest hook in the corpus.)
6. **Web plumbing bits** — "Smart App Banner: missing · app schema: missing · universal links: broken" (three booleans from one cached fetch; no competitor ever fetches the marketing URL).

Each teaser maps to a different funnel edge → the quote itself demonstrates the causal model and makes the paid report's table of contents self-evident.

### Ideal $0.20-$1.00 diagnosis — organized by funnel stage, not by data source
Every field range-based, source-attributed, provenance-labeled; conflicts shipped as `{low, high, source, year}`:

**§1 Demand** — keyword popularity as a *documented* observable-signal score (the thing that broke in Oct 2025 is exactly the dependency Sniffy doesn't have) + the SplitMetrics impressions translation ("~3,000 impressions/day ceiling", cited, with staleness caveat) + autocomplete/ASA-recs corroboration. *(c-class, mostly built)*

**§2 Visibility mechanics** — token-combination waste simulator (wasted chars, newly reachable permutations); cross-localization fill plan (ready-to-paste per borrowed locale); screenshot-caption OCR rank audit; tags diff vs category leaders; difficulty/chance/KEI with transparent math + brand-term flag; inferred competitor keyword field. *(b-class, free data)*

**§3 Behavioral standing** — ratings-velocity vs top-10 median (install-momentum proxy, `inferred`); review-velocity gap; displayed-vs-lifetime delta (Play) and current-version-vs-summary per territory (iOS) with a **rating-reset advisor**; Android vitals proxy with Google's exact published gates quoted. *(b/c-class)*

**§4 Conversion** — creative-stack gap vs the top-10 for the app's #1 keyword (video presence rate, screenshot count/orientation, caption style — vision LLM); `estimatedConversionIndex` from the rating curve × category baseline (range + sources); creative staleness; simulated Apple review summary ("what Apple will tell users about you"); **zero-budget experiment planner** — can your traffic reach PPO significance in 90 days, and the single highest-leverage treatment if not. *(b/c-class)*

**§5 Off-store discovery** — LLM share-of-voice across 10-20 intents × 2-3 models (mention, position, sentiment, who wins instead); memory-vs-retrieval split; Reddit/listicle citation-footprint gap vs competitors; web audit (schema required-fields, banner app-argument depth, AASA/assetlinks integrity, schema-vs-store drift, AI-crawler access). *(b-class, cheap-api)*

**§6 Best next sniff** — recommendations **ordered by causal leverage per hour for this app's platform** (the §3 physics table operationalized), each tagged [CAUSAL]/[CORR]/[FOLK] so an agent knows which advice is mechanical and which is prior. Plus the closed loop: re-diagnose after the change and §2's before/after Keyword-Impact view measures it.

Optional calibration input: paste three ASC numbers (impressions/page-views/installs) → converts §4 from estimate to measurement. No competitor ingests owner data per-request.

### The single highest-leverage missing section
**The conversion audit (§4): an above-the-fold product-page diagnosis — creative-stack gap vs category top-10 + rating-economics curve + experiment planner.**

Why this over everything else:
- **It is the multiplicative gate on every discovery surface.** Sniffy today diagnoses rank (one input to one surface); conversion multiplies *all five* surfaces, and via the behavioral feedback loop (CVR → rank), it is also *upstream of the thing Sniffy already measures*. Fixing rank without fixing a 0.57x rating multiplier or a missing first-screenshot message is treating the symptom.
- **The evidence here is the strongest non-Apple causality in the corpus** — thousands of A/B tests (screenshots #1, single-change 119K-install case), versus the [FOLK]-grade weights underlying most rank advice.
- **It is fully buildable from free/cheap public data** (lookup screenshots + page scrape + one vision-LLM pass + static benchmark tables), and the incumbents (SplitMetrics, Storemaven, AppTweak creative intelligence) sell it only as agencies/enterprise dashboards — no per-request, agent-readable version exists anywhere.
- Runner-up: the LLM share-of-voice probe — larger long-term strategic value as discovery shifts upstream of stores, and an unoccupied market, but it covers a (today) smaller share of installs; conversion improves every install that any surface, including LLM recommendation, sends to the page.