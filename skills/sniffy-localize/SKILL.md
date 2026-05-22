---
name: sniffy-localize
description: Multi-storefront localization gap analysis — runs sniffy_diagnose and surfaces localizationAnalysis (per-storefront gap scores, title variants across countries, AI-translated paste-ready copy for mismatched storefronts). Use when the user mentions a country other than their primary, says "expand to Germany / Japan / Brazil", "translate listing", "localize", "I'm missing markets", or asks about per-locale keyword research. For full audit see sniffy-audit.
metadata:
  version: 1.0.0
---

# Sniffy Localize

You are an expert at reading Sniffy's `localizationAnalysis{}` block and turning it into a market-expansion plan. The block covers multiple storefronts (the request's country + configured `LOCALIZATION_STOREFRONTS`) and flags ones where the listing isn't actually localized for that market's expected languages.

## Inputs

Read `sniffy-context.md`. Need: app, store, primary country, target keywords[]. If the user wants per-country deep diagnose for a *secondary* market, recommend a follow-up diagnose with that country as the request's `country`.

## Flow

1. Quote first, surface cost, confirm.
2. `sniffy_diagnose`.
3. Render three blocks below from `localizationAnalysis{}`.
4. If the user wants paid depth in a specific *secondary* country (e.g. Japan-specific keyword ranks), run a fresh diagnose with `country: "JP"` — cache may have it cheap.

## Output template

### Per-storefront gap table

For each `localizationAnalysis.storefronts[]` row:

| Country | Title | Localized? | Gap | Description lang | Expected | Notes |
|---|---|---|---|---|---|---|

- **Localized?**: `localized: true` ✓ / `false` ✗ / `null` ◐ (unable to determine — usually missing description below detectionMinChars)
- **Gap**: `gapScore` 0-100 (higher = more localization drift)
- **Description lang**: `descriptionLanguage` (detected via franc, or `null` if below `detectionMinChars`)
- **Expected**: `expectedLanguages[]` for that storefront
- **Notes**: `error` if present, otherwise blank

End with `localizationAnalysis.overallGapScore` and `unlocalizedCount` — the headline metric.

### Title variants across markets

`localizationAnalysis.titleVariants[]` is the deduped list of titles the app actually publishes per storefront. Surface them as-is — useful for the user to verify they're not accidentally English everywhere.

### Recommended copy for mismatched storefronts

For each storefront where `localized === false` AND `recommendedCopy` is populated:

- `recommendedCopy.source === "openai"` — Sniffy auto-translated this. Render `title`, `subtitle`, `shortDescription` as paste-ready blocks for that storefront. Label as AI-translated; the user should verify with a native speaker before publishing.
- `recommendedCopy.source === "deferred"` — Sniffy surfaced a "translate this listing" recommendation card instead (OpenAI key missing or quota hit). Point the user at the recommendation in `report.recommendations[]`.

When `recommendedCopy` is `null` across all storefronts, the AI translation layer wasn't enabled for this diagnose — flag it ("translation layer deferred; see recommendations[] for a flagged action").

## Honesty rules

- `localized: null` is honest, not missing. `descriptionLanguage` couldn't be detected because the description is too short (below `detectionMinChars`) — say so in the notes column.
- `recommendedCopy.source: "openai"` is AI-translated — always recommend native review before publishing.
- Sniffy's gap score is metadata-only. It does NOT check whether your in-app strings are localized, whether your App Store screenshots are localized, or whether your support email is localized for the market. Surface that explicitly when the user asks about market readiness.
- `localizationAnalysis === null` means the localization layer was disabled (`LOCALIZATION_ENABLED=false`) or all storefronts errored out. Don't pretend to render a gap analysis from missing data.

## Followups

- "Want paste-ready metadata for the storefronts that need translation? Re-run `/sniffy-metadata` with `country: <ISO>` for each."
- "Want to see per-country keyword ranks (not just localization gap)? Re-run `/sniffy-keywords` with `country: <ISO>` — the cache will be warm if you sniffed within 24h."

## Related skills

- `sniffy-context` — add additional countries to the workspace context
- `sniffy-metadata` — paste-ready translations for mismatched storefronts
- `sniffy-keywords` — per-country keyword ranks; one diagnose per country
- `sniffy-audit` — overall Score Card; uses primary country only
