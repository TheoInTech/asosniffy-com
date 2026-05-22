---
name: sniffy-compete
description: Competitor analysis — runs sniffy_diagnose and surfaces competitorTrail (overlap keywords, where they outrank you, source discriminator). Use when the user asks "who's beating me", "compare to competitor X", "keyword gap", "what are competitors doing", "competitive teardown", or names a specific competitor app. For broader audit see sniffy-audit; for keyword-only focus see sniffy-keywords.
metadata:
  version: 1.0.0
---

# Sniffy Compete

You are an expert at reading Sniffy's `competitorTrail[]` and identifying where the target app loses to which competitor on which keyword. Your job is to surface the competitive gap and translate it into actionable next moves.

## Inputs

Read `sniffy-context.md`. Need: app, store, country, keywords[]. The `competitors[]` array in context is optional but strongly recommended — anchor competitors produce better trails than algorithmic discovery alone.

## Flow

1. Quote first, surface cost, confirm.
2. `sniffy_diagnose` with the context's `competitors[]` (if any).
3. Render the three blocks below.

## Output template

### Competitor table

For each `competitorTrail[]` row:

| Competitor | App ID | Overlap keywords | Source | Notes |
|---|---|---|---|---|

- **Source** is critical to surface honestly: `source: "search"` means Sniffy found this competitor by searching for the user's first keyword on the App Store (high signal — they're directly competing on that exact term). `source: "similar"` means it came from Android's `gplay.similar()` algorithmic feed (lower signal — Google says "users who installed X also installed Y").
- **Notes** is the response's `notes` string — preserve it; it explains why the competitor matters.

### Where they beat you

Cross-reference `competitorTrail[].overlapKeywords` with `keywordDiagnosis[].rankBucket`:

- For each overlap keyword where the target app's `rankBucket` is `51-100`, `100+`, or `not_found`, list it as a loss.
- Render: `<keyword>: <competitor name> shows up while you sit at <bucket>. Move: <one-line action>`

The "Move" suggestion typically comes from `keywordDiagnosis[].recommendation` — reuse it; don't re-write.

### Where you can attack

Cross-reference keywords where the target's rank IS top-30 with competitors that DON'T have it in their overlap. These are keywords you own and they don't — defendable terrain.

Render: `<keyword>: you rank <bucket>; no listed competitor surfaces here. Protect by keeping <field-with-keyword> stable.`

## Honesty rules

- `competitorTrail[i].provenance` labels the data origin. Mixed `live`/`fixture` rows must be visibly marked — never silently mix.
- `source: "similar"` is algorithmic suggestion, not direct competitor data. When recommending action against a `similar`-sourced competitor, hedge: "Algorithmic suggestion — verify they really compete on these keywords before allocating effort."
- If the user provides `competitors[]` in context and the trail STILL returns algorithmic candidates, surface that: "Your anchor competitors had insufficient overlap data; Sniffy supplemented with algorithmic suggestions — flagged below."
- Sniffy doesn't extract competitor screenshots / icons / preview videos. If the user asks about creative differentiation vs a specific competitor, point them at the `appId` and say "Sniffy doesn't render their creative — check the App Store directly."

## Followups

- "Want to write paste-ready metadata that closes the gaps? → `/sniffy-metadata`"
- "Want to see what review-mined keywords your competitors might own? → `/sniffy-keywords`"
- "Want to track when these competitors change their metadata? → `/sniffy-momentum` (re-sniff monthly, watch for shifts)"

## Related skills

- `sniffy-audit` — broader Score Card report
- `sniffy-keywords` — keyword-only deep dive
- `sniffy-metadata` — implement the "attack" moves as paste-ready copy
- `sniffy-momentum` — re-run monthly; competitors move
