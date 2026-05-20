import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { morphActive } from "./chains";

const FALLBACK_PROJECT_ID = "00000000000000000000000000000000";

function readProjectId(): string {
  const raw = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;
  if (raw && raw.length > 0) return raw;
  if (typeof window !== "undefined") {
    // Surface the misconfiguration in the browser console but don't crash —
    // the free `/quote` and `/sample` paths still work without a wallet.
    // eslint-disable-next-line no-console
    console.warn(
      "[sniffy] NEXT_PUBLIC_REOWN_PROJECT_ID is not set. Wallet connection will fail until you provide a project ID from https://cloud.reown.com.",
    );
  }
  return FALLBACK_PROJECT_ID;
}

export const projectId = readProjectId();

export const networks = [morphActive] as const;

export const wagmiAdapter = new WagmiAdapter({
  ssr: true,
  networks: [morphActive],
  projectId,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
