# @sniffy/cli

## 0.1.0

### Minor Changes

- f875158: Initial release of the Sniffy agent-distribution kit.

  - `@sniffy/sdk` — typed TypeScript client with `createSniffy({ baseUrl, signer? })`, automatic x402 payment retry on `diagnose`, and an exported `PaymentRequiredError` for consumers who want to drive the payment UX themselves.
  - `@sniffy/cli` — `npx sniffy quote|diagnose|sample` with provenance icons (`●live ◐cached ○fixture ◇inferred`), human-readable formatted output, and a `--json` flag for scripting.
  - `@sniffy/mcp` — Model Context Protocol server exposing `sniffy_quote`, `sniffy_diagnose`, and `sniffy_sample` over stdio, drop-in for Claude Desktop / Cursor.

  All three target the same `/api/v1/aso/*` API on Morph Hoodi testnet (`eip155:2910`). Wallet signing uses `viem` accounts; `SNIFFY_PRIVATE_KEY` for CLI/MCP — testnet only.

- 1e58950: Add keyword difficulty, listing-match granularity, and target-app momentum to the `/diagnose` paid response.

  - `KeywordDiagnosisItem` gains `difficulty: number | null` (1-100), `minDifficulty: number | null` (weakest of the top group), `difficultyIsFallback: boolean` (true when fewer than 5 competitor scores are available — we never fabricate the number), and `matchKind: "titleExactPhrase" | "titleAllWords" | "subtitleExactPhrase" | "subtitleAllWords" | "combinedPhrase" | "none"`.
  - `DiagnosePaidResponse` gains `targetAppSignals: { ratingsPerDay, momentumLabel: "growing" | "steady" | "declining" | null, daysSinceFirstRelease, daysSinceLastRelease } | null` — derived from `releaseDate` and `currentVersionReleaseDate` on the iTunes lookup. `null` for region-locked listings without a `releaseDate`.

  CLI table prints a new `diff` column and a `App momentum` block. MCP `sniffy_diagnose` description updated to list the new fields. SDK re-exports `KeywordMatchKind` and `TargetAppSignals`.

  Difficulty math derived from [semihcihan/App-Store-Optimization-CLI](https://github.com/semihcihan/App-Store-Optimization-CLI) (MIT — see `LICENSE-THIRD-PARTY.md`). Pinned to upstream commit `be885e2d74ec7af59b4efaf6042678ec7dc87f5c`.

- Surface Phase 8 + Phase 9 + Sprint A + Sprint B schema additions through the SDK / CLI / MCP.

  - **`QuoteResponse.savingsNote`** (Sprint A) — every `/quote` now returns an anonymous comparison vs typical ASO subscriptions (`message`, `estimatedSniffCost`, `typicalSubscriptionMonthlyUSD`, `typicalSubscriptionAnnualUSD`). The SDK re-exports `SavingsNote`.
  - **`QuoteResponse.shallowScan`** (Sprint A) — adds `metadataLengths[]` (per-field character usage counted by Unicode code points, matching App Store Connect's counter), plus optional `competitorPreview` and `suggestedKeywordCountBand` identity-only teasers.
  - **`Pricing.discounts[]`** (Sprint A) — refresh-sniff discount surfaced as positive line items; `estimatedTotal` is the net after discounts.
  - **`DiagnosePaidResponse.readyToPaste`** (Sprint B) — new `promotionalText` (iOS, 170 chars, refreshable without App Review) and `androidShortDescription` (Play, 80 chars, indexed) fields. Both nullable + default null for back-compat; the legacy `shortDescription` slot is retained.
  - **`SuggestedKeyword`** (Phase 9) — gains `relevanceScore`, `relevanceLabel` (`on-topic | adjacent | off-topic`), `relevanceSource`, `categoryMatch`, `origin` (`user | competitor | autocomplete | asa-rec | review`), and `popularity`. All nullable + default null so older SDK consumers see them as null rather than missing-key errors.
  - **`DiagnoseRequest` / `QuoteRequest`** (Sprint B) — optional `tier: "quick" | "standard" | "expert"`. Quick tier skips the OpenAI call and uses the deterministic template (cheaper, faster); Standard / Expert run full AI synthesis.
  - **Sniff Packs** (Sprint B) — prepaid credit purchase endpoint at `/api/v1/aso/sniff-pack/*` with Redis-backed balance ledger. Tiers: `sniff-pack-10` ($0.40 avg), `sniff-pack-50` ($0.30), `sniff-pack-250` ($0.20).
  - **Mainnet-only consolidation** — Hoodi testnet support was dropped 2026-05-21; SDK / CLI / MCP now default to and document Morph Mainnet (`eip155:2818`). The earlier changeset referencing Hoodi predates this consolidation.

  All changes are additive at the schema level; existing SDK consumers built against the previous shape continue to parse responses correctly.

### Patch Changes

- Updated dependencies [f875158]
- Updated dependencies [1e58950]
- Updated dependencies
  - @sniffy/sdk@0.1.0
