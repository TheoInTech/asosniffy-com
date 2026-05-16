# Networks & Tokens

x402 uses **CAIP-2** identifiers for cross-chain unambiguity. Facilitators
support **networks**, not specific tokens — any compatible token works on any
facilitator that supports the network.

## CAIP-2 identifier format

| Ecosystem | Format                          | Example                                                  |
|-----------|---------------------------------|----------------------------------------------------------|
| EVM       | `eip155:<chainId>`              | `eip155:8453` (Base mainnet), `eip155:84532` (Base Sepolia) |
| Solana    | `solana:<genesisHash>`          | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` (mainnet)      |
| TON       | `tvm:<workchain>`               | `tvm:-239` (mainnet), `tvm:-3` (testnet)                 |
| Algorand  | `algorand:<genesisHash>`        | `algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=` |
| Stellar   | `stellar:<network>`             | `stellar:pubnet`, `stellar:testnet`                      |
| Aptos     | `aptos:<chainId>`               | `aptos:1` (mainnet), `aptos:2` (testnet)                 |
| Hedera    | `hedera:<network>`              | `hedera:mainnet`, `hedera:testnet`                       |

For an EVM chain not in the registry below, just use its chain ID:
`eip155:43114` for Avalanche, `eip155:2910` for Morph Hoodi, etc. — the
scheme implementation handles the network automatically as long as the
facilitator supports it.

## Token support per ecosystem

| Ecosystem | Supported tokens                          | Transfer method                       |
|-----------|-------------------------------------------|---------------------------------------|
| EVM       | Any ERC-20                                | EIP-3009 or Permit2                   |
| Solana    | Any SPL or Token-2022                     | SPL Transfer                          |
| TON       | Any TEP-74 jetton                         | Signed W5R1 internal message          |
| Stellar   | Any Soroban token implementing SEP-41     | `transfer(from, to, amount)`          |
| Aptos     | Any fungible asset                        | `primary_fungible_store::transfer`    |
| Hedera    | HBAR (asset `0.0.0`) or any HTS fungible  | Hedera Transfer Transaction           |

## EVM asset transfer methods

| Method      | When chosen                                        | How it works                                  |
|-------------|----------------------------------------------------|-----------------------------------------------|
| **EIP-3009** | Tokens with `transferWithAuthorization` (e.g., USDC) | Single off-chain signature, no approval step  |
| **Permit2**  | Any ERC-20 (universal fallback)                   | Uniswap Permit2 + the x402 exact proxy        |

Permit2 requires a one-time onchain approval per token. The
**EIP-2612 Gas Sponsoring** and **ERC-20 Approval Gas Sponsoring** extensions
let the facilitator sponsor gas for that approval — see
[extensions.md](extensions.md).

## Specifying payment amounts

Two ways:

### 1. Dollar-string pricing (`"$0.01"`)

Works only on chains that have a registered default stablecoin in the SDK.
The SDK picks the asset, decimals, and EIP-712 fields for you.

### 2. TokenAmount (works on any chain)

```ts
{
  scheme: "exact",
  network: "eip155:43114",                 // Avalanche
  amountInAtomicUnits: "10000",            // 0.01 USDC (6 decimals)
  asset: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
  eip712: { name: "USD Coin", version: "2" },
  payTo: "0xYourAddress",
}
```

For EVM, the `eip712.name` and `eip712.version` come from the token contract's
`name()` and `version()` functions. Look them up on the chain's block
explorer.

## Default asset tables (for `"$0.01"` pricing)

### EVM

| Chain            | CAIP-2            | Token (USDC unless noted) | Name        | Decimals | Method               |
|------------------|-------------------|---------------------------|-------------|----------|----------------------|
| Base             | `eip155:8453`     | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | USD Coin    | 6        | EIP-3009             |
| Base Sepolia     | `eip155:84532`    | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | USDC        | 6        | EIP-3009             |
| Polygon          | `eip155:137`      | `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` | USD Coin    | 6        | EIP-3009             |
| Arbitrum One     | `eip155:42161`    | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | USD Coin    | 6        | EIP-3009             |
| Arbitrum Sepolia | `eip155:421614`   | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` | USD Coin    | 6        | EIP-3009             |
| Monad            | `eip155:143`      | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` | USD Coin    | 6        | EIP-3009             |
| Stable           | `eip155:988`      | `0x779Ded0c9e1022225f8E0630b35a9b54bE713736` | USDT0       | 6        | EIP-3009             |
| Stable Testnet   | `eip155:2201`     | `0x78Cf24370174180738C5B8E352B6D14c83a6c9A9` | USDT0       | 6        | EIP-3009             |
| MegaETH          | `eip155:4326`     | `0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7` | MegaUSD     | 18       | Permit2 + EIP-2612   |
| Mezo Testnet     | `eip155:31611`    | `0x118917a40FAf1CD7a13dB0Ef56C86De7973Ac503` | Mezo USD    | 18       | Permit2 + EIP-2612   |
| Radius           | `eip155:723487`   | `0x33ad9e4BD16B69B5BFdED37D8B5D9fF9aba014Fb` | Stable Coin | 6        | Permit2 + EIP-2612   |
| Radius Testnet   | `eip155:72344`    | `0x33ad9e4BD16B69B5BFdED37D8B5D9fF9aba014Fb` | Stable Coin | 6        | Permit2 + EIP-2612   |
| HPP              | `eip155:190415`   | `0x401eCb1D350407f13ba348573E5630B83638E30D` | Bridged USDC | 6       | EIP-3009             |
| HPP Sepolia      | `eip155:181228`   | `0x401eCb1D350407f13ba348573E5630B83638E30D` | Bridged USDC | 6       | EIP-3009             |

For chains not in this list (e.g., Avalanche, Morph Hoodi, Optimism), use
`TokenAmount` with explicit `amountInAtomicUnits`, `asset`, and `eip712`. The
network still works at runtime; only `"$0.01"` syntactic sugar needs the
registry entry.

### Solana (SVM)

| Chain          | CAIP-2                                                     | Mint                                                   | Decimals |
|----------------|------------------------------------------------------------|--------------------------------------------------------|----------|
| Solana Mainnet | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`                  | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (USDC)  | 6        |
| Solana Devnet  | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`                  | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (USDC)  | 6        |

### TON / Algorand / Stellar / Aptos / Hedera

See the full tables in the upstream docs at
https://docs.x402.org/core-concepts/network-and-token-support — each ecosystem
has its testnet and mainnet entries, plus the USDC/USDT contract address or
asset ID.

## Runtime registration (any network)

You don't need to wait for a chain to be added to the default-asset registry.
Register a scheme implementation for the CAIP-2 ID at runtime, advertise via
`TokenAmount`, and you're done — provided the facilitator supports the
network.

```ts
// Avalanche example — not in defaults registry
const server = new x402ResourceServer(facilitatorClient);
server.register("eip155:*", new ExactEvmScheme());

