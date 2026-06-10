# Verification Verdicts (Wave 0.2 — 2026-06-10)

Six checks run by workflow `wf_f9327533-1a3` (V4/V5 are separate: V4 needs the keyword-score build, V5 needs the probe pilot — tracked below). Net effect on the roadmap: **nothing is blocked, three claims are reframed, one moat sentence must be narrowed.**

## V1 — Screenshot-caption OCR indexing: **PARTIALLY CONFIRMED → reframe (high confidence)**

The June 2025 App Store algorithm shift is real and well-attested, but the OCR mechanism is **contested**:
- Original source (Appfigures, 2025-06-16) is observational — "analyzed thousands of keywords", no controlled design; caption-placement sub-claims self-labeled speculation.
- **The only controlled independent test refutes broad indexing**: ConsultMyApp + APPlyzer tested 64 caption-derived phrases across 8 category leaders — 63/64 either didn't rank or were explained by existing indexed metadata. ([consultmyapp.com](https://www.consultmyapp.com/blog/-is-apple-now-indexing-screenshot-titles-on-the-app-store))
- Phiture/ASO Stack reports the OCR theory "has since been **denied by Apple**, and AppTweak echoed that position."
- Our own spot-check (2026-06-10): Audible (the one test anomaly) does not rank top-50 for its caption phrase via iTunes Search API.

**Roadmap effect (Wave 3.2 `screenshotIndexing`):** do NOT ship a caption→rank scoring signal as fact. Captions are a **conversion lever first**, with at most a contested auxiliary search signal. Any caption-keyword-alignment output carries `inferred` provenance + a "contested — Apple has denied OCR indexing" note citing both sides. Never write "Apple OCR-indexes screenshots" in API docs, report copy, or the knowledge corpus. The vision pass survives (caption readability/message analysis is conversion work, grounded in V2-grade A/B evidence); the *rank* framing dies.
**Also corrects:** fp-model.md's "double-duty screenshots" physics line and roadmap Part 1 — iOS screenshot ROI is conversion-dominant, not conversion+rank.

## V2 — Play "Core Value" thresholds: **CONFIRMED (high confidence)**

