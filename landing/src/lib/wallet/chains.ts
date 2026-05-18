import { defineChain } from "viem";
import { MORPH_HOODI } from "@/lib/morph-urls";

export const morphHoodi = defineChain({
  id: MORPH_HOODI.chainId,
  name: MORPH_HOODI.name,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [MORPH_HOODI.rpc] },
  },
  blockExplorers: {
    default: { name: `${MORPH_HOODI.name} Explorer`, url: MORPH_HOODI.explorer },
  },
  testnet: MORPH_HOODI.testnet,
});

export const MORPH_HOODI_CAIP2 = MORPH_HOODI.caip2;
