import { defineChain } from "viem";
import {
  MORPH_HOODI,
  MORPH_MAINNET,
  MORPH_NETWORK_CAIP2,
  type MorphNetwork,
} from "@/lib/morph-urls";

function buildChain(n: MorphNetwork) {
  return defineChain({
    id: n.chainId,
    name: n.name,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: [n.rpc] },
    },
    blockExplorers: {
      default: { name: `${n.name} Explorer`, url: n.explorer },
    },
    testnet: n.testnet,
  });
}

export const morphHoodi = buildChain(MORPH_HOODI);
export const morphMainnet = buildChain(MORPH_MAINNET);

// The active chain the wallet connects to, selected by NEXT_PUBLIC_MORPH_NETWORK.
export const morphActive =
  MORPH_NETWORK_CAIP2 === MORPH_HOODI.caip2 ? morphHoodi : morphMainnet;

export const MORPH_ACTIVE_CAIP2 = MORPH_NETWORK_CAIP2;
