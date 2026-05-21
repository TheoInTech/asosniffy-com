---
"@sniffy/sdk": minor
"@sniffy/cli": minor
"@sniffy/mcp": minor
---

Add keyword difficulty, listing-match granularity, and target-app momentum to the `/diagnose` paid response.

- `KeywordDiagnosisItem` gains `difficulty: number | null` (1-100), `minDifficulty: number | null` (weakest of the top group), `difficultyIsFallback: boolean` (true when fewer than 5 competitor scores are available — we never fabricate the number), and `matchKind: "titleExactPhrase" | "titleAllWords" | "subtitleExactPhrase" | "subtitleAllWords" | "combinedPhrase" | "none"`.
- `DiagnosePaidResponse` gains `targetAppSignals: { ratingsPerDay, momentumLabel: "growing" | "steady" | "declining" | null, daysSinceFirstRelease, daysSinceLastRelease } | null` — derived from `releaseDate` and `currentVersionReleaseDate` on the iTunes lookup. `null` for region-locked listings without a `releaseDate`.

CLI table prints a new `diff` column and a `App momentum` block. MCP `sniffy_diagnose` description updated to list the new fields. SDK re-exports `KeywordMatchKind` and `TargetAppSignals`.

Difficulty math derived from [semihcihan/App-Store-Optimization-CLI](https://github.com/semihcihan/App-Store-Optimization-CLI) (MIT — see `LICENSE-THIRD-PARTY.md`). Pinned to upstream commit `be885e2d74ec7af59b4efaf6042678ec7dc87f5c`.
