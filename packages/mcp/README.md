# @sniffy/mcp

[Model Context Protocol](https://modelcontextprotocol.io) server for the Sniffy ASO API. Exposes three tools over stdio: `sniffy_quote`, `sniffy_diagnose`, `sniffy_sample`. Drop-in for Claude Desktop, Cursor, and any other MCP-capable agent.

## Install

```bash
# One-off (no install)
npx @sniffy/mcp
```

## Tools

| Tool | Cost | What it does |
|------|------|--------------|
| `sniffy_sample` | Free | Returns a canned fixture report. Use to demo the shape without a wallet. |
| `sniffy_quote` | Free | Returns a quote with `shallowScan` preview + `pricing.estimatedTotal`. Use BEFORE `sniffy_diagnose`. |
| `sniffy_diagnose` | **PAID** | Full ASO diagnosis. Auto-pays from `SNIFFY_PRIVATE_KEY` over x402 on Morph Hoodi. |

Every tool description includes a **testnet-only warning**. Agents should refuse to run with a mainnet key.

## Claude Desktop config

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sniffy": {
      "command": "npx",
      "args": ["-y", "@sniffy/mcp"],
      "env": {
        "SNIFFY_PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

Restart Claude Desktop. The three `sniffy_*` tools become available.

## Cursor config

Same shape — drop the snippet under `mcpServers` in your `.cursor/mcp.json` (or per-project `.mcp/config.json` depending on Cursor version).

## Environment

| Var | Required for | Default |
|-----|--------------|---------|
| `SNIFFY_PRIVATE_KEY` | `sniffy_diagnose` | — (tool returns `payment_required` error if unset) |
| `SNIFFY_BASE_URL` | All tools | `https://api.sniffy.io` |

> **Testnet only.** Sniffy settles on Morph Hoodi (`eip155:2910`) using HoodiTestToken. Never paste a mainnet private key. Get testnet funds at the [Morph Hoodi faucet](https://faucet-hoodi.morph.network/).

## License

MIT
