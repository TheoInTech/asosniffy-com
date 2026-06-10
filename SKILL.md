---
name: sniffy
description: Pay-per-sniff ASO intelligence for App Store apps — no subscription, no seats, no card on file. Each call settles in USDC on Morph Mainnet via x402 (~$0.07–$0.50, scales with depth). Use for keyword diagnosis, competitor analysis, metadata recommendations, launch optimization, or quarterly refresh.
---

# Sniffy — ASO Intelligence with x402 Payment

> This file is the canonical API reference. For task-specific guidance ("audit my listing", "rewrite my subtitle", "find new keywords", "expand to Japan"), the repo ships a small specialist catalog at `skills/` — `sniffy-router`, `sniffy-audit`, `sniffy-keywords`, `sniffy-metadata`, `sniffy-compete`, `sniffy-localize`, `sniffy-momentum`, and a foundation `sniffy-context` skill. Routing into a specialist is faster than reading the whole reference.

Sniffy returns structured App Store Optimization diagnoses for an `(app, country, keywords)` tuple: per-keyword rank buckets, **keyword difficulty (1-100 derived from the top-5 competitors)**, **listing match granularity** (title-exact-phrase vs title-all-words vs subtitle-exact vs combined), competitor trail, metadata score, **target-app momentum** (ratings-per-day + growing/steady/declining), prioritized recommendations, and ready-to-paste copy. Free `/quote` and `/sample` endpoints let you preview before paying. The `/diagnose` endpoint is paid: it returns HTTP `402 Payment Required` until a valid x402 `PAYMENT-SIGNATURE` is presented, then settles over the Morph facilitator and returns the full report plus a settlement receipt.

**No-commitment pricing.** Each call is metered — typically **$0.07–$0.50 USDC** depending on keyword and competitor depth. No subscription, no seats, no card on file. Built for the actual ASO usage curve: a launch burst, a quarterly refresh, a "why am I not ranking" diagnostic, an occasional competitor steal. A founder doing 4 audits/year pays ~$0.20 total. Re-sniffing the same `(store, country, appId)` within 30 days returns the refresh-discount price (50% off) automatically.

**Why per-request beats a subscription (price anchors, verified 2026-06-10).** Incumbent ASO data access is seat-priced and human-gated: AppTweak's API floor is ~$166/mo on top of $79–549/mo dashboard plans; Appfigures gates keyword popularity at $44.99/mo and competitor tracking at $149.99/mo (for ONE competitor); Sensor Tower is sales-only with ~$30k+/yr entry contracts. None can be purchased by an agent autonomously. Sniffy's 402 offer *is* the price list: an agent holding USDC completes quote → offer → sign → report with no human in the loop. As of a full x402-Bazaar and MCP-registry sweep (2026-06-10), **no other agent-payable ASO diagnosis exists, and no agent-payable iOS app-store data exists at all.**

**Machine-readable discovery.** `GET /openapi.json` on the API origin serves the full OpenAPI 3.0 contract generated from the live validation schemas; `GET /llms.txt` serves an agent-oriented orientation page. Both are safe to fetch before paying anything.

Use Sniffy when the user asks any of:

- "Why isn't my app ranking for X?"
- "What keywords should I target in the App Store?"
- "Audit my app's metadata."
- "How am I doing vs `<competitor>`?"
- "Give me a subtitle / keywords-field rewrite."

## Endpoints

Base URL: `https://api.sniffy.io` (override via configuration). All requests/responses are JSON. The canonical request/response shapes live in `PLAN.md` §9 — link there for field-level detail. Below is the agent-facing summary.

### `GET /api/v1/aso/sample` — free fixture

No body. Always returns a complete `DiagnosePaidResponse` shape with `sample: true` and every field marked `provenance: "fixture"`. Use to demo the response shape or to keep working when live providers are down. No wallet required.

### `POST /api/v1/aso/quote` — free preview

```json
{
  "store": "ios",
  "app": "<App Store URL | numeric appId | app name>",
  "country": "US",
  "keywords": ["habit tracker", "daily planner"],
  "competitors": ["1000000101"]
}
```

