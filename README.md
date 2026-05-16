# Sniffy

> Pay-per-sniff ASO intelligence for founders and agents.

Sniffy turns App Store optimization into an **agent-buyable HTTP resource**.
A founder or AI agent submits an iOS app, a country, and a few keywords;
Sniffy quotes the cost, gates the diagnosis behind **x402 on Morph Hoodi**,
and returns a structured visibility report with competitor gaps, metadata
fixes, and ready-to-paste listing copy.

This repo is a hackathon submission for the **x402 Agentic Payments** track,
but it's designed to outlive the hackathon as a real indie-hacker tool.

🐾 **Tagline:** _Sniff out what is costing your app rankings._

---

## What's in the repo

```
asosniffy-com/
├── landing/          Next.js demo UI (Vercel)
├── scraper/          Hono API + x402 payment adapter (Railway)
├── packages/
│   ├── sdk/          @sniffy/sdk — typed TypeScript client
│   ├── cli/          @sniffy/cli — `npx sniffy ...`
│   └── mcp/          @sniffy/mcp — MCP server for Claude Desktop / Cursor
├── SKILL.md          Vercel skills format — install into Claude Code / Cursor / Codex
├── PLAN.md           Product requirements doc (authoritative)
└── CLAUDE.md         Working notes for AI contributors
```

The two deployable apps (`landing/`, `scraper/`) keep separate hosts;
`packages/*` are npm-publishable libraries.

---

## Install paths

**As an AI agent skill** (Claude Code, Cursor, Codex, OpenCode, ...):

```bash
npx skills add TheoInTech/asosniffy-com
```

**As an MCP server** (Claude Desktop, Cursor):

```json
{
  "mcpServers": {
    "sniffy": {
      "command": "npx",
      "args": ["-y", "@sniffy/mcp"],
      "env": { "SNIFFY_PRIVATE_KEY": "0x..." }
    }
  }
}
```

**As a CLI**:

```bash
npx @sniffy/cli quote https://apps.apple.com/us/app/example/id123456789 \
  -k "habit tracker,daily planner"
```

**As a TypeScript SDK**:

```bash
npm i @sniffy/sdk
```

```ts
import { createSniffy } from "@sniffy/sdk";

const sniffy = createSniffy({ signer });
const quote = await sniffy.quote({ store: "ios", app, country, keywords });
const report = await sniffy.diagnose({ sniffId: quote.sniffId });
```

See `SKILL.md` and `PLAN.md` §22 for the full agent-distribution surface.

---

## The paid API

The canonical surface is three HTTP endpoints documented in `PLAN.md` §9:

| Endpoint | Auth | Returns |
|---|---|---|
| `POST /api/v1/aso/quote` | None | Price, coverage estimate, **shallow scan** teaser |
| `POST /api/v1/aso/diagnose` | x402 (Morph Hoodi) | Full report + receipt + provenance |
| `GET /api/v1/aso/sample` | None | Fixture report for inspection |

Unpaid calls to `/diagnose` return a real `402 Payment Required` with
machine-readable x402 payment requirements. Agents read the 402, sign on
Morph Hoodi (`eip155:2910`), and retry — exactly the agentic-payments flow
the track is built around.

---

## Open-source posture

Sniffy is **MIT-licensed**. The commercial strategy is _open client,
commercial host_: the code is the adoption funnel; the running `sniffy.io`
service, the wallet receiving payments, and the accumulated cache/keyword
history are the business. See `PLAN.md` §23 for details.

The "Sniffy" name and pixel-detective mascot are reserved as trademarks —
you can fork the code under MIT, but please don't ship "Sniffy"-branded
forks.

---

## Contributing

See `CONTRIBUTING.md`. Read `PLAN.md` before opening a non-trivial PR.

The owner pushes directly to `main`; all other contributors open PRs.

---

## Hackathon

- Track: x402 Agentic Payments on Morph.
- Network: Morph Hoodi testnet (`eip155:2910`).
- Facilitator: `https://morph-rails.morph.network/x402` (official).
- Build diary: tagged `#MorphBuildSprint` and `#MorphBuildPH`.

---

## License

[MIT](LICENSE) — see also `NOTICE`.

## Security

Found a security issue? See [`SECURITY.md`](SECURITY.md) — please email,
don't open a public issue.
