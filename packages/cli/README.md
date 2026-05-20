# @sniffy/cli

Terminal client for the Sniffy ASO API. Pay-per-sniff x402 payments on Morph Hoodi testnet.

## Install

```bash
npm i -g @sniffy/cli
# or one-off
npx @sniffy/cli sample
```

## Commands

```bash
# Free fixture report (no wallet needed)
npx sniffy sample [--json]

# Free quote + shallowScan preview
npx sniffy quote <url-or-id> -k "habit tracker,daily planner" [-c US] [-s ios] [--json]

# Paid diagnose (auto-pays over x402 with SNIFFY_PRIVATE_KEY)
SNIFFY_PRIVATE_KEY=0x... npx sniffy diagnose <url-or-id> \
  --sniff-id <id-from-quote> \
  -k "habit tracker" [-c US] [-s ios] [--json]
```

### Common flags

| Flag | Purpose |
|------|---------|
| `--base-url <url>` | Override the default `https://api.sniffy.io` (also reads `SNIFFY_BASE_URL`) |
| `--json` | Emit raw JSON instead of formatted output (for scripting) |
| `-k --keywords <csv>` | Comma-separated keywords |
| `-c --country <code>` | ISO 3166-1 alpha-2 (default `US`) |
| `-s --store <store>` | `ios` or `android` (default `ios`) |
| `--competitors <csv>` | Optional competitor app IDs |

### Output

Human-readable output uses provenance icons:

- `●` live — real-time provider response
- `◐` cached — recent cache hit
- `○` fixture — bundled fallback (degraded mode)
- `◇` inferred — synthesized from related signals

Pipe through `--json` to get the raw API response for scripting.

## Wallet

`diagnose` requires `SNIFFY_PRIVATE_KEY` — a 0x-prefixed 32-byte hex string for a Morph Hoodi testnet account.

> **Testnet only.** Never paste a mainnet private key. Get HoodiTestToken from the [Morph Hoodi faucet](https://faucet-hoodi.morph.network/).

## License

MIT
