import { MORPH_HOODI, MORPH_MAINNET, morphByCaip2 } from "./morph-urls";

export const HOODI_EXPLORER = MORPH_HOODI.explorer;
export const MAINNET_EXPLORER = MORPH_MAINNET.explorer;

// Fixture-receipt mode produces a synthetic tx hash of the form `0xsample…`
// so the scraper can return a parseable Receipt even when the Morph facilitator
// did not settle on-chain (network not in /v2/supported, or facilitator down).
// Block explorers won't resolve these, so we suppress the URL — `SpendTrail`
// falls back to plain monospace text.
export function isFixtureTxHash(txHash: string): boolean {
  return txHash.startsWith("0xsample");
}

export function buildExplorerUrl(caip2: string, txHash: string): string | null {
  if (!txHash) return null;
  if (isFixtureTxHash(txHash)) return null;
  const network = morphByCaip2(caip2);
  if (!network) return null;
  return `${network.explorer}/tx/${txHash}`;
}

export function networkLabel(caip2: string): string {
  return morphByCaip2(caip2)?.name ?? caip2;
}
