---
name: morph-network
description: |
  Build on Morph, an Optimistic zkEVM Ethereum Layer 2 (Mainnet eip155:2818, Hoodi testnet eip155:2910). Use when: deploying EVM contracts via Hardhat or Foundry; configuring RPC, chain IDs, or block explorers; bridging ETH/ERC20 between L1 and L2 via L1GatewayRouter / L2GatewayRouter; integrating the official Morph x402 facilitator (`https://morph-rails.morph.network/x402`) for agentic payments — which requires HMAC-SHA256 request signing with sorted-keys JSON, unlike vanilla Coinbase x402; estimating L1 data fee + L2 execution fee via `GasPriceOracle` at `0x530000000000000000000000000000000000000f`; using AltFee (Type-0x7F tx) to pay gas in USDC/USDT0/BGB instead of ETH; attaching Reference Keys for reconciliation; or wiring wallet UX via Reown AppKit. Triggers on Morph, morph-l2, Morph Hoodi, morph-rails, Morph x402, AltFee, Reference Key, Morph Skill Hub, `rpc-hoodi.morph.network`, `morph-rails.morph.network`, or chain IDs 2818/2910.
---

# Morph Network

Morph is an Optimistic zkEVM L2 on Ethereum, fully EVM-compatible. "Just like Ethereum" applies to Solidity/Vyper, RPC methods, dev tooling (Hardhat, Foundry, ethers/viem) — but **transaction cost has two parts** (L1 data fee + L2 execution fee) and **gas can be paid in ERC-20 via AltFee** (Type-0x7F tx), not just ETH.

## Decision tree

| Task | Read |
|---|---|
| Wire RPC, chain ID, explorer, or look up a contract/token address | [references/networks-and-contracts.md](references/networks-and-contracts.md) |
| Deploy a contract (Hardhat/Foundry) or verify it on the explorer | [references/deployment.md](references/deployment.md) |
| Bridge ETH/ERC20 between L1 ↔ L2; finalize a withdrawal | [references/bridge.md](references/bridge.md) |
| Integrate the **official Morph x402 facilitator** for paywalled APIs (HMAC required!) | [references/x402-facilitator.md](references/x402-facilitator.md) |
| Use AltFee (gas in USDC), Reference Key (reconciliation), or Morph Skill Hub (agent discovery) | [references/morph-rails.md](references/morph-rails.md) |
| Add wallet UX | Use **Reown AppKit** (formerly WalletConnect AppKit). Standard EVM EIP-1193 wallets work; no Morph-specific SDK needed. |

## Network parameters (quick lookup)

| Network | Chain ID | CAIP-2 | Public RPC | Block Explorer |
|---|---|---|---|---|
| Morph Mainnet | 2818 | `eip155:2818` | `https://rpc-quicknode.morph.network` | `https://explorer.morph.network` |
| Morph Hoodi Testnet | 2910 | `eip155:2910` | `https://rpc-hoodi.morph.network` | `https://explorer-hoodi.morph.network` |
| L1: Ethereum Mainnet | 1 | `eip155:1` | `https://ethereum-rpc.publicnode.com` | `https://etherscan.io` |
| L1: Hoodi Testnet | 560048 | `eip155:560048` | `https://ethereum-hoodi-rpc.publicnode.com` | `https://hoodi.etherscan.io` |

- WebSocket: `wss://rpc-quicknode.morph.network` (mainnet), `wss://rpc-hoodi.morph.network` (Hoodi)
- Public RPC limit: **600 req/min/IP**. For higher throughput use QuickNode/Tenderly private RPC.
- L2 block time: ~1s (non-empty); 5s empty blocks; **100 tx/block** cap.
- Currency symbol on both: ETH. Hoodi requires `--legacy` for `forge create` and a 2 gwei `gasprice` in Hardhat configs (mainnet 1 gwei).

## x402 facilitator — non-obvious requirements

The Morph facilitator is **Coinbase-x402-protocol-compatible** but **NOT** drop-in with the standard `x402.org` facilitator. Three things will trip you up:

1. **HMAC signing is mandatory** on `POST /v2/verify` and `POST /v2/settle`. Headers: `MORPH-ACCESS-KEY`, `MORPH-ACCESS-TIMESTAMP` (milliseconds, ±30s tolerance), `MORPH-ACCESS-SIGN` (Base64 HMAC-SHA256). `GET /v2/supported` is unauthenticated.
2. **Sign map keys must be recursively sorted lexicographically** before compact JSON serialization. In JS/TS `JSON.stringify` does NOT sort — you must do it yourself. Go's `json.Marshal` on `map[string]interface{}` sorts automatically. Python: `json.dumps(obj, sort_keys=True, separators=(',', ':'))`.
3. **Path in signature must include the `/x402` gateway prefix** — sign `/x402/v2/settle`, NOT `/v2/settle`.

