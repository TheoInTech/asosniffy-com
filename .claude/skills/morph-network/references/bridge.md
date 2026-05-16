# Morph ↔ Ethereum Bridge

Morph's canonical bridge moves ETH and ERC20 tokens between L1 (Ethereum) and L2 (Morph). It uses a router-and-gateway architecture similar to Optimism's bedrock — `L1GatewayRouter` and `L2GatewayRouter` route to per-asset gateways.

| Direction | Latency | Permissioned? |
|---|---|---|
| L1 → L2 deposit | ~2 Ethereum epochs (~13–20 min) | Permissionless |
| L2 → L1 withdrawal | **48-hour challenge window**, then claim on L1 | Permissionless, two-step |

## Deposit: L1 → L2

User calls `depositETH` or `depositERC20` on `L1GatewayRouter`. The router selects the underlying gateway (e.g., `L1StandardERC20Gateway`) automatically.

```text
L1 user → L1GatewayRouter.depositERC20(token, to, amount, gasLimit) {value: l2GasFee}
       → L1StandardERC20Gateway (selected by router)
       → L1CrossDomainMessenger
       → L1MessageQueueWithGasPriceOracle
       → Sequencer detects → executes L2CrossDomainMessenger → tokens minted on L2
```

**Important:**
- `depositETH` and `depositERC20` are **payable**. The attached ETH covers L2 execution. **`0.00001 ETH` is plenty for a token deposit.** Excess is refunded.
- On the very first bridge of a new token, a corresponding L2 token is auto-created via `MorphStandardERC20Factory` at `0x530000000000000000000000000000000000000e`. The L2 address can be queried with `L1StandardERC20Gateway.getL2ERC20Address(l1Token)`.
- For a token to appear on the official bridge frontend's token list, add it via the bridge UI ("Custom token" → input L1 address) — the bridge will derive and display the L2 address. To get it in the default list, open a PR on https://github.com/morph-l2/morph-list with both L1 and L2 addresses ([example PR](https://github.com/morph-l2/morph-list/pull/27)).

## Withdrawal: L2 → L1

Two-step process. Step 1 happens on L2; Step 2 is finalization on L1 after the 48h challenge window.

### Step 1 — Initiate on L2

```text
L2 user → L2GatewayRouter.withdrawERC20(token, to, amount, gasLimit) {value: l1Fee}
       → L2StandardERC20Gateway
       → L2CrossDomainMessenger → tokens burned on L2; SentMessage event emitted
```

- `withdrawETH` and `withdrawERC20` are **payable**. The attached ETH covers L1 finalization gas. **`0.005 ETH` should be enough.** Excess is refunded.
- **CRITICAL: if your L1 finalization tx reverts, the assets are gone.** L2 burns them irrevocably at this step. Test calldata carefully.

### Step 2 — Finalize on L1 (after 48h)

After the batch containing your withdrawal is finalized in the `Rollup` contract (i.e., `withdrawalRoots[batchDataStore[batchIndex].withdrawalRoot] == true`), call the Morph backend:

```text
GET /getProof?nonce=<withdrawIndex>
```

This returns:

| Field | Meaning |
|---|---|
| `index` | Position of the withdraw transaction in the withdrawal merkle tree |
| `leaf` | Hash of the withdraw transaction stored in the tree |
| `proof` | Merkle proof |
| `root` | Withdraw tree root |

Then call `L1CrossDomainMessenger.proveAndRelayMessage(...)`:

```solidity
function proveAndRelayMessage(
    address _from,
    address _to,
    uint256 _value,
    uint256 _nonce,
    bytes   memory _message,
    bytes32[32] calldata _withdrawalProof,
    bytes32 _withdrawalRoot
) external;
```

- `_from`, `_to`, `_value`, `_nonce`, `_message`: from the original L2 withdrawal's `SentMessage` event.
- `_withdrawalProof`, `_withdrawalRoot`: from `/getProof`.

The Morph SDK (`@morph-l2/sdk`, see `docs.morph.network/docs/build-on-morph/sdk/globals`) wraps this — prefer it over hand-rolling unless you need custom batching.

## Gateway addresses (quick reference)

### Mainnet
- L1: `L1GatewayRouter` = `0x7497756ada7e656ae9f00781af49fc0fd08f8a8a`
- L2: `L2GatewayRouter` = `0x5300000000000000000000000000000000000002` (predeploy)

### Hoodi
- L1: `L1GatewayRouter` = `0x83e77812f082eff8570388142f8cb0d3e4c85836`
- L2: `L2GatewayRouter` = `0x5300000000000000000000000000000000000002` (same predeploy as mainnet)

Full gateway list (ETH, WETH, ERC20, ERC721, ERC1155, USDC, Custom) is in `references/networks-and-contracts.md`.

## Arbitrary messaging (not just tokens)

Applications can send arbitrary calldata cross-chain via `L1CrossDomainMessenger.sendMessage` / `L2CrossDomainMessenger.sendMessage`. The token gateways are just wrappers around this. Useful for cross-chain governance, cross-chain reads, or extending custom logic — but understand the gas accounting (L2 execution must be pre-funded by L1 ETH attached to the deposit, or vice versa) before relying on it.

## Common pitfalls

- **Forgetting the payable value** on `depositERC20` / `withdrawERC20`. Tx will succeed-look but the cross-chain message stalls in the queue. Always attach enough ETH for the destination-side gas.
- **Reverting on L1 finalization** because of stale proof / wrong root. The `Rollup`'s withdrawal root only becomes valid after batch finalization — re-fetch `/getProof` if you got a proof before the challenge window closed.
- **Bridging tokens with custom transfer hooks** (fee-on-transfer, rebasing). The standard gateway doesn't handle them safely — you may end up with mint/burn mismatches. Use `L1CustomERC20Gateway` and a paired custom L2 token, or LayerZero OFT (see [LayerZero on Morph](https://docs.layerzero.network/v2/developers/evm/technical-reference/deployed-contracts#morph)) for these.
- **Confusing the L1 and L2 versions of a token.** They are different addresses with the same symbol. Use `getL2ERC20Address(l1Token)` to map.

## Alternatives to the canonical bridge

- **Orbiter Finance** — fast (~minutes) third-party bridge supporting USDC.e between Morph and Ethereum + other chains. https://orbiter.finance/trade/Morph/Ethereum
- **LayerZero OFT** — wrap tokens as OFTs for native cross-chain semantics without canonical bridge constraints. Slower devex than Orbiter but more flexible than the canonical bridge for custom tokens.
- **Circle CCTP** — for **native** USDC cross-chain (not USDC.e). Recommended for production USDC flows: https://developers.circle.com/cctp.
- **Centralized exchanges** — for users, several CEXs support direct USDC deposit/withdraw against Morph (specifically the `USDC` Circle Bridged token at `0xCfb1186F4e93D60E60a8bDd997427D1F33bc372B`, NOT `USDC.e`).
