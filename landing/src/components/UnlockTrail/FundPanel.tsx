"use client";

import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { useState } from "react";
import { MORPH_HOODI } from "@/lib/morph-urls";

// URLs live in lib/morph-urls.ts so chains.ts, explorer.ts, and the doctor
// script can't disagree. Override per-deploy via NEXT_PUBLIC_MORPH_HOODI_*.
const BRIDGE_URL = MORPH_HOODI.bridge;
const FAUCET_URL = MORPH_HOODI.faucet ?? "";
const HOODI_EXPLORER = MORPH_HOODI.explorer;

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
        How to fund a Morph Hoodi wallet
      </button>
      {open ? (
        <div className="mt-3 space-y-3 font-mono text-xs text-sniffy-ink">
          <ol className="space-y-2 pl-4">
            <li>
              <span className="font-semibold">Bridge a small amount.</span> Open
              the Morph Hoodi bridge, connect your wallet, and bridge a tiny
              amount of test ETH and/or test USDC.
            </li>
            <li>
              <span className="font-semibold">Or hit the faucet.</span> If the
              Hoodi faucet is online for your wallet, it can drip enough to
              cover gas + a couple of $0.05 sniffs.
            </li>
            <li>
              <span className="font-semibold">Verify with the explorer.</span>{" "}
              Once your bridge transaction settles you should see the balance
              on the Hoodi explorer.
            </li>
          </ol>
          <ul className="flex flex-wrap gap-2 pt-1">
            <a
              href={BRIDGE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 border-2 border-sniffy-ink bg-sniffy-paper px-2 py-1 font-display text-[10px] font-semibold uppercase tracking-[0.14em] hover:bg-sniffy-yellow focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow"
            >
              Morph Hoodi bridge
              <ExternalLink size={11} aria-hidden />
            </a>
            <a
              href={FAUCET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 border-2 border-sniffy-ink bg-sniffy-paper px-2 py-1 font-display text-[10px] font-semibold uppercase tracking-[0.14em] hover:bg-sniffy-yellow focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow"
            >
              Hoodi faucet
              <ExternalLink size={11} aria-hidden />
            </a>
            <a
              href={HOODI_EXPLORER}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 border-2 border-sniffy-ink bg-sniffy-paper px-2 py-1 font-display text-[10px] font-semibold uppercase tracking-[0.14em] hover:bg-sniffy-yellow focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow"
            >
              Hoodi explorer
              <ExternalLink size={11} aria-hidden />
            </a>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
