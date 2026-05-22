# Sniffy Business Model

Operational companion to `PLAN.md` §24. This doc is canonical for monetization decisions; PLAN.md §24 mirrors the headline structure for PRD readers. Phase docs **01, 02, 04, 05, 06, and 09** cross-link here.

## 1. Revenue thesis

**Pay-per-sniff is the wedge; agent-native metered billing is the durable revenue model.**

Sniffy is not a subscription dashboard competing with AppTweak, MobileAction, Appfigures, or Sensor Tower. Those products sell seats to growth teams. Sniffy sells **calls** to indie hackers and AI agents. The buyer is whoever is on the keyboard or in the agent loop at the moment a single ASO question needs an answer.

Why this works as a business:

- **Marginal cost of a call is low and bounded.** Apple iTunes API is free. Redis is cheap. The only meaningful variable cost is an OpenAI synthesis call. (See §3.)
- **No sales motion.** The agent surface (§22 in PLAN.md) — `SKILL.md`, MCP, CLI, SDK — is the distribution channel. There is no SDR, no demo call, no contract.
- **No account creation.** x402 settles per request. The wallet (or the agent's wallet) is the only identity Sniffy needs.
- **Volume is multi-mode.** Indie hackers buy a few sniffs per launch; agents can buy dozens per release pipeline run; agencies may buy a small steady stream for second-opinion checks.

## 2. Pricing strategy

Three eras, same wire format. The `pricing.breakdown` field in PLAN.md §9 is forward-compatible across all of them.

### 2.1 Hackathon (now — Hoodi testnet)

| Component | Price | Rationale |
|---|---|---|
| Base diagnosis | $0.03 | Granular enough to be visibly itemized in the demo |
| Add-on per keyword | $0.01 / keyword | 1–5 keywords per request (§8) |
| Add-on per country | $0.01 / country | MVP is single-country; field reserved |
| Competitor depth | $0.02 (shallow), $0.05 (deep) | Optional add-on |
| Typical demo request | $0.05 | 1 base + 2 keywords |

Demo request is what judges will run. The amount is intentionally small but real on the wire — it produces a settlement receipt and a transaction hash they can click through to the Hoodi explorer.

### 2.2 Mainnet demo (optional, per PLAN.md §6 Optional)

A single ~$0.01 USDC transaction on Morph mainnet (`eip155:2818`), recorded in the submission video, that proves the same code works against mainnet. **Not a pricing decision** — a proof-of-portability demonstration.

### 2.3 Post-hackathon, public (~Q3 2026)

| Plan | Price | Audience |
|---|---|---|
| Single sniff | $0.05–$0.50 | Indie hackers, AI agents (default) |
| Deep sniff (5 keywords, competitor trail, review forensics) | $0.50–$1.50 | Pre-launch decisions |
| Free `/sample` | $0.00 | Discovery, sanity-check, judges |
| Free `/quote` with `shallowScan` | $0.00 | Pre-payment value preview |

Pricing page lives at `sniffy.io/pricing`. The page mirrors the `pricing.breakdown` JSON.

### 2.4 Post-PMF (~Q4 2026+)

Two product lines layered on top of the same API:

- **Credit balances.** Card → USDC → Sniffy account credit via Reown AppKit on-ramp. Keeps the x402 backend intact; makes the front door card-payable for indie hackers who will never stand up a wallet for $0.10. PLAN.md §5A acknowledges this is the right friction reducer for mainstream users.
- **Metered API keys for agencies / power-users.** Same pricing; bill monthly to a card on file; same `pricing.breakdown` wire format.

## 3. Unit economics

### Variable cost per paid `/diagnose` call

| Component | Cost | Notes |
|---|---|---|
| Apple iTunes Search API | $0 | Free, public, rate-limited |
| App Store page sampling | $0 | Public scraping; amortized via Redis |
| Android preview (when used) | $0 | Public Play Store sampling, preview-quality |
| Redis read + write | < $0.0001 | Upstash or Railway Redis |
| **OpenAI synthesis** | **$0.005–$0.020** | **Dominant variable cost** |
| Morph x402 settlement | $0 (Hoodi) / negligible (mainnet) | Passed-through, not a Sniffy cost |

### Fixed costs

| Component | Cost (monthly) | Scales with |
|---|---|---|
| Railway dyno for `scraper` | ~$10–$50 | Concurrent request load |
| Vercel for `landing` | $0 (Hobby) → $20+ | Traffic on the demo |
| Upstash Redis | $0 → $10+ | Cache size + read volume |
| Domain + DNS | < $2 | Flat |
| OpenAI base cost | Variable | Per-call only — no minimums |

### Target gross margin

| Price | Variable cost (median) | Gross margin |
|---|---|---|
| $0.05 | $0.015 | **70%** |
| $0.10 | $0.015 | **85%** |
| $0.25 | $0.020 | **92%** |
| $0.50 | $0.020 | **96%** |

Target: **60–80% blended** at the $0.05–$0.50 band, well above sustainable. Cache hits drive this number up; OpenAI prompt size and model choice drive it down. See §6 for the metric to watch.

### Unit-economics spreadsheet structure (for tracking post-launch)

```
columns: date, plan, calls, revenue_usd, openai_cost, redis_cost, cache_hits, cache_misses, gross_margin_pct
rolling: 7-day average gross margin, 7-day cache hit ratio
alerts:  gross_margin_pct < 50% (investigate prompt size or model choice)
         cache_hit_ratio < 30% (investigate cache key strategy)
```

## 4. Customer segments

| Segment | Frequency | Price sensitivity | Notes |
|---|---|---|---|
| Indie hackers (primary) | Low — a few sniffs per launch | High | Sticky if first paid sniff produces a metadata win |
| AI agents (secondary today, dominant volume long-term) | Potentially very high — every release-pipeline call | Low (their owner pays) | x402 is the lowest-friction payment rail for an agent |
| ASO agencies / growth teams | Low — supplemental at most | Mixed | Not a target. They keep AppTweak/Sensor Tower seats |
| Hobbyists / students | Sporadic | Very high | Free `/sample` serves this segment; not a paying audience |

### Willingness-to-pay scoring rubric

Score each prospect on five axes when prioritizing GTM effort:

- **Frequency**: Does this user run ASO checks weekly, monthly, or one-off?
- **Stakes**: Is the cost of a bad app listing >> the cost of a sniff?
- **Tooling preference**: Do they live in a coding agent, a dashboard, or both?
- **Crypto fluency**: Can they sign an x402 payment without coaching? (Lower fluency = wait for credit-balance era.)
- **Reach**: If they like it, do they tell other indie hackers (network effect via build-in-public)?

The hackathon-era buyer scores high on Tooling preference (coding agent) and Crypto fluency, and medium on the rest. The post-credits-launch buyer scores high on Frequency and Stakes and low on Crypto fluency.

## 5. Distribution → revenue funnel

Each agent surface in PLAN.md §22 maps to a revenue path:

| Surface | Discovery → first call | Recurring revenue mechanism |
|---|---|---|
| `SKILL.md` (`npx skills add asosniffy/asosniffy-com`) | Coding agent reads the skill, calls `/quote` → `/diagnose` | Re-used on every related user prompt |
| `@gosniffy/mcp` (Claude Desktop, Cursor config) | User asks agent ASO question → agent calls `sniffy_diagnose` | Permanent install; called whenever ASO comes up |
| `@gosniffy/cli` (`npx sniffy ...`) | Indie hacker embeds in release pipeline / Makefile | Runs on every CI release |
| `@gosniffy/sdk` | Embedded in custom indie-hacker workflows | One install, many calls |
| Web demo (`landing/`) | Judge or curious indie hacker arrives, runs free `/sample` and `/quote` | Wallet flow converts to `/diagnose` |

The **MIT license is a revenue-funnel investment**, not charity. Closed source forecloses `npx skills add`, npm distribution, and the trust loop that makes agents trust an installable tool. Hosted `api.sniffy.io` is the wallet — that part does not open-source.

## 6. Metrics to track

Post-launch dashboard, sorted by priority:

| Metric | Target | What it tells us |
|---|---|---|
| Paid `/diagnose` calls / week | Grow week-over-week | Demand signal |
| Gross margin per call | > 60% blended | Pricing and OpenAI cost are aligned |
| Cache hit ratio | > 30% | Cache key strategy is working |
| Agent-vs-human payer mix | Trend toward 70%+ agent | Validates the agent-native thesis |
| Repeat-payer rate (same wallet within 30 days) | > 25% | First sniff produced enough value to motivate a second |
| `/quote` → `/diagnose` conversion | > 15% (judges/demo era), > 30% (post-PMF) | `shallowScan` is doing its job |
| `/sample` → `/quote` conversion | > 5% | Discovery funnel works |
| 402 retry success rate | > 95% | x402 payment flow is reliable |
| Mean time to first byte on `/diagnose` (cache hit) | < 200ms | Infra is healthy |
| Mean time to first byte on `/diagnose` (cache miss) | < 8s | OpenAI + provider chain is healthy |

## 7. Roadmap to sustainable revenue

| Horizon | Milestone | Revenue posture |
|---|---|---|
| 2026-05 (hackathon) | Hoodi testnet flow proves end-to-end | $0 revenue; demo validation |
| 2026-Q3 | Mainnet cut, public pricing page, first non-judge paying agents | First paid dollars |
| 2026-Q4 | Card-funded credit-balance UX via Reown on-ramp | Indie-hacker conversion friction drops; ARPU rises |
| 2027 | Agency/enterprise metered API-key tier; possible BSL/SSPL relicense on `scraper/` if cloud-hosting clones appear | Second revenue product on the same API |

The relicense option from §23.1 of PLAN.md is **load-bearing**: it lets Sniffy capture cloud-hosting margin in a future where competitors fork `scraper/` and undercut hosted pricing. MIT today does not foreclose that move.

## 8. What Sniffy is NOT (as a business)

Stating the negatives explicitly because they shape every product decision:

- **Not a subscription dashboard.** Recurring seat revenue is the incumbent model; we do not compete on it.
- **Not freemium-with-paywall-everywhere.** Free `/sample` and `/quote` are real value, not nag screens.
- **Not enterprise sales-led.** No SDRs, no demo calls, no signed contracts in the MVP era.
- **Not a SaaS clone of AppTweak / Sensor Tower.** Data depth is not the moat.
- **Not dependent on free-tier-to-paid-tier conversion.** Every paid call stands alone. Sniffy does not need a user to "convert" — it needs them to call `/diagnose` once.

## 9. Brand and trademark as moat

The durable moat is the **combination**, not any single piece:

- **Code** (MIT) is the adoption funnel.
- **Hosted `api.sniffy.io`** receives the x402 payments and is the maintained production service.
- **Accumulated Redis cache + report history** become richer with every paid call; a fork starts cold.
- **"Sniffy" / "ASOSniffy" wordmark and the pixel-detective mascot** are reserved as trademarks. Filing is a post-hackathon item. With MIT code, no fork can ship a "Sniffy"-branded competitor.

Acquirers and public-market investors price this shape on hosted revenue, customer book, brand, and accumulated data — not on code obfuscation. The strategy is the same shape that took HashiCorp, MongoDB, Confluent, Supabase, and Vercel to venture-scale outcomes.

## 10. References

- `PLAN.md` §5A — Market Reality and Competitive Positioning
- `PLAN.md` §12 — Payment Requirements (hackathon pricing source of truth)
- `PLAN.md` §22 — Agent-Distribution Surface (funnel surfaces)
- `PLAN.md` §23 — Open-Source & Commercial Posture (what's open vs commercial)
- `PLAN.md` §24 — Monetization & Business Model (PRD-side mirror of this doc)
