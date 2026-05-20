const EXPLORERS: Record<string, string> = {
  "eip155:2910": "https://explorer-hoodi.morph.network/tx/",
  "eip155:2818": "https://explorer.morphl2.io/tx/",
};

export function getExplorerUrl(network: string, txHash: string): string | null {
  const base = EXPLORERS[network];
  if (base === undefined) return null;
  return `${base}${txHash}`;
}
