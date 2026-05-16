# Post-MVP Roadmap

Reference doc only — **not** a phase. These items are explicitly deferred past the hackathon cut per `PLAN.md` §6 Optional and §22.7. Listing them here keeps the roadmap visible without committing to ship them on the demo timeline.

## How this doc is structured

Items grouped by category. Each item has:

- **Source**: which PLAN.md section calls it out
- **Why deferred**: cost or risk that made it post-MVP
- **What unlocks it**: trigger conditions (paying users, mainnet ready, etc.)
- **Recommended owner**: which subagent would lead the work

## Data & report quality

### Android parity (full keyword rank accuracy)

- **Source**: `PLAN.md` §6 Optional, §11 (Android Preview)
- **Why deferred**: Play Store has aggressive bot detection; reliable rank sampling typically requires a paid data provider or a maintained scraper farm with proxy rotation
- **What unlocks it**: paying users in volume justify the data-provider cost, or a partner relationship with an existing Android ASO tool
- **Recommended owner**: `principal-backend-engineer` (skills: `senior-backend`, `firecrawl-agent` for sampling, `api-security-best-practices`)

### Review forensics

- **Source**: `PLAN.md` §6 Optional
- **Why deferred**: Review-text scraping at scale is rate-limited; useful AI synthesis on top requires careful prompt engineering and additional OpenAI cost
- **What unlocks it**: paying users explicitly request it; baseline `/diagnose` traffic justifies the added per-call cost
- **Recommended owner**: `principal-backend-engineer` (skills: `senior-backend`, `claude-api`)

### Multi-country opportunity scoring

- **Source**: `PLAN.md` §6 Optional, §20 (mentioned as a next-step in the video closer)
- **Why deferred**: A useful score requires cross-country keyword popularity signals that the public iTunes API does not expose
- **What unlocks it**: Apple Search Ads keyword popularity access (see below); paid data provider integration
- **Recommended owner**: `principal-backend-engineer`

### Metadata draft endpoint

- **Source**: `PLAN.md` §6 Optional
- **Why deferred**: The `readyToPaste` block in `/diagnose` already delivers most of the value; a dedicated endpoint adds API surface without obvious additional revenue
- **What unlocks it**: indie hackers ask for a CI-friendly "draft only, no diagnosis" endpoint to embed in release pipelines
- **Recommended owner**: `principal-backend-engineer`

### Apple Search Ads keyword popularity

- **Source**: `PLAN.md` §11, §21 (open question)
- **Why deferred**: Access depends on Apple credentials Sniffy does not own
- **What unlocks it**: a partner Apple Search Ads account that allows API access to the popularity data
- **Recommended owner**: `principal-backend-engineer`

### App Store Connect ingest (owner-provided data)

- **Source**: `PLAN.md` §11 (Optional App Store Connect API)
- **Why deferred**: Requires app owners to provide credentials; out of scope for a discovery-stage product
- **What unlocks it**: a customer with paid traffic asks for first-party data ingestion
- **Recommended owner**: `principal-backend-engineer`, with `principal-devsecops-architect` for credential handling

## Payment & onboarding

### Mainnet $0.01 demo transaction

- **Source**: `PLAN.md` §6 Optional
- **Why deferred**: Recording a single mainnet transaction adds video-production complexity beyond the demo cut; not required for track fit
- **What unlocks it**: when production mainnet pricing is announced (per `business-model.md` §2.3 / `PLAN.md` §24.2, Q3 2026)
- **Recommended owner**: `morph-x402-engineer`

### Card-funded credit balances (Reown on-ramp)

- **Source**: `PLAN.md` §5A Payment Friction Strategy, §24.2 / `business-model.md` §2.4
- **Why deferred**: Real fiat onboarding is a Q4 2026 milestone, not a hackathon scope
- **What unlocks it**: post-PMF demand from indie hackers who will not stand up a wallet for $0.10
- **Recommended owner**: `principal-frontend-engineer` (for the Reown UX) + `principal-backend-engineer` (for credit-ledger state — first place a relational DB might become justified)

### Team / metered API keys for agencies

- **Source**: `business-model.md` §2.4 / `PLAN.md` §24.2
- **Why deferred**: Requires usage-tracking infrastructure (per-key rate limit, monthly billing) that has no demo value
- **What unlocks it**: 2+ agency customers asking; clear ARR signal
- **Recommended owner**: `principal-backend-engineer` + `principal-devsecops-architect`

## Distribution surface enrichments (`PLAN.md` §22.7)

Each item in §22.7 of `PLAN.md` is deferred past the demo cut. Listed here in priority order:

### Vercel AI SDK tool snippet

- **Source**: `PLAN.md` §22.7
- **Why deferred**: Easy to add post-launch; copy-paste `tool({ ... })` definition; SDK already exposes the right types
- **What unlocks it**: any indie hacker on the Vercel AI SDK asks for it
- **Recommended owner**: `principal-frontend-engineer` (skills: `senior-frontend`, `next-best-practices`)
- **Effort**: ~1 hour

