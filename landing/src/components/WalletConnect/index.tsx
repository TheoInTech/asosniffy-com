"use client";

import { Wallet } from "lucide-react";
import { useAppKit } from "@reown/appkit/react";
import { useAccount, useBalance, useDisconnect } from "wagmi";
import { cn } from "@/lib/cn";

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletConnect({ className }: { className?: string }) {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const balance = useBalance({ address });

  if (!isConnected || !address) {
    return (
      <button
        type="button"
        onClick={() => open()}
        className={cn(
          "inline-flex items-center gap-2 border-2 border-sniffy-ink bg-sniffy-paper px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.14em] text-sniffy-ink shadow-ink-tab-sm transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0",
          className,
        )}
      >
        <Wallet size={14} aria-hidden />
        Connect wallet
      </button>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 border-2 border-sniffy-ink bg-sniffy-paper-2 px-3 py-1.5 font-mono text-xs",
        className,
      )}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 bg-sniffy-teal"
      />
      <button
        type="button"
        onClick={() => open()}
        className="font-semibold text-sniffy-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow"
        title="Open wallet"
      >
        {truncateAddress(address)}
      </button>
      <span className="text-sniffy-ink-mute">
        {balance.data
          ? `${Number(balance.data.formatted).toFixed(4)} ${balance.data.symbol}`
          : "—"}
      </span>
      <button
        type="button"
        onClick={() => disconnect()}
        className="ml-2 text-sniffy-ink-mute hover:text-sniffy-warn focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow"
        aria-label="Disconnect wallet"
      >
        ×
      </button>
    </div>
  );
}