**As of 2026-05-16 the live `GET /x402/v2/supported` advertises only `eip155:2818` (Mainnet)** — not Hoodi `eip155:2910`. The official Go example in Morph's docs uses Hoodi chainID 2910 with token `0xEcF966Cc754BC411E1F1106fbb4e343b835E85E4` (HoodiTestToken), so Hoodi is reachable in practice. **Verify live state with `curl https://morph-rails.morph.network/x402/v2/supported` before wiring a specific network/token.**

Credentials (`morph_ak_...` / `morph_sk_...`) come from the [x402 Console](https://morph-rails.morph.network/x402) after wallet sign-in. **The secret key is shown ONCE.** Each wallet can create one keypair. Rate limit: 10 QPS per Access Key.

For full signing algorithm, runnable Go/TS examples, error tables, and FAQ: [references/x402-facilitator.md](references/x402-facilitator.md).

## Transaction cost model

```text
total_fee = l2_execution_fee + l1_data_fee
l2_execution_fee = l2_gas_price * l2_gas_used         # EIP-1559: base + priority
l1_data_fee      = (l1BaseFee * commitScalar +
                    l1BlobBaseFee * len(tx_data) * blobScalar) / Precision
len(tx_data)     = count_zero_bytes(tx_data) * 4 + count_non_zero_bytes(tx_data) * 16
```

- Use `eth_gasPrice` and `eth_estimateGas` for L2 just like Ethereum.
- For L1 data fee, call `getL1Fee(bytes)` on the predeploy **GasPriceOracle at `0x530000000000000000000000000000000000000f`**.
- **Display the sum of both fees** to users; multiplying gas × gasPrice alone undershoots by the L1 data fee, which is typically the larger component.
- Testnet has a minimum priority fee of **0.01 gwei** (anti-spam); mainnet accepts zero priority.
- L1 fee is locked at sequencer inclusion — no fluctuation after that.

## USDC: `USDC` vs `USDC.e`

Two USDC tokens exist on Morph mainnet. **Prefer `USDC` (Circle Bridged USDC Standard) for new integrations** — it's upgradeable in place to native USDC if Circle deploys it. Don't confuse them:

- `USDC` (Bridged Standard): `0xCfb1186F4e93D60E60a8bDd997427D1F33bc372B`
- `USDC.e` (legacy bridged from Ethereum): `0xe34c91815d7fc18A9e2148bcD4241d0a5848b693`

`USDC.e` is the AltFee gas token (see references/morph-rails.md). For cross-chain native USDC flows, use Circle's CCTP.

## Hard constraints / gotchas

- **Withdrawal challenge window: 48 hours** (optimistic zkEVM). Plan UX accordingly.
- **Deposit time: ~2 Ethereum epochs (~13–20 min).**
- **Once burned on L2, bridged assets cannot be recovered if the L1 finalization tx reverts.** Always test `proveAndRelayMessage` calldata.
- Foundry deploys need `--legacy` flag (Morph rejects EIP-1559 from `forge create`'s default path).
- L2 predeploys all live in the `0x53000...` range (e.g., `L2GatewayRouter` = `0x5300000000000000000000000000000000000002`). See [references/networks-and-contracts.md](references/networks-and-contracts.md) for the full table.
- Explorer is Blockscout-flavored. For Hardhat/Foundry verification, use `--verifier blockscout` and the explorer API endpoint (`https://explorer-api.morph.network/api?` for mainnet, `https://explorer-api-hoodi.morph.network` for Hoodi).
- The mainnet docs page sometimes shows `chainId: 2810` for the Hardhat `customChains` block — this is a doc typo for the Hoodi testnet (real chainId is **2910**). Use 2910.

## Verifying assumptions before coding

Live state to verify when wiring a new integration:
- `curl https://morph-rails.morph.network/x402/v2/supported` — which networks/schemes are currently accepted by the facilitator
- `curl https://rpc-hoodi.morph.network` with `eth_chainId` — confirm Hoodi RPC is up and returns `0x35e` (2910)
- Explorer URL responds: `https://explorer-hoodi.morph.network`

## Resources

- Official docs entry: https://docs.morph.network/docs/build-on-morph/developer-navigation-page
- Morph Rails (payments middleware): https://docs.morph.network/docs/morph-rails/overview
- Code examples repo: https://github.com/morph-l2/morph-examples
- Skill Hub (agentic skills) repo: https://github.com/morph-l2/morph-skill
- Hoodi faucet (L1 ETH, then bridge): https://stakely.io/faucet/ethereum-hoodi-testnet-eth
- Discord `#dev-support`: https://discord.gg/invite/MorphNetwork
