# COGS per Report Section per Tier (Wave 0.3)

Decision rule (user-approved 2026-06-10): **per-request third-party API cost must stay under 30% of the tier price.** Quick stays deterministic-only. Budgets: quick $0.05 → ~$0 API; standard $0.20 → ≤$0.06; expert $1.00 → ≤$0.30.

Pricing snapshot (2026-06-10 — re-verify OpenAI/Gemini at build time; Claude verified via claude-api skill 2026-05-26 cache):

| Model | $/1M input | $/1M output | Source |
|---|---|---|---|
| gpt-5.4-mini (current `OPENAI_MODEL` default) | $0.75 | $4.50 | `scraper/src/synthesis/cost.ts` (2026-05) |
| gpt-5.4 | $2.50 | $15.00 | same |
| gpt-4o-mini (legacy override) | $0.15 | $0.60 | same |
| Claude Haiku 4.5 (vision candidate) | $1.00 | $5.00 | claude-api skill |
| Claude Sonnet 4.6 | $3.00 | $15.00 | claude-api skill |
| text-embedding-3-small | ~$0.02 | — | OpenAI (verify) |
| Gemini Flash tier | ~$0.10–0.30 | ~$0.40–2.50 | verify at build |

Vision token math: Claude ≈ (w×h)/750 tokens per image, ~1,600 tokens for a full-size screenshot → **~$0.0016/screenshot on Haiku 4.5 input**. gpt-5.4-mini vision assumed comparable (~1–2k tokens/image → ~$0.001–0.002) — verify.

## Per-section costs

| Section | Work | Est. cost/report | Notes |
|---|---|---|---|
| **Existing synthesis** (recommendations + ready-to-paste) | ~6–8k in + 2–3k out, gpt-5.4-mini | **~$0.015–0.02** | Already measured by `computeOpenAiCost`; pull real p50/p95 from logs before finalizing |
| **Existing localization copy** | ~0.5–1k tokens × N storefronts | **~$0.01–0.05** | Needs a storefront cap (suggest 10) to bound worst case |
| **Existing embeddings** (relevance gate) | ~1–3k tokens embedding | **<$0.001** | Negligible |
| Metadata mechanics linter | deterministic | **$0** | |
| estimatedConversionIndex + rating bands + reset advisor | deterministic (static corpus + lookup fields) | **$0** | |
| Experiment planner (PPO math) | deterministic | **$0** | |
| Keyword score (popularity/difficulty/chance/KEI) | extra iTunes calls only | **$0** API / infra only | Rate-limit budget, not dollars |
| Web discoverability audit | 1 HTML + 2 .well-known + robots.txt | **$0** | Cache by (domain, week) |
| **Creative vision pass — app only** (own 10 screenshots: captions, first-3 message, layout) | ~10 imgs × 1.6k tok + ~1k out, Haiku 4.5 | **~$0.02** | Cache by screenshot-URL hash — screenshots change rarely, so repeat buys ≈ $0 |
| **Creative vision pass — competitor stack** (top-5 × first 3 screenshots) | ~15 imgs + output | **~$0.03** | Competitor screenshots overlap heavily across customers in a category → cache compounds (commercial-host moat) |
| **LLM share-of-voice probe — single model** (10 prompts × 1 cheap model, no tools) | ~10 × (150 in + 250 out) | **~$0.01** | Cache by (appId, promptSet, week) |
| **LLM probe — full** (V5-calibrated: 10 prompts × 2 replicates × 2–3 models) | ~40–60 calls | **~$0.02 measured** (pilot: $0.157/500 calls on gpt-5.4-mini) | V5 RESOLVED 2026-06-10: phrasing-dominated variance → prompts beat replicates; mid-SOV apps need the ±pp band shipped with the number. Retrieval-on calls still unmeasured |
| shallowScan AI-mention bit (free quote) | 1 prompt × 1 model, cached weekly | **~$0.001 uncached, ≈$0.0001 amortized** | Safe for free tier |
| Review theme clustering (own app) | ~200 reviews ≈ 15k in + 1k out, mini | **~$0.016** | |
| Competitor negative-review miner (3 competitors) | ~3 × 10k in + 1k out | **~$0.035** | Play/iOS review fetches are free HTTP |
| Apple review-summary preview | ~5k in + 300 out | **~$0.005** | Rides the same review corpus |
| Citation footprint (Reddit + listicle scan) | Reddit JSON free + ~5 search-API queries | **~$0.005–0.015** | Use a cheap search API (Serper/Brave class), NOT Firecrawl credits, for production volume |

## Tier placement (the decision)

| Tier | Sections | Est. API COGS | Budget | Verdict |
|---|---|---|---|---|
| **quick $0.05** | All deterministic: existing template synthesis + mechanics linter + conversion index + experiment planner + web audit + keyword score | **~$0** | $0.015 | ✅ |
| **standard $0.20** | Quick + AI synthesis ($0.02) + capped localization copy ($0.02) + **app-only creative vision** ($0.02) + **single-model probe** ($0.01) + citation footprint lite (2 queries, $0.005) | **~$0.075 worst-case uncached** | $0.06 | ⚠️ ~25% over on a fully-cold request; fine on any cache hit. **Decide at Wave 1:** either raise standard to $0.25 or move citation-lite to expert. Recommendation: **raise to $0.25** — still 600x under the $166/mo anchor, and pricing.breakdown makes it transparent |
| **expert $1.00** | Standard + full 3-model probe ($0.07) + competitor creative stack ($0.03) + own review clustering ($0.016) + competitor review miner ($0.035) + review-summary preview ($0.005) + full citation footprint ($0.015) | **~$0.25** | $0.30 | ✅ |
| **per-keyword $0.02** | Keyword score + related searches, deterministic | **$0** API | $0.006 | ✅ infra-only |

Settlement cost: x402 settle gas is borne by the facilitator on Morph; treat as $0 marginal (verify no facilitator fee schedule appears before launch).

## Caching levers (margin improves with volume — the moat in numbers)
- LLM probes: (appId, promptSet, week) — weekly churn is the product feature AND the cache key.
- Vision: screenshot-URL hash — top-10 category apps' creatives are shared across every customer in that category.
- Web audit: (domain, week). Review corpus: (appId, country, day).

## Action items before any flag flips
1. Pull real synthesis token p50/p95 from production `openai_cost` logs (telemetry already ships) — replace the estimates above.
2. V5 pilot decides probe prompt count; re-cost after.
3. Verify gpt-5.4-mini vision token pricing + Gemini Flash current pricing.
4. Cap localization copy at 10 storefronts/report.
5. Surface per-section costs in `pricing.breakdown` so agents see what they're buying.