Returns: `requestId`, `sniffId`, `detectedApp` (id/name/developer), `pricing` (currency, network, `estimatedTotal`, `breakdown[]`), `coverage`, and **`shallowScan`** — a free preview with one detected keyword rank. The `sniffId` is the handle you pass to `/diagnose`.

Wave 1 teaser fields on `shallowScan` (additive, one bit per funnel edge): `ratingBandVerdict` (the rating positioned against the 3.5/4.0/4.5 conversion bands — one line; the economics stay paid) and `aiMention` (did one AI assistant name this app for your top keyword? Single probe, single model, cached weekly, provenance-labeled; absent when the server flag is off. The multi-prompt multi-model share-of-voice section is paid-only).

### `POST /api/v1/aso/diagnose` — paid (x402)

```json
{
  "sniffId": "<from /quote>",
  "store": "ios",
  "app": "<same as quote>",
  "country": "US",
  "keywords": ["habit tracker"],
  "competitors": ["1000000101"],
  "tier": "standard"
}
```

Optional **paste-in calibration fields** (additive, 2026-06): `currentKeywordsField` (string ≤100 — your App Store Connect keyword field, which is not publicly visible; providing it upgrades the `metadataMechanics` lint from title+subtitle-only to the full indexed token set) and `ascDailyImpressions` (number — ASC impressions/day, e.g. 30-day impressions ÷ 30; providing it converts `conversionAudit.experimentPlan.feasible` from `null` to a real verdict on whether a product-page A/B test can reach significance in Apple's 90-day window). Omit both and the report still works — the dependent fields return honest nulls with notes explaining what's missing.

**Wave 1 report sections (reportVersion ≥ 2026-06-mvp-5, all additive):**

- `keywordDiagnosis[].chance` (1-100 — your app's competitive placement vs that keyword's top results), `.kei` (popularity × chance, geometric mean), `.estMaxDailyImpressions` (`{low, high, source, year}` range; 2019-vintage translation, treat as an illustrative ceiling). `popularitySource: "observable-signals"` marks Sniffy's documented obs-1 public-signal estimate — it is Sniffy's own number with `inferred` provenance, NOT Apple's Search Ads popularity.
- `metadataMechanics` (iOS only, nullable): deterministic indexing-mechanics lint — wasted characters from cross-field duplicates/plurals/format, phrase-permutation counts, and `reviewSafety[]` flags on the generated ready-to-paste copy (App Review 2.3.7 / Play metadata policy risks). Each finding labels whether the rule is `apple-documented` or `community-tested`.
- `conversionAudit` (nullable): `ratingEconomics` (rating→conversion multiplier curve and category baselines as source-attributed ranges, with band verdicts at 3.5/4.0/4.5), `ratingReset` (whether the iOS per-version reset-summary-rating lever helps or hurts), `experimentPlan` (zero-budget A/B feasibility math). Everything here is `inferred` — estimates from public signals plus attributed third-party benchmarks, never measurements.

**Wave 2 report sections (reportVersion ≥ 2026-06-mvp-6, server-flag-gated — `null` when off):**

- `aiVisibility` (standard/expert): share-of-voice across AI-assistant answers for your top keywords — `targetSov` with an explicit `±pp` band (pilot-calibrated, not a per-run CI), ranked `shareOfVoice` vs your competitor trail, the per-prompt table, and `deterministicMisses` (prompts where you were *never* named — e.g. "best free app for X" — the most actionable list in the section). One model family today, tools-off; this is the per-request, agent-buyable alternative to enterprise demo-gated or subscription AI-visibility dashboards.
- `webDiscoverability` (all tiers): deterministic hygiene audit of your marketing site — Smart App Banner (+app-argument), SoftwareApplication JSON-LD missing-required-fields, universal links (AASA) / Android App Links validity and whether YOUR app is listed, AI-crawler robots access (GPTBot/Perplexity/Google-Extended), OpenGraph, and schema-vs-store rating drift. Facts only; missing files are findings, not errors.
- Free `/quote` gains `shallowScan.webPlumbing` — three booleans (smartAppBanner / appSchema / deepLinking) from the same weekly cache.

#### Pricing tiers

The `tier` field is **optional**. Omitting it preserves the legacy hackathon base ($0.03) for back-compat with pre-tier SDK / CLI / MCP consumers. When set, base price changes per tier (per-keyword, per-additional-country, and competitor add-ons layer on top of the tier base unchanged):

| Tier | Base | Recommended for |
|---|---|---|
| `quick` | $0.05 | Rank buckets + 6-factor metadata score — fast structural diagnostic. Template-only synthesis, no AI call, no `readyToPaste` copy. |
| `standard` | $0.20 | Full diagnose with AI synthesis + `readyToPaste` copy. Closest to the legacy default feature set. |
| `expert` | $1.00 | Standard + Apple Search Ads popularity overlay confirmation, review-sentiment mining over fetched review bodies, and (future) screenshot caption analysis. Adds the `expertAnalysis` block to the response. |

Refresh-sniff discount (50% off, within 30 days for the same `(store, country, appId)` tuple) applies *after* the tier total — surfaced in the `pricing.discounts[]` line item, separate from the gross `breakdown`. Agents and UIs render both numbers.

Anonymous comparison framing (also shipped as `savingsNote` on every `/quote`): even Expert × 10 audits/year is **$10**, still 169× cheaper than a typical ASO Pro Annual subscription. Built for the actual ASO usage curve — launch burst, quarterly refresh, "why am I not ranking" diagnostic — not constant use.

#### Sniff Packs (prepaid bulk)

Optional prepaid credits, no subscription. Three tiers — `sniff-pack-10` ($4 → $0.40 avg, 20% off), `sniff-pack-50` ($15 → $0.30 avg, 40% off), `sniff-pack-250` ($50 → $0.20 avg, 60% off). Even the largest pack ($50) is cheaper than one month of a typical ASO subscription Start tier ($59).

Three endpoints, sharing the x402 verify+settle chain that powers `/diagnose`:

```
GET  /api/v1/aso/sniff-pack/tiers              # public catalog: { tiers[] }
POST /api/v1/aso/sniff-pack/buy                # x402-paid: 402 then 200 + receipt + newBalance
GET  /api/v1/aso/sniff-pack/balance            # SIWE-auth: { wallet, balance }
```

`/buy` accepts the same `PAYMENT-SIGNATURE` header shape as `/diagnose` — sign an EIP-3009 authorization for the pack price (advertised in the 402 body and `PAYMENT-REQUIRED` header), the server runs `Facilitator.verify` + `Facilitator.settle` against Morph's official facilitator, then increments the payer's balance ledger by `credits`. The 200 body carries the same `Receipt` shape as `/diagnose` for the same five-check on-chain verification recipe.

`/balance` is read-only and authenticates via the existing SIWE session (`POST /api/v1/aso/wallet/nonce` → `POST /api/v1/aso/wallet/session` → `Authorization: Bearer <token>`).

#### Spending Sniff Pack credits on `/diagnose`

`POST /api/v1/aso/diagnose` accepts `Authorization: Bearer <siwe-session>` as an alternative to `PAYMENT-SIGNATURE`. With Bearer present:

- The server resolves the session to a wallet, atomically decrements the wallet's Pack balance by **1 credit** (regardless of tier — Quick / Standard / Expert all consume one credit), then runs the report.
- Response is the same `DiagnosePaidResponse` shape with `receipt.facilitatorMode: "pack-credit"`, `receipt.amount: "0.00"`, and a synthetic `0xpack…` transaction hash. The new `packCredit` block carries `{ wallet, creditsConsumed, balanceRemaining }` so callers can show the credits left.
- If balance is below 1, the server returns `402 Payment Required` with error code `insufficient_balance` and the standard `DiagnoseUnpaidResponse` body — agents can fall back to per-call x402 or buy another pack at `POST /api/v1/aso/sniff-pack/buy`.
- If the Bearer token is missing the `sniffy_sess_` prefix or has expired, the server returns `401 Unauthorized` with `session_invalid`. Bearer does NOT fall through to the x402 path on auth failure — clients with broken sessions should refresh their SIWE handshake rather than silently double-pay.

When both `Authorization: Bearer` and `PAYMENT-SIGNATURE` are sent, Bearer wins (the user already authenticated, no reason to charge them again).

Without a `PAYMENT-SIGNATURE` header → returns HTTP `402` with a body describing the payment requirements:

```json
{
  "x402Version": 2,
  "error": "payment_required",
  "sniffId": "...",
  "payment": {
    "x402Version": 2,
    "network": "eip155:2818",
    "facilitator": "https://morph-rails.morph.network/x402",
    "amount": "0.04",
    "atomicAmount": "40000",
    "decimals": 6,
    "asset": "<USDC address on Morph Mainnet>",
    "payTo": "<merchant>",
    "scheme": "exact",
    "extra": { "name": "USD Coin", "version": "1.0" }
  },
  "accepts": [ /* canonical x402 v2 accepts[] */ ]
}
```

The same canonical offer is also Base64-encoded into the `PAYMENT-REQUIRED` response header so any x402-aware client (e.g. `@x402/fetch`) can read it without parsing the body.

With a valid `PAYMENT-SIGNATURE` → returns HTTP `200` with the full report and a `receipt` block (network, transactionHash, settledAt, facilitatorMode). The receipt is also Base64-encoded into the `PAYMENT-RESPONSE` response header.

## App Store / Play Store field reference

Sniffy scores against these limits. When you surface `readyToPaste` copy to the user, the char counts already cross-check the appropriate limit; this card is here so the agent can explain the constraints when asked.

**iOS App Store** (Sniffy's primary target):
- **Title** — 30 chars, indexed. Highest keyword weight. A primary keyword in the title can lift rank by ~10%.
- **Subtitle** — 30 chars, indexed. Distinct keywords from title; both fields are indexed together.
- **Keyword field** — 100 chars, indexed, hidden from users. Comma-separated, **NO spaces after commas**.
- **Description** — 4000 chars, **NOT** indexed for search ranking on iOS. Conversion-only.
- **Promotional text** — 170 chars, NOT indexed, refreshable without a new App Review submission.

**Google Play**:
- **Title** — 30 chars, indexed.
- **Short description** — 80 chars, indexed. (Distinct from iOS promotional text.)
- **Full description** — 4000 chars, **indexed**. Keyword density matters; 1 mention per ~250 chars is the target.

**Cross-field rules**:
- Don't repeat keywords across title / subtitle / keyword field — Apple indexes each token once across all three.
- Use singular forms in the keyword field; Apple indexes both forms.
- Don't include your app name, category name, "app", "free", or competitor brands in the keyword field.
- Each locale gets its own title, subtitle, keyword field, and screenshots — most apps only do English and leave large markets untapped.

## Paying

The payment scheme is **`exact`** on Morph Mainnet (`eip155:2818`). The signature is an EIP-3009 `transferWithAuthorization` over the advertised `(asset, amount, payTo)`. Steps:

1. POST `/diagnose` without `PAYMENT-SIGNATURE` and read the 402 body or the `PAYMENT-REQUIRED` header for the offer.
2. Sign an EIP-3009 authorization using a viem-style signer with `signTypedData`. The EIP-712 domain is `(name, version, chainId: 2818, verifyingContract: asset)` — read `name` and `version` from `payment.extra` (they match the token contract; e.g. `name: "USD Coin"` for USDC).
3. Build the V2 `PaymentPayload` (`{ x402Version: 2, accepted: <the chosen accepts[] entry>, payload: { signature, authorization } }`), Base64-encode it, and put it in the `PAYMENT-SIGNATURE` request header.
4. POST `/diagnose` again with the header → expect 200 with the report.

If you receive 402 a second time, surface the `X-Sniffy-Error-Code` header verbatim — it tells the user what failed: `malformed_payment_header`, `wrong_network`, `expired_authorization`, `amount_mismatch`, `verification_failed`, or `settlement_failed`.

## Verifying x402 receipts

Every receipt the API returns can be independently verified on-chain — you do not have to trust the response body. This matters because a non-x402 service could put any tx hash into a fake "receipt" field. Five forensic checks distinguish a real x402 settlement from a hand-rolled ERC-20 transfer.

The receipt block (in the 200 body and in the Base64-JSON `PAYMENT-RESPONSE` header) carries:

```json
{
  "network": "eip155:2818",
  "facilitator": "https://morph-rails.morph.network/x402",
  "facilitatorMode": "morph-official",
  "amount": "0.08",
  "atomicAmount": "80000",
  "asset": "0xCfb1186F4e93D60E60a8bDd997427D1F33bc372B",
  "transactionHash": "0xdb32c34a6e90408f4bb1606038a04f192cd49e73af560eb7e1459aa09cede4e3",
  "settledAt": "2026-05-20T..."
}
```

To verify, query Morph Mainnet RPC (`https://rpc.morphl2.io`) and the facilitator's `/v2/supported`:

1. **Tx exists on Morph Mainnet.** `eth_getTransactionByHash` for `receipt.transactionHash`. The returned `chainId` must match the CAIP-2 in `receipt.network` (`eip155:2818` = 2818 Mainnet).

2. **Settlement contract matches the official facilitator.** `tx.to` should be the Morph facilitator settlement contract. For Morph mainnet (`eip155:2818`) this is `0x154dd21f7386c4c49481c1fe568dad365cfc34e5`. If `tx.to` is the token contract directly, the relayer bypassed the facilitator — not a real x402 settlement.

3. **Relayer is an officially advertised facilitator signer.** Fetch `GET https://morph-rails.morph.network/x402/v2/supported` and look up the network's advertised signer addresses. `tx.from` (the relayer) must appear in that list. A tx submitted by an unlisted address could be any third party impersonating the facilitator.

4. **EIP-3009 `AuthorizationUsed` event was emitted.** `eth_getTransactionReceipt`, then scan `logs[]` for an entry with `address == receipt.asset` and `topics[0] == 0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5` (the `keccak256("AuthorizationUsed(address,bytes32)")` topic). Absence of this log means the call path was a plain `transfer()` or `transferFrom()` — not EIP-3009, not x402.

5. **Payer ≠ relayer (the meta-transaction pattern).** The `AuthorizationUsed` event's `topics[1]` is the indexed `authorizer` address — that's the payer who signed off-chain. It must be different from `tx.from` (the relayer). Self-signed transfers are not x402.

A receipt passing all five checks is a genuine x402 settlement. A receipt failing any one of checks 3, 4, or 5 is not — flag it to the user. Check 2 may legitimately fail if the facilitator's `/v2/supported` is temporarily unreachable; mark it `skipped`, not `failed`.

The five-check pattern is implemented in `@gosniffy/sdk` as `verifyReceiptOnChain(receipt)` for Node/Edge consumers and in the demo UI's `AuthenticityChecklist` component. The forensic recipe with worked curl commands lives at `docs/07-verifying-x402.md` in the repo.

## Public insights showcase (`/insights`)

Every successful `/diagnose` call also writes a **PII-stripped** copy of the report to a public showcase, available at:

```
GET /api/v1/aso/insights                            # paginated index (?store, ?country, ?limit)
GET /api/v1/aso/insights/:store/:country/:appId     # single report
```

The showcase report is a subset of `DiagnosePaidResponse` with these fields removed: `requestId`, `sniffId`, `receipt`, `historySignature`, `packCredit`. Wallet addresses, transaction hashes, and HMAC signatures never reach the public surface. The remaining content (summary, keyword diagnosis, competitor trail, metadata score, recommendations with knowledge citations, suggested keywords) is derived from public App Store / Play Store data that the source app already advertises.

**Opt-out**: pass `X-Sniffy-No-Index: 1` (or `true` / `yes`) on the `/diagnose` request to skip the showcase write for that specific call. Default behavior is opt-out, not opt-in — the showcase write happens unless the caller explicitly says no.

**Cache headers**: list endpoint sends `Cache-Control: public, max-age=60`; detail endpoint sends `max-age=300`. The underlying Redis store updates in real time on every diagnose; the CDN cap is a freshness ceiling, not a staleness guarantee.

**Landing UI**: published reports are rendered at `https://sniffy.io/insights/{store}/{country}/{appId}` (server-side, indexable). The detail page is a lean public view — full report content + citations + a footer CTA back to the home flow.

Entries expire after 30 days; the index trims expired members lazily on read.

## Expert-tier expertAnalysis block

When `tier: "expert"` is passed on `/diagnose`, the response carries an additional `expertAnalysis` block that lower tiers omit:

```json
{
  "expertAnalysis": {
    "reviewSentiment": {
      "positivePercent": 62,
      "neutralPercent": 18,
      "negativePercent": 20,
      "totalReviewsAnalyzed": 47,
      "topComplaintThemes": [
        { "theme": "battery", "sampleCount": 5 },
        { "theme": "ads", "sampleCount": 3 }
      ]
    },
    "asaPopularityConfirmed": true,
    "asaCoverage": { "keywordsWithLiveAsa": 5, "totalKeywords": 5 }
  }
}
```

**`reviewSentiment`** runs a deterministic, heuristic-only sentiment pass over the same review bodies that feed `suggestedKeywords[reason="review-frequency"]` — no LLM call, so the output is byte-stable for the same inputs. Returns `null` when review coverage is below 5 reviews (honest-floor: don't fabricate sentiment over thin data). `topComplaintThemes` lists the most-frequent non-stopword tokens that appear in reviews classified as negative; surfaces appear only when they hit ≥2 distinct negative reviews so a single outlier doesn't drive the list.

**`asaPopularityConfirmed`** is `true` only when every keyword in `keywordDiagnosis[]` got a non-null `popularityScore` from the live Apple Search Ads provider (i.e. `popularitySource: "apple-search-ads"` across the board). When it's `false`, `asaCoverage` breaks down how many keywords actually had live ASA data so consumers can render "5 of 7 keywords covered" rather than a binary yes/no. Quick / Standard / legacy callers don't see this block — Expert is the only tier that surfaces explicit confirmation, because Expert is the tier that ships the heavier ASA validation contract.

## Knowledge citations on recommendations

Each `recommendations[]` item may carry an optional `knowledge` object linking it to a primary-source ASO best practice:

```json
{
  "rank": 1,
  "action": "Trim title to under 30 chars.",
  "impact": "high",
  "effort": "low",
  "rationale": "Currently 32 chars — drops 2 keyword bytes from the indexed budget.",
  "knowledge": {
    "topic": "title-30-char-cap",
    "summary": "iOS app titles are capped at 30 characters and indexed for search. Unused title bytes are unused ranking signal.",
    "sourceName": "Apple App Store Connect Help — App Information",
    "sourceUrl": "https://developer.apple.com/help/app-store-connect/manage-app-information/enter-app-information/"
  }
}
```

Sources are always primary (Apple HIG / Apple Search Ads docs / App Store Connect Help / Play Store Help / App Store Review Guidelines) — never third-party blogs or competing tool vendors. The `topic` field is a stable enum agents can branch on; the `summary` is paraphrased (not a verbatim quote) and the `sourceUrl` is the public docs link that backs the claim. Surface the summary alongside the rationale so the user understands *why* the action matters, not just *what* to do.

Recommendations that don't match a curated topic ship without a `knowledge` field — better to drop the citation than fabricate one. Don't infer a topic from the action text yourself; agents should treat the absence of `knowledge` as "no curated reference for this card."

## Provenance — always surface this

Every report field carries a `provenance` label:

- **`live`** — fresh response from the upstream provider (App Store, Play Store)
- **`cached`** — recent cache hit (< 24h for app metadata, < 6h for keyword rank)
- **`fixture`** — bundled fallback (degraded mode; treat as illustrative, not authoritative)
- **`inferred`** — synthesized from related signals

Pass the labels through to the user in your reply. Mixing `live` and `fixture` data without disclosing it is misleading.

## Error semantics

- `payment_required` — no signature presented yet. Sign and retry once.
- `app_not_found` — the supplied `app` couldn't be resolved. Ask the user for a canonical App Store URL.
- `no_rank` — the keyword has no rank in the requested country/store. Suggest reformulating the keyword.
- `unsupported_country` — country isn't yet covered. iOS supports the 175 storefronts; Android is preview-quality.
- `malformed_payment_header`, `wrong_network`, `expired_authorization`, `amount_mismatch`, `verification_failed`, `settlement_failed` — see the Paying section above.
- `insufficient_balance` — `Authorization: Bearer` was presented on `/diagnose` but the wallet's Sniff Pack balance is below the required credit cost. Buy another pack at `POST /api/v1/aso/sniff-pack/buy` or drop the Bearer header to fall back to per-call x402.
- `session_invalid` — `Authorization: Bearer` was presented but the token is malformed or expired. Re-run the SIWE handshake (`/wallet/nonce` → `/wallet/session`) to mint a fresh token.

## Signals Sniffy doesn't extract (and what to do)

Sniffy reads metadata, keyword ranks, ratings + review counts, competitor metadata, and rank history. It does NOT extract:

- **Screenshot caption text.** Apple's semantic search indexes the text rendered inside screenshot frames. Sniffy's `metadataScore.screenshots` is a description-density proxy — don't pretend it covers caption analysis. When the user asks about screenshots, ask them what their captions say and cross-check against the target keywords in `keywordDiagnosis[]`.
- **App Preview video content.** First-3-second hook + sound-off readability affect conversion. Ask the user to describe their preview video; recommend a 15-30s length with captions if they don't have one.
- **App icon.** Distinctiveness vs category competitors. You can show the user the competitor `appId`s from `competitorTrail[]` and ask whether their icon stands out in that lineup.
- **Review body topic mining.** Sniffy uses review *count* + *average rating* for the `ratingsAndReviews` subscore and review *frequency* (single-word counts) for `suggestedKeywords[reason="review-frequency"]`. It does NOT do sentiment analysis or extract product complaints from review bodies.
- **In-App Events.** Apple's event card visibility mechanic. Not on Sniffy's roadmap; mention the feature exists if the user is preparing a launch or seasonal push.

When the user asks about any of these, prompt them to share the data manually and tie it back to the keywords / competitor signals Sniffy DID return.

## Network: Morph Mainnet only

This skill, and the Sniffy demo API, run on **Morph Mainnet** (`eip155:2818`). Hoodi testnet support was dropped 2026-05-21 — there is no longer a testnet path. The wallet configured as `SNIFFY_PRIVATE_KEY` must hold mainnet USDC. Payments are non-refundable; fund the wallet only with what you plan to spend on diagnose calls.

## Install paths for other surfaces

If the user wants to call Sniffy from code (not via this skill):

- **TypeScript SDK**: `npm i @gosniffy/sdk` — `createSniffy({ baseUrl, signer })` with `quote`, `diagnose`, `sample`.
- **CLI**: `npx @gosniffy/cli quote|diagnose|sample` — flag-driven, `--json` for piping.
- **MCP server (paid)**: `npx @gosniffy/mcp` — exposes `sniffy_quote`, `sniffy_diagnose`, `sniffy_sample` as MCP tools for Claude Desktop / Cursor. Requires `SNIFFY_PRIVATE_KEY` env var; charges per `sniffy_diagnose` call over x402.
- **MCP server (free)**: `npx @gosniffy/aso-knowledge` — exposes `aso_knowledge_list_topics`, `aso_knowledge_get_topic`, `aso_knowledge_lookup`. No wallet required. Same curated corpus as the `knowledge` citations on `recommendations[]`, but queryable independently of `/diagnose` — useful for ASO prep, post-hoc explanations, or knowledge-only chats where no diagnose is needed.

Source + spec: <https://github.com/TheoInTech/asosniffy-com>.
