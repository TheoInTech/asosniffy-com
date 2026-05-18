// Single source of truth for Morph L2 network endpoints. Each field reads a
// matching NEXT_PUBLIC_* env var with a documented default that's been verified
// against the live Morph network (see scripts/doctor-morph.ts). Centralizing
// here means `chains.ts`, `explorer.ts`, the FundPanel, and the doctor script
// never disagree about a URL.
//
// Defaults verified live on 2026-05-18:
//   - bridge-hoodi.morphl2.io        → 200
//   - faucet-hoodi.morph.network     → 200
//   - explorer-hoodi.morphl2.io      → 200
//   - rpc-hoodi.morph.network        → chain ID 0xb5e (2910)
//   - rpc.morphl2.io                 → chain ID 0xb02 (2818)
//   - morph-rails.morph.network/x402 → supports eip155:2818 only (Hoodi pending)

export interface MorphNetwork {
  readonly chainId: number;
  readonly caip2: `eip155:${number}`;
  readonly name: string;
  readonly rpc: string;
  readonly explorer: string;
  readonly bridge: string;
  readonly faucet?: string;
  readonly facilitator: string;
  readonly testnet: boolean;
}

function readEnv(name: string, fallback: string): string {
  if (typeof process === "undefined") return fallback;
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

export const MORPH_FACILITATOR_URL = readEnv(
  "NEXT_PUBLIC_MORPH_FACILITATOR_URL",
  "https://morph-rails.morph.network/x402",
);

export const MORPH_HOODI: MorphNetwork = {
  chainId: 2910,
  caip2: "eip155:2910",
  name: "Morph Hoodi",
  rpc: readEnv("NEXT_PUBLIC_MORPH_HOODI_RPC", "https://rpc-hoodi.morph.network"),
  explorer: readEnv(
    "NEXT_PUBLIC_MORPH_HOODI_EXPLORER",
    "https://explorer-hoodi.morphl2.io",
  ),
  bridge: readEnv(
    "NEXT_PUBLIC_MORPH_HOODI_BRIDGE",
    "https://bridge-hoodi.morphl2.io",
  ),
  faucet: readEnv(
    "NEXT_PUBLIC_MORPH_HOODI_FAUCET",
    "https://faucet-hoodi.morph.network",
  ),
  facilitator: MORPH_FACILITATOR_URL,
  testnet: true,
};

export const MORPH_MAINNET: MorphNetwork = {
  chainId: 2818,
  caip2: "eip155:2818",
  name: "Morph Mainnet",
  rpc: readEnv("NEXT_PUBLIC_MORPH_MAINNET_RPC", "https://rpc.morphl2.io"),
  explorer: readEnv(
    "NEXT_PUBLIC_MORPH_MAINNET_EXPLORER",
    "https://explorer.morphl2.io",
  ),
  bridge: readEnv(
    "NEXT_PUBLIC_MORPH_MAINNET_BRIDGE",
    "https://bridge.morphl2.io",
  ),
  facilitator: MORPH_FACILITATOR_URL,
  testnet: false,
};

export const MORPH_NETWORKS = [MORPH_HOODI, MORPH_MAINNET] as const;

export function morphByCaip2(caip2: string): MorphNetwork | null {
  return MORPH_NETWORKS.find((n) => n.caip2 === caip2) ?? null;
}

export function morphByChainId(chainId: number): MorphNetwork | null {
  return MORPH_NETWORKS.find((n) => n.chainId === chainId) ?? null;
}
