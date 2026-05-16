# Networks & Contract Addresses

All addresses verified against the official Morph docs (last refreshed 2026-05-16). Mainnet predeploys are stable; Hoodi testnet addresses can change between testnet phases — re-check against `https://docs.morph.network/docs/build-on-morph/developer-resources/contracts` before pinning long-lived dependencies.

## Network parameters

### Morph Mainnet (L2)

| Field | Value |
|---|---|
| Chain ID | 2818 |
| CAIP-2 | `eip155:2818` |
| RPC | `https://rpc-quicknode.morph.network` |
| WebSocket | `wss://rpc-quicknode.morph.network` |
| Block explorer | `https://explorer.morph.network` |
| Explorer API | `https://explorer-api.morph.network/api` |
| Currency | ETH |
| Official bridge | `https://bridge.morph.network` |

### Morph Hoodi Testnet (L2)

| Field | Value |
|---|---|
| Chain ID | 2910 |
| CAIP-2 | `eip155:2910` |
| RPC | `https://rpc-hoodi.morph.network` |
| WebSocket | `wss://rpc-hoodi.morph.network` |
| Block explorer | `https://explorer-hoodi.morph.network` |
| Explorer API | `https://explorer-api-hoodi.morph.network` |
| Currency | ETH |
| Official bridge | `https://bridge-hoodi.morph.network` |
| Recommended `gasprice` (Hardhat) | `2000000000` (2 gwei) |
| Min priority fee | 0.01 gwei (anti-spam — mainnet has no minimum) |

### Ethereum L1 networks

| Network | Chain ID | RPC | Explorer |
|---|---|---|---|
| Ethereum Mainnet | 1 | `https://ethereum-rpc.publicnode.com` | `https://etherscan.io` |
| Hoodi Testnet | 560048 | `https://ethereum-hoodi-rpc.publicnode.com` | `https://hoodi.etherscan.io` |

### Public RPC limits

- **600 requests/minute per IP** on public RPCs (both mainnet and Hoodi).
- For production, use QuickNode (free credits for Morph devs) or Tenderly private endpoints. Reach out to the Morph team for direct private RPC access if needed.

### Hoodi L1 ETH faucets (you need L1 ETH, then bridge)

- https://stakely.io/faucet/ethereum-hoodi-testnet-eth
- https://faucet.quicknode.com/ethereum/hoodi
- https://hoodi-faucet.pk910.de
- https://cloud.google.com/application/web3/faucet/ethereum (Google account required)

After getting L1 Hoodi ETH, bridge to L2 via https://bridge-hoodi.morph.network.

## L2 predeploys

All L2 system contracts live in the `0x53000...` range and are at the same address on Mainnet and Hoodi unless noted.

| Contract | Address | Notes |
|---|---|---|
| `L2ToL1MessagePasser` | `0x5300000000000000000000000000000000000001` | |
| `L2GatewayRouter` | `0x5300000000000000000000000000000000000002` | Entry point for L2→L1 transfers |
| `Gov` | `0x5300000000000000000000000000000000000004` | |
| `L2ETHGateway` | `0x5300000000000000000000000000000000000006` | |
| `L2CrossDomainMessenger` | `0x5300000000000000000000000000000000000007` | Arbitrary L2→L1 messaging |
| `L2StandardERC20Gateway` | `0x5300000000000000000000000000000000000008` | |
| `L2ERC721Gateway` | `0x5300000000000000000000000000000000000009` | |
| `L2TxFeeVault` | `0x530000000000000000000000000000000000000a` | |
| `ProxyAdmin` | `0x530000000000000000000000000000000000000b` | |
| `L2ERC1155Gateway` | `0x530000000000000000000000000000000000000c` | |
| `MorphStandardERC20` | `0x530000000000000000000000000000000000000d` | Implementation for bridged tokens |
| `MorphStandardERC20Factory` | `0x530000000000000000000000000000000000000e` | |
| `GasPriceOracle` | `0x530000000000000000000000000000000000000f` | **Has `getL1Fee(bytes)` for L1 data fee estimation** |
| `L2WETHGateway` | `0x5300000000000000000000000000000000000010` | |
| `L2WETH` | `0x5300000000000000000000000000000000000011` | |
| `L2Staking` (Mainnet only) | `0x5300000000000000000000000000000000000015` | |
| `L2CustomERC20Gateway` (Mainnet only) | `0x5300000000000000000000000000000000000016` | |
| `Sequencer` | `0x5300000000000000000000000000000000000017` | |
| `L2USDCGateway` (Mainnet) | `0xc5e44E2fFe9523809146eD17D62bb382ECCf426B` | |

## L1 contracts (Ethereum Mainnet)

| Contract | Address |
|---|---|
| `Staking` | `0x0dc417f8af88388737c5053ff73f345f080543f7` |
| `Rollup` | `0x759894ced0e6af42c26668076ffa84d02e3cef60` |
| `L1MessageQueueWithGasPriceOracle` | `0x3931ade842f5bb8763164bdd81e5361dce6cc1ef` |
| `L1CrossDomainMessenger` | `0xdc71366effa760804dcfc3edf87fa2a6f1623304` |
| `L1GatewayRouter` | `0x7497756ada7e656ae9f00781af49fc0fd08f8a8a` |
| `L1ETHGateway` | `0x1c1ffb5828c3a48b54e8910f1c75256a498ade68` |
| `L1WETHGateway` | `0x788890ba6f105cca373c4ff01055cd34de01877f` |
| `L1StandardERC20Gateway` | `0x44c28f61a5c2dd24fc71d7df8e85e18af4ab2bd8` |
| `L1CustomERC20Gateway` | `0xa534badd09b4c62b7b1c32c41df310aa17b52ef1` |
| `L1ERC721Gateway` | `0x5ae782c23a303c0d70ae697a0aee9eae9a5d77c4` |
| `L1ERC1155Gateway` | `0x7c9a3d9531692d057d496d04938bdb7d367e9765` |
| `L1USDCGateway` | `0x2C8314f5AADa5D7a9D32eeFebFc43aCCAbe1b289` |
| `EnforcedTxGateway` | `0xc5fa3b8968c7fabeea2b530a20b88d0c2ed8abb7` |

