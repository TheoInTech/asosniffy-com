"use client";

import { AlertTriangle } from "lucide-react";
import { useSwitchChain } from "wagmi";
import { morphHoodi } from "@/lib/wallet/chains";

export function NetworkSwitchButton() {
  const { switchChain, isPending, error } = useSwitchChain();
  return (
    <div className="border-2 border-sniffy-warn bg-sniffy-paper-2 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="mt-0.5 text-sniffy-warn" aria-hidden />
        <div className="flex-1">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.16em] text-sniffy-warn">
            Wrong network
          </p>
          <p className="mt-1 font-mono text-xs text-sniffy-ink-2">
            Sniffy settles on Morph Hoodi testnet. Switch to continue.
          </p>
          <button
            type="button"
            onClick={() => switchChain({ chainId: morphHoodi.id })}
            disabled={isPending}
            className="mt-2 inline-flex items-center border-2 border-sniffy-ink bg-sniffy-yellow px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.14em] text-sniffy-ink shadow-ink-tab-sm transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-ink motion-reduce:transition-none disabled:opacity-60"
          >
            {isPending ? "Switching…" : "Switch to Morph Hoodi"}
          </button>
          {error ? (
            <p className="mt-1 font-mono text-[10px] text-sniffy-warn">
              {error.message}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
