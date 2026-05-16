# Deploy & Verify Contracts on Morph

Deployment is identical to Ethereum: pick an EVM-compatible framework (Hardhat, Foundry, Brownie, ethers, viem), point it at a Morph RPC, and broadcast. Two non-obvious things to know up front:

- **Use the `--legacy` flag with `forge create`** — Morph rejects the default EIP-1559 envelope from `forge create`'s shortcut path. Scripts via `forge script ... --broadcast --legacy` are fine.
- **Verification uses Blockscout, not Etherscan API v2**, but the standard Etherscan plugin works — just configure the `customChains` entry to point at the Morph explorer API endpoint.

Reference example repo: https://github.com/morph-l2/morph-examples (`contract-deployment-demos/hardhat-demo` and `foundry-demo`).

## Hardhat

### Network config

```ts
// hardhat.config.ts
const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    morphMainnet: {
      url: "https://rpc-quicknode.morph.network",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      gasPrice: 1_000_000_000, // 1 gwei
    },
    morphHoodi: {
      url: "https://rpc-hoodi.morph.network",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      gasPrice: 2_000_000_000, // 2 gwei (Hoodi anti-spam minimum priority of 0.01 gwei means slightly higher than mainnet)
    },
  },
  etherscan: {
    apiKey: {
      morphMainnet: "anything", // Blockscout doesn't require a real key
      morphHoodi:   "anything",
    },
    customChains: [
      {
        network: "morphMainnet",
        chainId: 2818,
        urls: {
          apiURL:     "https://explorer-api.morph.network/api?",
          browserURL: "https://explorer.morph.network/",
        },
      },
      {
        network: "morphHoodi",
        chainId: 2910, // NOTE: Morph docs sometimes show 2810 — that's a typo. The real Hoodi chainId is 2910.
        urls: {
          apiURL:     "https://explorer-api-hoodi.morph.network",
          browserURL: "https://explorer-hoodi.morph.network",
        },
      },
    ],
  },
};
export default config;
```

### Deploy & verify

```bash
yarn deploy:morphHoodi  # runs scripts/deploy.ts against morphHoodi
npx hardhat verify --network morphHoodi 0xDeployedAddr "constructorArg1" "constructorArg2"
```

## Foundry

### Deploy

`forge create` works but requires `--legacy`:

```bash
forge create src/MyContract.sol:MyContract \
  --rpc-url https://rpc-hoodi.morph.network \
  --private-key $PRIVATE_KEY \
  --legacy
```

`forge script` is the more typical path:

```bash
source .env  # exports RPC_URL, DEPLOYER_PRIVATE_KEY, VERIFIER_URL

forge script script/Counter.s.sol \
  --rpc-url $RPC_URL \
  --broadcast \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --legacy
```

`.env` for Hoodi:
```bash
RPC_URL=https://rpc-hoodi.morph.network
VERIFIER_URL=https://explorer-api-hoodi.morph.network
DEPLOYER_PRIVATE_KEY=0x...
```

### Verify

```bash
# Hoodi
forge verify-contract <DEPLOYED_ADDR> src/Counter.sol:Counter \
  --chain 2910 \
  --verifier-url https://explorer-api-hoodi.morph.network \
  --verifier blockscout --watch

# Mainnet
forge verify-contract <DEPLOYED_ADDR> src/Counter.sol:Counter \
  --chain 2818 \
  --verifier-url https://explorer-api.morph.network/api? \
  --verifier blockscout --watch
```

## ethers.js / viem

```ts
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider("https://rpc-hoodi.morph.network");
// All standard ethers calls work — chainId(), getBalance(), sendTransaction(), etc.
```

```ts
// viem
import { createPublicClient, http, defineChain } from "viem";

export const morphHoodi = defineChain({
  id: 2910,
  name: "Morph Hoodi",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc-hoodi.morph.network"] } },
  blockExplorers: { default: { name: "Morph Hoodi Explorer", url: "https://explorer-hoodi.morph.network" } },
  testnet: true,
});

export const client = createPublicClient({ chain: morphHoodi, transport: http() });
```

## Manual verification via explorer frontend

If automated verification fails (e.g., complex multi-file build, optimizer mismatch), the explorer UI supports six methods:

1. **Solidity (Flattened Sources Code)** — use `forge flatten --output Flattened.sol src/MyContract.sol`.
2. **Solidity (Standard JSON Input)** — extract via `solc --standard-json` or Remix.
3. **Solidity (Multi-part files)** — upload multiple files; imports must use same-level paths.
4. **Vyper (Contracts)**.
5. **Vyper (Standard JSON Input)**.
6. **Vyper (Multi-part files)**.

Two general parameters across all methods:
- **Compiler** must match exactly the version used at deployment.
- **Optimization settings** must match exactly (enable/disable + runs).

## Common RPC errors

| Code | Message | Cause |
|---|---|---|
| -32000 | `invalid transaction: insufficient funds for l1Fee + l2Fee + value` | Not accounting for L1 data fee when sending max ETH |
| -32000 | `gas price too low: X wei, use at least tx.gasPrice = Y wei` | Below current minimum — refresh `eth_gasPrice` and retry |
| -32000 | `gas price too high: X wei, use at most tx.gasPrice = Y wei` | Safety bound to prevent burning funds — likely a config error in your script |

## Fee estimation cheat sheet

```ts
// L2 execution fee — same as Ethereum
const gasUsed   = await provider.estimateGas(tx);
const gasPrice  = await provider.getFeeData(); // baseFee + priorityFee
const l2ExecFee = gasUsed * gasPrice.gasPrice;

// L1 data fee — call the GasPriceOracle predeploy
const oracle = new ethers.Contract(
  "0x530000000000000000000000000000000000000f",
  ["function getL1Fee(bytes _data) view returns (uint256)"],
  provider,
);
const txData = ethers.Transaction.from(tx).unsignedSerialized;
const l1DataFee = await oracle.getL1Fee(txData);

const totalFee = l2ExecFee + l1DataFee;
```

**Always display `totalFee` (L1 + L2) to users.** Multiplying gas × gasPrice alone undershoots — the L1 data fee is usually the larger of the two on L2s.
