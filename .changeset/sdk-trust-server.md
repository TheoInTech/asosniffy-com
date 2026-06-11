---
"@gosniffy/sdk": minor
---

SDK now trusts the server's response and never throws it away on schema skew.

A real agent lost money: the published SDK bundles a snapshot of the response schema, so when the server returned a newer `popularitySource: "observable-signals"` value, the SDK's strict `.parse()` threw — *after* the x402 payment had already settled (non-refundable). It also silently stripped every new report section the bundled schema didn't know about.

Now every server response is parsed leniently (`passthrough` + `safeParse`): a valid payload parses normally with defaults applied and unknown top-level sections preserved; a mismatch emits one stderr warning (never stdout — safe for MCP's JSON-RPC transport) and returns the raw payload intact. The buyer's paid data is never discarded or stripped. Supply `createSniffy({ onSchemaWarning })` to capture skew warnings. This republish also ships the full current contract (Wave 1/2 sections + cost-aware `addons`), so clients see `conversionAudit`, `aiVisibility`, `webDiscoverability`, `metadataMechanics`, and the `tier`/`addons` request fields. CLI/MCP descriptions updated to mainnet wording + a "retrying diagnose re-pays" warning.
