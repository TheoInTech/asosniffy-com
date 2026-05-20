"use client";

import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { useState } from "react";
import { getActiveMorphNetwork } from "@/lib/morph-urls";

// URLs live in lib/morph-urls.ts so chains.ts, explorer.ts, and the doctor
// script can't disagree. Override per-deploy via NEXT_PUBLIC_MORPH_{HOODI,MAINNET}_*.
const ACTIVE = getActiveMorphNetwork();

export function FundPanel({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-2 border-sniffy-ink bg-sniffy-paper-2 p-3">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="inline-flex items-center gap-1 font-display text-xs font-semibold uppercase tracking-[0.16em] text-sniffy-ink hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow"
        aria-expanded={open}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        How to fund a {ACTIVE.name} wallet
      </button>
      {open ? (
        <div className="mt-3 space-y-3 font-mono text-xs text-sniffy-ink">
          <ol className="space-y-2 pl-4">
            {!ACTIVE.testnet ? (
              <li>
                <span className="font-semibold">Get USDC from Bitget.</span> Buy
                USDC on Bitget and withdraw directly to your wallet on{" "}
                {ACTIVE.name} — no bridging needed.
              </li>
            ) : null}
            <li>
              <span className="font-semibold">
                {ACTIVE.testnet ? "Bridge a small amount." : "Or bridge from L1."}
              </span>{" "}
              Open the {ACTIVE.name} bridge, connect your wallet, and bridge a
              tiny amount of {ACTIVE.testnet ? "test " : ""}ETH and/or{" "}
              {ACTIVE.testnet ? "test " : ""}USDC.
            </li>
            {ACTIVE.faucet ? (
              <li>
                <span className="font-semibold">Or hit the faucet.</span> If the{" "}
                {ACTIVE.name} faucet is online for your wallet, it can drip
                enough to cover gas + a couple of $0.05 sniffs.
              </li>
            ) : null}
            <li>
              <span className="font-semibold">Verify with the explorer.</span>{" "}
              Once your bridge transaction settles you should see the balance
              on the {ACTIVE.name} explorer.
            </li>
          </ol>
          <ul className="flex flex-wrap gap-2 pt-1">
            {!ACTIVE.testnet ? (
              <a
                href="https://www.bitget.com/en/referral/register?from=referral&clacCode=9TB6K2NK"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 border-2 border-sniffy-ink bg-sniffy-paper px-2 py-1 font-display text-[10px] font-semibold uppercase tracking-[0.14em] hover:bg-sniffy-yellow focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow"
              >
                Get USDC from Bitget
                <ExternalLink size={11} aria-hidden />
              </a>
            ) : null}
            <a
              href={ACTIVE.bridge}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 border-2 border-sniffy-ink bg-sniffy-paper px-2 py-1 font-display text-[10px] font-semibold uppercase tracking-[0.14em] hover:bg-sniffy-yellow focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow"
            >
              {ACTIVE.name} bridge
              <ExternalLink size={11} aria-hidden />
            </a>
            {ACTIVE.faucet ? (
              <a
                href={ACTIVE.faucet}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 border-2 border-sniffy-ink bg-sniffy-paper px-2 py-1 font-display text-[10px] font-semibold uppercase tracking-[0.14em] hover:bg-sniffy-yellow focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow"
              >
                {ACTIVE.name} faucet
                <ExternalLink size={11} aria-hidden />
              </a>
            ) : null}
            <a
              href={ACTIVE.explorer}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 border-2 border-sniffy-ink bg-sniffy-paper px-2 py-1 font-display text-[10px] font-semibold uppercase tracking-[0.14em] hover:bg-sniffy-yellow focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow"
            >
              {ACTIVE.name} explorer
              <ExternalLink size={11} aria-hidden />
            </a>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
