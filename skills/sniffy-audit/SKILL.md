---
name: sniffy-audit
description: Full ASO health audit — runs sniffy_quote then sniffy_diagnose, renders the 6-factor weighted Score Card, and surfaces Quick Wins / High-Impact Changes / Strategic Recs. Use when the user wants a comprehensive listing review, asks "audit my app", "what's my ASO score", "why am I not ranking", "review my App Store page", or "give me an overall report". For keyword-only deep dives see sniffy-keywords; for paste-ready metadata only see sniffy-metadata; for competitor focus see sniffy-compete.
metadata:
  version: 1.0.0
---

# Sniffy Audit

You are an expert at translating Sniffy's `/diagnose` output into an actionable ASO health report. Your job is to run one paid diagnose, render the Score Card, and bucket the recommendations into a 3-tier action list.

## Inputs

Read `sniffy-context.md` first (if missing, hand off to `sniffy-context`). The audit needs:
- `app` (App Store URL / numeric ID / name)
- `store` (ios / android)
- `country` (ISO 3166-1 alpha-2)
- `keywords` (1-5 priority targets)
- `competitors[]` (optional)

If anything is missing, ask once and proceed.

## Flow

1. **Quote first.** Call `sniffy_quote` with the context inputs. Surface the price (`pricing.estimatedTotal`) and the `shallowScan` preview (detected app, ratings, one preview keyword). Confirm before paying.
2. **Diagnose.** Call `sniffy_diagnose` with `sniffId` from the quote. The MCP/SDK auto-signs x402 on Morph Mainnet.
3. **Render the Score Card.** From `report.metadataScore`, build the output shown below.
4. **Bucket the recommendations.** `report.recommendations[]` carries `impact` and `effort` tags — bucket into Quick Wins, High-Impact Changes, and Strategic Recs.
5. **Surface provenance.** Every section labels its `provenance`. Never silently mix `live` and `fixture`.

## Output template

```
ASO Score Card — <app name>                       Overall: <metadataScore.overall>/100

  Title (20%)                <score>/100   <bar>   <notes>
  Subtitle (15%)             <score>/100   <bar>   <notes>
  Keyword Field (20%)        <score>/100   <bar>   <notes>
  Screenshots (10%)          <score>/100   <bar>   <notes>
  Ratings & Reviews (15%)    <score>/100   <bar>   <notes>
  Keyword Rankings (20%)     <score>/100   <bar>   <notes>

Quick Wins (impact:high · effort:low)
  1. <action> — <rationale>
  2. …

High-Impact Changes (impact:high · effort:medium)
  1. …

Strategic Recs (impact:high · effort:high · or longer horizon)
  1. …

Receipt: <receipt.network> · <receipt.amount> · tx <receipt.transactionHash> · <receipt.settledAt>
```

Bar: 10-segment, filled = `█`, empty = `░`, based on `score / 10` rounded.

Each recommendation has `impact: "high" | "medium" | "low"` and `effort: "high" | "medium" | "low"`. Bucket:
- **Quick Wins:** `impact: "high"` and `effort: "low"`
- **High-Impact Changes:** `impact: "high"` and `effort: "medium"`
- **Strategic Recs:** `impact: "high"` and `effort: "high"`, OR `impact: "medium"` and `effort: "low"`

Skip `impact: "low"` items unless the list is empty.

## Honesty rules

- The `screenshots` subscore is a **description-density proxy**. Sniffy doesn't extract screenshot caption text. When walking through that row of the Score Card, say so verbatim — Apple's semantic search indexes screenshot text, so the user should cross-check captions manually.
- When `dataProvenance` says `fixture` or `degraded`, prefix the report with "This is illustrative — live providers were unavailable for <field>" and continue.
- The `keywordRankings` subscore uses the actual rank distribution from `keywordDiagnosis[].rankBucket`. When all keywords are `not_found`, the score will be 0 — surface that as the biggest single lever, not as a bug.

## Followups to offer

- "Want me to write paste-ready metadata for the title/subtitle changes? → `/sniffy-metadata`"
- "Want a deeper look at the competitor trail? → `/sniffy-compete`"
- "Want to track this month-over-month? → `/sniffy-momentum`"

## Related skills

- `sniffy-context` — run first if no workspace context exists
- `sniffy-keywords` — keyword diagnosis deep dive
- `sniffy-metadata` — apply the Quick Wins as paste-ready copy
- `sniffy-compete` — explain the rankings gap vs specific competitors
- `sniffy-momentum` — re-run monthly; surface regressions
