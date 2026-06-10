# Discoverability Research Corpus (2026-06-10)

Output of a 13-agent research workflow (10 firecrawl research dimensions → 2 synthesis agents → 1 adversarial critique) answering: *what would make Sniffy's scrape, results, insights, and recommendations the best discoverability tool for indie hackers and AI agents* — across App Store, Play Store, web search, and LLM recommendation surfaces.

**The actionable output is [`roadmap.md`](./roadmap.md)** — the approved wave-by-wave build plan. Everything else here is the evidence base.

## Synthesis documents (read these first)

| File | What it is |
|---|---|
| [`roadmap.md`](./roadmap.md) | The approved plan: first-principles summary, competitive moat, Waves 0–4, do-NOT-build list, architecture implications |
| [`fp-model.md`](./fp-model.md) | First-principles causal model of discoverability → conversion; every driver classified by measurability; platform asymmetry table; evidence grades ([CAUSAL]/[MECH]/[CORR]/[FOLK]/[CONFLICT]) |
| [`gap-analysis.md`](./gap-analysis.md) | Capability matrix (enterprise/mid/indie tools vs Sniffy), 18 ranked opportunities, do-NOT-build list, pricing-asymmetry callouts |
| [`critique.md`](./critique.md) | Adversarial completeness review: critical gaps C1–C5, the 5 load-bearing claims requiring verification (V1–V5), contradictions, verdict |

## Research dimensions (raw findings, each with sourced claims + opportunities)

| File | Dimension |
|---|---|
| `research-apple-ranking.md` | iOS search ranking: indexed fields, behavioral signals, LLM-augmented ranker (arXiv 2602.23234), screenshot-caption OCR, token mechanics, cross-locale indexing |
| `research-play-ranking.md` | Play ranking: indexed fields, published vitals/Core Value gates, Gemini-era AI surfaces, batchexecute public-data inventory |
| `research-store-conversion.md` | Conversion: rating curve, screenshot/video lifts, PPO/Play Experiments, category baselines, above-the-fold scroll data |
| `research-competitors-enterprise.md` | AppTweak / Sensor Tower / MobileAction: features, pricing, API access, agent-hostility |
| `research-competitors-mid.md` | Appfigures / Asodesk / AppFollow / Checkaso (dead) / FoxData / App Radar |
| `research-competitors-indie-ai.md` | Indie/AI-native tools, OSS scrapers, MCP landscape, vibe-coder workflow reality |
| `research-llm-discoverability.md` | GEO/AEO for apps: how LLMs pick apps, AI-visibility tool market, ChatGPT App Directory, Apple App Intents |
| `research-pseo-landing.md` | Web-side: schema.org/Smart Banner/AASA plumbing, pSEO post-HCU, authority cliff, web-to-app cannibalization |
| `research-keyword-methodology.md` | Where popularity/difficulty numbers come from; Oct 2025 ASA collapse; RespectASO open formula; the dead Apify actor's price point |
| `research-ratings-reviews-lever.md` | Ratings/reviews as rank+CVR lever; velocity vs stock; reset mechanics; review-mining tool pricing |

## Verification status (Wave 0 gates — see `critique.md` for full methods)

| # | Claim | Status |
|---|---|---|
| V1 | Screenshot-caption OCR indexed for iOS rank (single source: Appfigures) | ☐ unverified |
| V2 | Play "Core Value" thresholds are published policy | ☐ unverified |
| V3 | iOS territory→indexed-locales table ("US indexes 10") | ☐ unverified |
| V4 | Observable-signal heuristic popularity validity | ☐ unverified |
| V5 | LLM probe variance (share-of-voice methodology) | ☐ unverified |

Verdicts land in `verification-verdicts.md` as they complete.

## Provenance

- Generated 2026-06-10 by workflow `wf_1b003380-826` (10 firecrawl research agents, ~141 sourced findings, ~68 opportunities; firecrawl CLI against live competitor pricing pages, Apple/Google docs, and 2025–2026 industry studies).
- Live checks performed during critique: arXiv 2602.23234 exists (HTTP 200); checkaso.io dead (no DNS); Morph facilitator `/x402/v2/supported` live (`exact`, `eip155:2818`).
- Claims carry confidence labels; treat [FOLK]-graded items as priors, not facts. The two known echo risks: D1>35%/D7>15% retention bands appear in two dimensions from likely one vendor source; FoxData's "validation" of ASA integration predates the Oct 2025 collapse.