const routes = {
  "GET /api/data": {
    accepts: [{
      scheme: "exact",
      amountInAtomicUnits: "10000",
      asset: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",  // USDC on Avalanche
      eip712: { name: "USD Coin", version: "2" },
      network: "eip155:43114",
      payTo: "0xYourAddress",
    }],
  },
};
```

## Facilitators by network

| Facilitator        | Networks                                                                  | Notes                          |
|--------------------|----------------------------------------------------------------------------|--------------------------------|
| `x402.org`         | `eip155:84532`, `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`, `stellar:testnet`, `aptos:2` | Default testnet, no setup       |
| CDP (Coinbase)     | Base + others (production)                                                 | `https://api.cdp.coinbase.com/platform/v2/x402` |
| PayAI              | Multiple production networks                                               | `https://facilitator.payai.network` |
| Morph              | Morph-specific networks (e.g., Morph Hoodi)                                | `https://morph-rails.morph.network/x402` |
| Self-hosted        | Any network                                                                | You run the facilitator code   |

Always query the facilitator's `/v2/supported` endpoint to confirm the exact
list of supported `(network, scheme, asset)` tuples before wiring a production
flow — support drifts and not every facilitator implements every chain. See
[facilitator.md](facilitator.md) for details on `/verify`, `/settle`, and
running your own.

## Contributing a default asset

To add a chain to the default-asset registry so `"$0.01"` pricing works out
of the box on that chain, open a PR against `x402-foundation/x402` and follow
`DEFAULT_ASSETS.md`. You must update the TypeScript, Go, and Python
registries in the same PR.
