# Distribution Wedge — Registry Submissions (Wave 0.5, prepared 2026-06-10)

Shipped in-repo (this branch): `GET /openapi.json` + `GET /llms.txt` on the scraper origin (runtime-generated from the Zod contract), `landing/public/llms.txt`, and the "why per-request" price-anchoring section in SKILL.md.

**The items below publish Sniffy to external registries — each needs an explicit go-ahead before submitting** (outward-facing, mostly irreversible, and some imply maintenance expectations).

## 1. x402 Bazaar (Coinbase discovery index) — highest priority
- Surface: `https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources` (23,863 listings swept 2026-06-10 — zero ASO intelligence, zero iOS data: we'd be first in both).
- How: CDP discovery listing for the `/api/v1/aso/diagnose` resource. Requires the 402 offer to be live (it is) and a CDP listing flow (check current docs at docs.cdp.coinbase.com → x402 → Bazaar discovery; the `discoverable: true` extension on the offer may be enough — verify against the x402-payments skill's Bazaar extension notes).
- Caveat: Bazaar coverage today is Base-centric; Sniffy settles on Morph (eip155:2818). Verify the index accepts non-Base networks before assuming visibility; if not, this becomes a Morph Skill Hub listing instead (see #5).

## 2. Official MCP registry (registry.modelcontextprotocol.io)
- Submit `@gosniffy/mcp` (and optionally the free `@gosniffy/aso-knowledge`).
- Closest existing entries are App Store Connect wrappers and signup-key-gated chart data — nothing self-serve-paid. Listing copy should lead with "no API key — pays per-call over x402".
- Mechanics: `server.json` manifest + namespace verification (com.gosniffy or io.github.TheoInTech). Maintenance expectation: keep manifest version in sync with npm releases.

## 3. Community registries (mcp.so, mcpservers.org, Smithery)
- Free-form submissions/PRs. Smithery prefers servers it can host — ours is stdio + env-var wallet, list as external.
- The two free local ASO-scraper MCPs (appreply-co/mcp-appstore, KenanAtmaca/aso-mcp) are listed on mcp.so — adjacency is good (comparison surface where we win on intelligence + hosting + iOS depth).

## 4. xpay.sh Agent-Ready Index
- They scored ASOdesk 49/100 ("x402_supported: false"). Sniffy should score near-perfect — request an evaluation; it's third-party proof of the moat claim. Low effort, high citation value (their pages get scraped by LLMs).

## 5. Morph Skill Hub
- Per the morph-network skill: Morph maintains a skill/agent hub. Sniffy is (per the 2026-06-10 sweep) the only ASO anything settling on Morph — flagship-listing potential, and judging-relevant for the hackathon track.

## 6. llms.txt directories (llmstxt.site, directory.llmstxt.cloud)
- Both origins now serve llms.txt; submission is a form/PR each. Minor, do in the same batch.

## Copy rules for ALL submissions (from verification-verdicts.md)
- Claim: "the only agent-payable ASO **diagnosis**; the only agent-payable **iOS** app-store data" — NEVER the broader "only agent-payable app-store data" (OpenWebNinja's x402 Play raw-data endpoints exist and judges can find them).
- LLM-visibility feature (when it ships): "only **per-request/agent-buyable** LLM visibility probe for apps" — LLM Pulse exists at €49/mo.
- Don't cite FoxData as validating ASA popularity (pre-collapse data).

## Watch items (re-sweep at each wave boundary)
- OpenWebNinja expanding from Play raw data into iOS or into scoring/intelligence.
- Appfigures MCP adding per-call billing (did NOT happen as of 2026-06-10).
- New entrants in Bazaar search for "app store", "ASO", "keyword".