Published policy on two official Google properties:
- [support.google.com/googleplay/android-developer/answer/9844486](https://support.google.com/googleplay/android-developer/answer/9844486): DAU/MAU below **8%** → "a warning may be shown on your store listing, and your app may not be eligible to appear on certain surfaces"; user-loss rate above **5%** → same consequence. Crash **1.09%**/8% per-device, ANR **0.47%**/8% on the same page.
- [developer.android.com/quality/core-value/user-metrics](https://developer.android.com/quality/core-value/user-metrics) (updated 2026-03-06): "User loss rate < 5%. DAU divided by MAU > 8%."

**Roadmap effect (Wave 3.3 vitals proxy):** proceed; cite the canonical URLs in the knowledge corpus. Copy framing: "published Google Play quality bars" with three caveats — enforcement is discretionary ("may"), some treatments are beta, and the metrics only apply above a minimum user volume (24 of 30 days).

## V3 — iOS territory→indexed-locales table: **PARTIALLY CONFIRMED → reframe (high confidence)**

Three current vendors agree exactly on the US row (10 locales: en-US + es-MX, ru, zh-Hans, zh-Hant, ar, fr, pt-BR, vi, ko): AppTweak (Nov 2025), MobileAction (Apr 2026), aso.dev. One row-level disagreement (UK: en-AU per AppTweak/MobileAction; none per aso.dev). No evidence the mechanism stopped working post-LLM-ranker; fresh 2026 vendor guidance treats it as current.

**Reframe:** the "~10x" multiplier is **US-specific** — UK/DE/JP index ~2 locales (~2x), and the honest unit is keyword-field characters (up to 1,440 vs 160 in the US, per MobileAction). The table traces to 2022 AppTweak/Phiture fake-keyword tests, never Apple docs.
**Roadmap effect (Wave 3.1):** proceed with a per-territory table (favor AppTweak/MobileAction rows), territory-specific multipliers in copy, `inferred` provenance, and the planned one-keyword empirical confirmation before launch. Expect drift in minor territories.

## A1 — App Intents / Apple Intelligence discoverability: **PARTIALLY CONFIRMED → fix timing (high confidence)**

Substance is primary-sourced: Apple's own App Intents docs say "Make content and actions discoverable by Apple Intelligence" and the new "Apple Intelligence and Siri AI" adoption page + app-schema-domains page give a literal checklist. Timing correction: **IndexedEntity is WWDC24 (iOS 18)**, indexingKey macros are WWDC25; **WWDC26's wave is App Schemas as the Siri AI front door** (session 240) + SyncableEntity/RelevantEntities/IndexedEntityQuery etc., all **iOS 27 beta** until fall 2026.

**Roadmap effect (Wave 2.4 checklist):** proceed; checklist in adoption order (AppEntity/AppIntent modeling → IndexedEntity + indexingKey → app schema domain conformance → onscreen context/donations), with beta labels on iOS-27 items and no "new WWDC26 API IndexedEntity" framing.

## A2 — AppTweak AI Visibility "only player": **PARTIALLY CONFIRMED → narrow the claim (high confidence)**

- Demo-gating confirmed (2026-06-10 scrape): Enterprise-only, "Contact us for pricing", ChatGPT-only.
- **"Only mobile player" is REFUTED**: [LLM Pulse](https://llmpulse.ai) has sold self-serve mobile-app AI-visibility tracking since Nov 2025 (€49–299/mo, multi-engine, App Store/Play link citations).

**Roadmap effect (Wave 2.1 copy):** position as "**the only per-request, agent-buyable LLM visibility probe for apps**" — differentiated on pricing model + agent-buyability vs AppTweak (enterprise demo-gated) and LLM Pulse (subscription). Never claim capability uniqueness.

## A3 — "No agent-payable ASO API exists": **PARTIALLY CONFIRMED → narrow the claim (high confidence)**

Full sweep of all 23,863 x402 Bazaar listings + official MCP registry + Smithery + mcp.so (2026-06-10):
- **Refuted at the edges:** OpenWebNinja sells x402-payable Google Play **raw scrape data** at $0.01/call (USDC on Base); two free local open-source ASO-scraper MCPs exist (appreply-co/mcp-appstore, KenanAtmaca/aso-mcp).
- **The Sniffy lane is still empty:** zero x402/crypto-payable ASO *intelligence* (diagnosis, scoring, recommendations, provenance) anywhere; zero x402-payable *iOS/App Store* data in the entire Bazaar (coverage is Play-only); Appfigures MCP has NOT added per-call billing (plan + credits + API key — the named moat-breach did not happen); ASOdesk scored "x402_supported: false" on xpay.sh's agent-ready index; nothing agent-payable settles on Morph.

**Roadmap effect (all marketing/SKILL copy):** the moat sentence becomes "**no agent-payable ASO diagnosis exists, and no agent-payable iOS app-store data exists**" — the broader raw-data absence is now falsifiable by anyone who checks the Bazaar. Watch item: OpenWebNinja expanding from Play raw data into iOS or into scoring.

## Still open (separate tracks)

| # | Check | Status | Plan |
|---|---|---|---|
| V4 | Observable-signal popularity validity | **open** | No pre-Oct-2025 cached ASA ground truth exists (Sniffy is newer than the collapse). Validation design: (a) implement the score, (b) rank-order consistency vs autocomplete suggestion order across ~200 keywords × 5 categories, (c) face-validity panel (known head terms vs invented long-tails), (d) publish as the methodology page. Runs with the Wave 1.3 build. |
| V5 | LLM probe variance | **RESOLVED 2026-06-10** (`v5-probe-pilot.md`, 500 calls, $0.157) | **Verdict: a 10-prompt probe is stable for category leaders (SOV SD ±3–5pp) but noisy exactly where indie apps live** — Flighty (mid-SOV 51%) swung ±11.4pp with only 2/10 deterministic prompts. The variance is phrasing-dominated (most prompts sit at 0%/100%), so growing the PROMPT set beats adding replicates. **Wave 2.1 methodology decision:** 10 prompts × 2 replicates × 2–3 models (~40–60 calls ≈ **$0.02/report measured**, 3× under the COGS estimate); ship SOV with an explicit ±pp band derived from this pilot (±11pp single-shot at mid-SOV, ÷√replicates), plus the per-prompt table so deterministic misses carry the actionable story ("never named for 'best free app for X'"). Cross-model spread still to measure at build. |
| — | SplitMetrics impressions curve recalibration | open | Ship as "illustrative ceiling, 2019 data" until a ~$50 ASA discovery campaign recalibrates it (roadmap 1.3). |
