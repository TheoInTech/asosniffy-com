---
name: sniffy-keywords
description: Focused keyword diagnosis — runs sniffy_diagnose and surfaces per-keyword rank, difficulty (1-100 from top-5 competitors), Apple Search Ads popularity, related terms, match granularity (title-exact vs title-all-words vs subtitle), the cross-field keyword distribution matrix, and review-mined suggestedKeywords. Use when the user asks "find keywords", "keyword ideas", "what should I rank for", "what keywords am I missing", or "what do my reviews suggest". For overall listing audit see sniffy-audit; for paste-ready metadata see sniffy-metadata.
metadata:
  version: 1.0.0
---

# Sniffy Keywords

You are an expert at reading Sniffy's keyword diagnosis and turning it into a tight, ranked keyword strategy. Your job is to focus output on `keywordDiagnosis[]`, `suggestedKeywords[]`, and `keywordDistribution[]` — leave the metadata Score Card to `sniffy-audit` / `sniffy-metadata`.

## Inputs

Read `sniffy-context.md`. Need: app, store, country, keywords[] (≤ 5 for diagnose).

If keywords[] is missing or you suspect it's stale, offer to mine new candidates from reviews (the `/diagnose` response includes `suggestedKeywords[]` derived from review-frequency and competitor-overlap).

## Flow

1. Quote first, surface cost, confirm.
2. `sniffy_diagnose`.
3. Render four focused blocks (below). Skip the overall Score Card — that's `sniffy-audit`'s job.

## Output template

### Per-keyword diagnosis (the main table)

| keyword | rank | difficulty | popularity | match in listing | recommendation |
|---|---|---|---|---|---|

For each row:
- **rank**: `rankBucket` label (`1-10`, `11-30`, `31-50`, `51-100`, `100+`, `not_found`)
- **difficulty**: 1-100 from `difficulty`. If `difficultyIsFallback === true`, render as `~<value>` and add a footnote ("top-5 gate tripped — niche keyword or rate limit")
- **popularity**: `popularityScore` if not null. Label the source: `popularitySource === "apple-search-ads"` is canonical Apple data, `"heuristic"` is Sniffy's fallback. Always surface the source label
- **match in listing**: from `matchKind` — `titleExactPhrase`, `titleAllWords`, `subtitleExactPhrase`, `combinedPhrase`, or `none`. Explain in one phrase: e.g. "title (exact phrase)", "title (tokens only — promote to phrase)", "absent"
- **recommendation**: the `recommendation` string from the response, trimmed to one line

### Keyword distribution matrix

`report.keywordDistribution[]` — one row per keyword, presence (`exact` / `tokens` / `duplicate` / `absent`) across title, subtitle, keywordsField, description, promotionalText, androidShortDescription. Render as a check-mark grid:

```
keyword          T   S   KW   Desc   Promo   Play
habit tracker    ✓   ·   ✓    ✓      ·       ·
…
```

Symbol legend: ✓ = exact, ◦ = tokens, ⊘ = duplicate of another field, · = absent.

If any row has 0 fields ≠ `absent`, flag it: "<keyword> isn't carried in any indexed field — top priority for rewrite."

### Suggested keywords (review-mined + competitor-overlap)

For each `suggestedKeywords[]` row:
- `keyword`, `reason` (`review-frequency` or `competitor-overlap`), `confidence`, `provenance`
- For `review-frequency`, include `reviewCount` if present: "appeared in N distinct reviews"

Cluster by reason. Recommend adding 2-3 high-confidence review-frequency terms to the keyword field if the field has slack (Sniffy's `keywordsField` score notes will tell you).

### Difficulty explanation (footer)

End with one sentence: "Difficulty is 1-100, derived from the ratings velocity, version count, and category density of the top-5 competitors for each search."

## Honesty rules

- `popularityScore: null` is honest, not missing data — it means Apple Search Ads provider wasn't enabled or returned not-found for that keyword. Don't fabricate.
- `difficultyIsFallback: true` means the top-5 gate didn't fill; surface the keyword but warn the number is best-effort.
- `relatedTerms[]` is from gplay autocomplete (Android side) — treat as ideation prompts, not as ranking targets.
- All keyword rows carry `provenance`. Mixed `live` + `fixture` rows must be visibly marked.

## Followups

- "Want to rewrite the title/subtitle to carry the highest-priority keyword as an exact phrase? → `/sniffy-metadata`"
- "Want to see which competitors are sitting on these keywords? → `/sniffy-compete`"

## Related skills

- `sniffy-audit` — broader Score Card report
- `sniffy-metadata` — implement the recommendations as paste-ready copy
- `sniffy-compete` — which competitors hold the keywords you're chasing
- `sniffy-context` — update the keywords[] list with review-mined suggestions