### Cursor `.cursorrules` rule

- **Source**: `PLAN.md` §22.7
- **Why deferred**: SKILL.md already covers Cursor agents that read Vercel skills; `.cursorrules` is a parallel format for older Cursor flows
- **What unlocks it**: Cursor users without skills support request a `.cursorrules` snippet
- **Recommended owner**: `general-purpose`
- **Effort**: ~30 minutes

### Claude Code subagent definition (`.claude/agents/sniffy.md`)

- **Source**: `PLAN.md` §22.7
- **Why deferred**: SKILL.md already serves Claude Code via the Vercel skills loader. A dedicated subagent definition is a different pattern with a separate lifecycle.
- **What unlocks it**: a Claude Code user who wants Sniffy as a callable subagent in their `.claude/agents/`
- **Recommended owner**: `general-purpose` (skills: `claude-code-guide`)
- **Effort**: ~1 hour

### n8n node template

- **Source**: `PLAN.md` §22.7
- **Why deferred**: n8n requires a packaged community node with its own publishing pipeline
- **What unlocks it**: an n8n user requests it; meaningful workflow-builder traction
- **Recommended owner**: `principal-backend-engineer`
- **Effort**: ~1–2 days (n8n node packaging + publishing)

### Zapier integration

- **Source**: `PLAN.md` §22.7
- **Why deferred**: Zapier has a developer-platform onboarding process and review cycle that exceeds the demo timeline
- **What unlocks it**: a customer pull from a Zapier-using indie hacker or agency
- **Recommended owner**: `principal-backend-engineer` + `general-purpose` (for the Zapier platform application)
- **Effort**: ~1 week including review wait

### Browser extension (App Store page overlay)

- **Source**: `PLAN.md` §22.7
- **Why deferred**: Distinct codebase (Chrome/Safari extension manifest, store review processes); meaningful UX work
- **What unlocks it**: post-PMF; useful for ASO consultants who live in App Store pages
- **Recommended owner**: `principal-frontend-engineer`
- **Effort**: ~1–2 weeks including store review

## Infrastructure & ops

### Background workers / cron refresh jobs

- **Source**: `PLAN.md` §10 (allowed to be added later without changing the frontend deployment)
- **Why deferred**: Hackathon traffic does not justify pre-warming the cache
- **What unlocks it**: cache miss rate exceeds the threshold in `business-model.md` §6 (cache hit ratio < 30% consistently)
- **Recommended owner**: `principal-devsecops-architect` (skills: `senior-devops`)

### Postgres / persistent storage

- **Source**: explicitly out of scope for MVP in `PLAN.md` §5A Non-Goals and `CLAUDE.md`
- **Why deferred**: Adds operational complexity; not needed for any current flow
- **What unlocks it**: credit-balance product line (above) — first justification for a relational store; report history retention as a product feature
- **Recommended owner**: `principal-backend-engineer` + `principal-devsecops-architect`

### Self-hosted facilitator fallback

- **Source**: `PLAN.md` §12 (mentioned as fallback only)
- **Why deferred**: The official Morph facilitator covers the MVP; forking is high-risk for marginal value
- **What unlocks it**: official facilitator outage during a critical demo window, **or** specific Morph network the official facilitator does not support that Sniffy needs to support for a customer
- **Recommended owner**: `morph-x402-engineer`

### BSL or SSPL relicense of `scraper/`

- **Source**: `PLAN.md` §23.1, §24.6
- **Why deferred**: MIT today is correct; relicense is an option preserved for the cloud-hosting-competition scenario
- **What unlocks it**: a competitor stands up `cloud-host-sniffy.example.com` and undercuts hosted pricing — at that point the option from §23.1 becomes load-bearing
- **Recommended owner**: `principal-devsecops-architect` + legal review (out-of-tree)

## Brand & legal

### "Sniffy" / "ASOSniffy" trademark filing

- **Source**: `PLAN.md` §23.2, §24.8
- **Why deferred**: Filing is a paid legal action; appropriate post-hackathon when there's clearer evidence the product continues
- **What unlocks it**: post-hackathon decision to continue building Sniffy
- **Recommended owner**: out-of-tree (legal)

## Notes for the coordinating agent

This doc is intentionally **not** broken into tasks the same way phases 00–09 are. Post-MVP work is reactive — each item ships when a customer signal (request, complaint, missing-feature feedback) creates demand. The agent reading this doc later should pick items based on signal, not order.

A useful first move post-MVP: skim `business-model.md` §6 metrics to see which numbers are weakest, then pick the item above most likely to move that metric.

## References

- `PLAN.md` §6 (MVP Scope, Optional list)
- `PLAN.md` §22.7 (Distribution surface deferred items)
- `PLAN.md` §23.1, §24.6 (relicense option)
- `business-model.md` §6, §7
- `CLAUDE.md` "Open-Source Posture"
