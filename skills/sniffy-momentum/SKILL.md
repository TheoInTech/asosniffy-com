---
name: sniffy-momentum
description: Trend and momentum tracking — runs sniffy_diagnose and surfaces targetAppSignals (ratings/day, momentum label, days since release/update), regressions[] (keywords that dropped ≥10 positions vs 7-day median), and per-keyword trend sparklines (via /history). Use when the user asks "why did I lose rank", "show my trend", "what changed since last week", "how is momentum", "I lost top 10 on X", or "re-sniff for tracking". Best run on a monthly cadence; the cache makes re-sniffs cheap.
metadata:
  version: 1.0.0
---

# Sniffy Momentum

You are an expert at reading Sniffy's trend signals and surfacing what changed since the user's last sniff. The block has three pieces: `targetAppSignals` (the app's own velocity), `regressions[]` (keywords that recently dropped rank), and `keywordDiagnosis[].trend` (per-keyword 7d/30d deltas).

## Inputs

Read `sniffy-context.md`. Need: app, store, country, keywords[].

If this is a first-ever sniff for this `(app, country, keyword)` tuple, `regressions[]` will be empty (no history yet) and `keywordDiagnosis[].trend` will be `null` per keyword. Surface that as "cold start — re-run next month to get the trend signal" rather than as a bug.

## Flow

1. Quote first, surface cost, confirm.
2. `sniffy_diagnose`.
3. (Optional) Pull `/api/v1/aso/history` for any keyword the user calls out specifically — the response carries a `historySignature` HMAC the SDK uses.
4. Render the three blocks below.

## Output template

### App momentum

From `targetAppSignals` (null if AppRecord wasn't fetched or release date missing):

- **Ratings velocity:** `<ratingsPerDay>` ratings/day, label: `<momentumLabel>` (`growing` / `steady` / `declining`)
- **Days since first release:** `<daysSinceFirstRelease>`
- **Days since last update:** `<daysSinceLastRelease>`

Frame the velocity number with one comparator: <10/day for niche apps, 50+/day for category leaders. Don't fabricate a benchmark — say "typical for category" or "above category median" only if the user has supplied a competitor anchor and the comparison is honest.

### Regressions

For each `regressions[]` row:

```
<keyword>: <previousBucket> → <currentBucket>  (Δ <deltaPositions> positions, <samplesCount> samples)
```

Sort by `Math.abs(deltaPositions)` descending. The biggest absolute drop is the headline. Empty array on cold start — say "no regressions detected (cold start or stable rankings)" instead of suppressing the section.

### Per-keyword trend (when `/history` was pulled)

For each keyword the user inspected:

```
<keyword>    7d: <previousBucket> → <currentBucket>  (Δ <deltaPositions>, <samplesCount> samples)
             30d: <previousBucket> → <currentBucket>  (Δ <deltaPositions>, <samplesCount> samples)
```

When `trend === null` for that keyword, render `7d/30d: cold start (re-sniff next week to populate)`.

### Cadence framing

End with one sentence reminding the user this is meant to be ongoing:

> "Sniffy's `/diagnose` cache makes the same (app, country, keywords) tuple cheap to re-run within 24h. Re-sniff monthly to track momentum without paying for the deep providers each time."

## Honesty rules

- `targetAppSignals: null` happens for region-locked apps (no `releaseDate` in the country's storefront) and for fixture paths. Render "momentum unavailable for this storefront / cold start" — never invent a velocity.
- `regressions[]` requires ≥ 2 historical samples; on first-ever sniff this WILL be empty. Surface that as expected behavior, not error.
- `keywordDiagnosis[].trend.deltaPositions === null` is a true cold-start marker — Sniffy refuses to claim a trend from a single point. Don't suppress; render it.
- Sniffy doesn't track *competitor* momentum yet (only the target app's). When the user asks "is my competitor losing rank too?", say so honestly — that's a follow-up sniff with the competitor as the target.

## Followups

- "Want to know which keywords to re-write to recover the lost ranks? → `/sniffy-keywords`"
- "Want to see what competitors gained while you dropped? → `/sniffy-compete`"

## Related skills

- `sniffy-audit` — full Score Card; this skill focuses on the momentum subset
- `sniffy-keywords` — keyword-level deep dive
- `sniffy-compete` — competitor-side trend reads
- `sniffy-context` — set a monthly cadence flag for the user
