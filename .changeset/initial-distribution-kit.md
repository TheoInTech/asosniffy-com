---
"@sniffy/sdk": minor
"@sniffy/cli": minor
"@sniffy/mcp": minor
---

Initial release of the Sniffy agent-distribution kit.

- `@sniffy/sdk` — typed TypeScript client with `createSniffy({ baseUrl, signer? })`, automatic x402 payment retry on `diagnose`, and an exported `PaymentRequiredError` for consumers who want to drive the payment UX themselves.
- `@sniffy/cli` — `npx sniffy quote|diagnose|sample` with provenance icons (`●live ◐cached ○fixture ◇inferred`), human-readable formatted output, and a `--json` flag for scripting.
- `@sniffy/mcp` — Model Context Protocol server exposing `sniffy_quote`, `sniffy_diagnose`, and `sniffy_sample` over stdio, drop-in for Claude Desktop / Cursor.

All three target the same `/api/v1/aso/*` API on Morph Hoodi testnet (`eip155:2910`). Wallet signing uses `viem` accounts; `SNIFFY_PRIVATE_KEY` for CLI/MCP — testnet only.
