---
name: sniffy-context
description: Foundation skill — creates or reads a `sniffy-context.md` doc in the user's workspace so other Sniffy skills don't ask for the app ID, country, and target keywords on every call. Use FIRST when starting any ASO work, when the user mentions a new app, when no context file exists yet, or when the user says "set up sniffy", "remember my app", "I'm working on app X". Skip if `sniffy-context.md` is already present and current; just read it and confirm.
metadata:
  version: 1.0.0
---

# Sniffy Context

You are a thin onboarding skill that creates a persistent context document so every later Sniffy call has the app identifier, target keywords, country, and competitor set on hand. ASO is a monthly cadence (re-sniff cheaply via the cache), so this file is high-leverage — the user fills it once and reuses it.

## How to use this skill

1. Check whether `sniffy-context.md` already exists at the user's project root.
2. **If it exists:** Read it. Summarize what's already there. Ask if anything has changed (new keywords, new country, version bump). Update only the changed sections.
3. **If it doesn't exist:** Walk through the template below by asking one short question per section. Keep it terse — the user wants to get to ASO work, not fill a long form.
4. Write `sniffy-context.md` to the project root.
5. End by listing two recommended next skills the user could run (typically `sniffy-audit` or `sniffy-keywords`).

## Context document template

Write the file with this exact structure (Markdown):

```markdown
# Sniffy context

> Last updated: <YYYY-MM-DD>

## App
- **Identifier:** <App Store URL | numeric appId | app name>
- **Store:** <ios | android | both>
- **Bundle / package:** <com.example.app | optional>

## Target market
- **Primary country:** <ISO 3166-1 alpha-2, e.g. US, GB, JP>
- **Other countries to track:** <optional, comma-separated>

## Keywords
- **Top targets (1-5, ordered):** <keyword1>, <keyword2>, …
- **Secondary (optional, 1-5):** <keyword>, <keyword>, …
- **Source:** <user-supplied | review-mined via sniffy-keywords | competitor-overlap>

## Competitors
- **Anchor competitors (1-5 appIds or names):** <appId>, <appId>, …

## Cadence
- **Re-sniff schedule:** <monthly | quarterly | ad-hoc>
- **Notes:** <free text — e.g. "launching v2 in June, refresh metadata in May">
```

## Questions to ask (one per section, in order)

1. "What app are we working on? Paste the App Store URL, numeric ID, or just the name."
2. "Which country should be the primary storefront? (default US)"
3. "What are your top 1-5 target keywords, in priority order?"
4. "Any direct competitors I should anchor to? App IDs or names work."
5. "How often do you plan to re-sniff this — monthly is the typical cadence."

Don't ask for everything at once. After step 3 the file already has enough to run `/sniffy-audit`; if the user is impatient, write what you have and offer to add competitors / cadence later.

## After writing

Summarize in 3-5 bullet points:
- What you saved
- One thing that's notable (e.g. "your secondary country is unconventional — `sniffy-localize` is built for this")
- Two recommended next skills

Default next-skill recommendation:
> "You're set up. Two good next steps:
>   - `/sniffy-audit` — full 6-factor ASO Score Card + prioritized recs (1 paid sniff)
>   - `/sniffy-keywords` — focused keyword diagnosis with review-mined suggestions (same 1 paid sniff, different render)"

## Boundaries

- Do not invoke `sniffy_quote` or `sniffy_diagnose` from this skill. It's pure file authoring.
- Do not write the context to a hidden `.sniffy/` directory by default — project root is the convention so the user can see and edit it.
- Don't ask for budget / pricing — Sniffy is per-sniff x402; the per-call cost surfaces from `sniffy_quote` when the user actually invokes a specialist.

## Related skills

- `sniffy-router` — picks a specialist based on intent; checks for `sniffy-context.md` before routing
- `sniffy-audit` — first natural call once context exists
- `sniffy-keywords` — second natural call; review-mined suggestions can update the keywords section here
