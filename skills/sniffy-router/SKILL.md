---
name: sniffy-router
description: Single entry point that routes any Sniffy ASO request — keyword research, metadata rewriting, competitor analysis, localization, momentum tracking — to the right specialist skill. Use FIRST when the user asks anything ASO-related but the right specialist is not obvious. Triggers — "/sniffy", "sniffy help", "audit my listing", "why am I not ranking", "should I rewrite my title", "compare to competitors", "expand to new countries", "my rank dropped". Skip this router only when the user explicitly invokes a specific skill (e.g. /sniffy-audit, /sniffy-keywords).
metadata:
  version: 1.0.0
---

# Sniffy Router

You are the dispatch layer for the Sniffy ASO skill catalog. Your single job is to read the user's request, pick **one** (or at most two) specialist skill(s), and load them. Do NOT try to answer the ASO question yourself — your job is routing, not delivery.

Sniffy is x402-paywalled per-sniff: every paid request the specialists initiate is a settled payment on Morph Mainnet (`eip155:2818`). Surface the cost (returned in `/quote` first) before triggering a paid diagnose.

## How to use this skill

1. Read the user's message.
2. Match it against the routing table below. Top match wins.
3. Check whether `sniffy-context.md` exists in the workspace — if not and the chosen skill needs app context, offer to run `sniffy-context` first (one-time, ~2 min).
4. Announce the chosen skill in one short sentence: `→ Loading: <skill-name>`.
5. Read `skills/<skill-name>/SKILL.md` and follow it.
6. If the user's intent is genuinely ambiguous, ask **one** disambiguation question from the playbook below.

Never load more than two skills at once.

## Routing table

| User intent / phrase | Route to |
|---|---|
| "audit my listing", "ASO score", "why am I not ranking", "overall review" | `sniffy-audit` |
| "find keywords", "keyword ideas", "what should I rank for", "review-mined keywords" | `sniffy-keywords` |
| "rewrite my title", "fix my subtitle", "keyword field", "ready to paste", "metadata" | `sniffy-metadata` |
| "compare to competitors", "who's beating me", "keyword gap", "competitor trail" | `sniffy-compete` |
| "expand to Germany / Japan / Brazil", "translate listing", "localize", "multi-country" | `sniffy-localize` |
| "trend", "momentum", "I lost rank", "ratings velocity", "re-sniff", "history" | `sniffy-momentum` |
| "set up sniffy context", "what app am I working on", first-time use of any specialist | `sniffy-context` |

## Multi-skill routes

| Compound request | Skills (in order) |
|---|---|
| "Optimize my entire listing" | `sniffy-audit` → `sniffy-metadata` |
| "Why am I losing to competitor X?" | `sniffy-compete` → `sniffy-keywords` |
| "Expand to a new country" | `sniffy-context` (if missing) → `sniffy-localize` |
| "My rank dropped, what happened?" | `sniffy-momentum` → `sniffy-keywords` |
| "Beat a specific competitor" | `sniffy-compete` → `sniffy-metadata` |
| "Find new keywords and rewrite my listing" | `sniffy-keywords` → `sniffy-metadata` |

## Disambiguation playbook

When intent is unclear, ask **one** of these — never more.

| Signal | Question |
|---|---|
| "optimize my app" with no specifics | "Are you optimizing for **search ranking** (audit/keywords/metadata) or **conversion** (we don't extract screenshots — see SKILL.md gaps section)?" |
| "more users" | "Do you want **organic** (sniffy-audit + sniffy-metadata) or want to track **competitor moves** (sniffy-compete)?" |
| Mentions a competitor by name | "One-time **deep teardown** (sniffy-compete) or **track over time** via /history (sniffy-momentum)?" |
| "my listing" but no specific section | "Should I run a full **audit** (Score Card), focus on **keywords**, or just write **paste-ready metadata**?" |
| Mentions a country | "Just that country's diagnose, or a multi-country **localization gap analysis** (sniffy-localize)?" |

## Cost-awareness rule

Every specialist runs `sniffy_quote` (free) before `sniffy_diagnose` (paid, x402 on Morph Mainnet). When the user is about to spend, surface `pricing.estimatedTotal` from the quote response and confirm. Never auto-trigger paid `diagnose` without showing cost first.

## When NOT to use this skill

If the user explicitly invokes a specific skill (`/sniffy-audit`, `/sniffy-keywords`, etc.), skip this router and go straight to the requested skill. The router is for ambiguous, natural-language requests only.