## L1 contracts (Hoodi Testnet — `eip155:560048`)

| Contract | Address |
|---|---|
| `Staking` | `0xb071de98d3310d399e370ef85c1d53a14097b0c4` |
| `Rollup` | `0x57e0e6dde89dc52c01fe785774271504b1e04664` |
| `L1MessageQueueWithGasPriceOracle` | `0xd7f39d837f4790b215ba67e0ab63665912648dbe` |
| `L1CrossDomainMessenger` | `0x9b43e90d75f4a8ae2f7f8a7cb67e8f4a0b75646f` |
| `L1GatewayRouter` | `0x83e77812f082eff8570388142f8cb0d3e4c85836` |
| `L1ETHGateway` | `0x625849788c16315680f34ee72a5e9961cd15d581` |
| `L1WETHGateway` | `0x80a9f200e457169ff560dc8b4fb2a138bba58faf` |
| `L1StandardERC20Gateway` | `0x2d14dcfa6c0ecec2b9bbe8c2ee0e422d0a3d60ff` |

## Tokens

### L1 (Ethereum Mainnet)

| Token | Address |
|---|---|
| WETH | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` |
| USDT | `0xdAC17F958D2ee523a2206206994597C13D831ec7` |
| USDC | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| DAI  | `0x6B175474E89094C44Da98b954EedeAC495271d0F` |
| WBTC | `0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599` |

### L2 (Morph Mainnet)

| Token | Address | Notes |
|---|---|---|
| WETH | `0x5300000000000000000000000000000000000011` | L2 predeploy |
| USDT.e | `0xc7D67A9cBB121b3b0b9c053DD9f469523243379A` | Bridged from Ethereum |
| WBTC | `0x803DcE4D3f4Ae2e17AF6C51343040dEe320C149D` | |
| USDC.e | `0xe34c91815d7fc18A9e2148bcD4241d0a5848b693` | Legacy bridged USDC — also serves as the AltFee USDC token |
| DAI | `0xef8A24599229D002B28bA2F5C0eBdD3c0EFFbed4` | |
| weETH | `0x7DCC39B4d1C53CB31e1aBc0e358b43987FEF80f7` | |
| BGB (old) | `0x55d1f1879969bdbB9960d269974564C58DBc3238` | Do not use for new integrations |
| BGB | `0x389C08Bc23A7317000a1FD76c7c5B0cb0b4640b5` | AltFee token ID 4 |
| **USDC** | **`0xCfb1186F4e93D60E60a8bDd997427D1F33bc372B`** | **Circle Bridged USDC Standard — prefer for new integrations** |
| USDT0 | `0xe7cd86e13AC4309349F30B3435a9d337750fC82D` | AltFee-supported |

### L2 (Morph Hoodi Testnet)

| Token | Address |
|---|---|
| L2USDC | `0x1178341838B764dCfFA5BCEAb1d41443Fd71a227` |
| HoodiTestToken (used in official x402 example) | `0xEcF966Cc754BC411E1F1106fbb4e343b835E85E4` |

### `USDC` vs `USDC.e` choice

Two USDC tokens exist on Morph mainnet because of the migration to Circle's Bridged USDC Standard:

- **`USDC` at `0xCfb1186F4e93D60E60a8bDd997427D1F33bc372B`** — Circle's Bridged USDC Standard. **Use this for new integrations.** Upgradeable in-place to native USDC if Circle ever deploys it. Centralized exchanges deposit/withdraw against this address.
- **`USDC.e` at `0xe34c91815d7fc18A9e2148bcD4241d0a5848b693`** — Legacy USDC bridged from Ethereum via the canonical bridge. Doubles as the AltFee gas-payment USDC.

For cross-chain native USDC flows, use Circle's [CCTP](https://developers.circle.com/cctp).

## Block production parameters

- ~1s block time when there is activity.
- 5s empty-block cadence when idle.
- 100 transactions per block (raising over time).
- EIP-1559 fee model: `gasPrice = baseFee + priorityFee`. Base fee minimum is `0.001` gwei.
- Sequencer locks the L1 data fee at inclusion — no post-inclusion fluctuation.

## Bridge timing

| Direction | Latency |
|---|---|
| L1 → L2 deposit | 2 Ethereum epochs (~13–20 min) |
| L2 → L1 withdrawal | **48 hours** challenge window before finalizable |

## Wallet & infrastructure providers known to work

- **Reown AppKit (formerly WalletConnect AppKit)** — official user-onboarding recommendation. Use for app-side wallet connect UX. Standard EIP-1193 wallets (MetaMask, Rabby) work out of the box.
- **QuickNode** — RPC + extra dev credits for Morph devs.
- **Tenderly** — RPC + simulator + debugging.
- **Biconomy** — ERC-4337 Account Abstraction (live on Morph Mainnet). Note: AltFee is the Morph-native preferred path; AA is a layer above.
