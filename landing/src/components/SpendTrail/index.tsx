"use client";

import type { DiagnosePaidResponse } from "@sniffy/scraper/schemas";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { useState } from "react";
import { buildExplorerUrl, isFixtureTxHash, networkLabel } from "@/lib/explorer";
import { X402Mode } from "./X402Mode";

function truncate(hex: string, head = 10, tail = 8): string {
  if (hex.length <= head + tail) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

export function SpendTrail({ report }: { report: DiagnosePaidResponse }) {
  const { receipt } = report;
  const explorerUrl = buildExplorerUrl(receipt.network, receipt.transactionHash);
  const fixtureHash = isFixtureTxHash(receipt.transactionHash);
  const [open, setOpen] = useState(false);
  const settledAt = new Date(receipt.settledAt);

  return (
    <section className="border-2 border-sniffy-ink bg-sniffy-paper-2 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
          Spend trail
        </h3>
        <div className="flex items-center gap-2">
          <X402Mode mode={receipt.facilitatorMode} isFixtureHash={fixtureHash} />
          <span className="border-2 border-sniffy-ink bg-sniffy-teal px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em]">
            {networkLabel(receipt.network)}
          </span>
        </div>
      </div>

      <dl className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <dt className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
            Amount
          </dt>
          <dd className="mt-1 font-mono text-lg font-semibold text-sniffy-ink">
            {receipt.amount}
            {fixtureHash ? (
              <span className="ml-2 font-display text-xs uppercase tracking-[0.16em] text-sniffy-warn">
                (simulated)
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
            Transaction
          </dt>
          <dd className="mt-1 font-mono text-xs text-sniffy-ink">
            {explorerUrl ? (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline decoration-sniffy-ink underline-offset-2 hover:text-sniffy-warn focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow"
              >
                {truncate(receipt.transactionHash)}
                <ExternalLink size={11} aria-hidden />
              </a>
            ) : (
              <span title={receipt.transactionHash}>{truncate(receipt.transactionHash)}</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
            Facilitator
          </dt>
          <dd className="mt-1 font-mono text-xs text-sniffy-ink">
            {receipt.facilitator}
          </dd>
        </div>
        <div>
          <dt className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
            Settled at
          </dt>
          <dd
            className="mt-1 font-mono text-xs text-sniffy-ink"
            title={receipt.settledAt}
          >
            {settledAt.toLocaleString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </dd>
        </div>
        <div>
          <dt className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
            Request ID
          </dt>
          <dd className="mt-1 font-mono text-xs text-sniffy-ink">
            {report.requestId}
          </dd>
        </div>
        <div>
          <dt className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
            Sniff ID
          </dt>
          <dd className="mt-1 font-mono text-xs text-sniffy-ink">
            {report.sniffId}
          </dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="mt-3 inline-flex items-center gap-1 font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute hover:text-sniffy-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow"
        aria-expanded={open}
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        Cache key / asset details
      </button>
      {open ? (
        <dl className="mt-2 grid gap-2 border-t border-sniffy-rule pt-2 font-mono text-[11px] md:grid-cols-2">
          <div>
            <dt className="text-sniffy-ink-mute">Asset</dt>
            <dd className="break-all text-sniffy-ink">{receipt.asset}</dd>
          </div>
          <div>
            <dt className="text-sniffy-ink-mute">Atomic amount</dt>
            <dd className="text-sniffy-ink">{receipt.atomicAmount}</dd>
          </div>
          <div>
            <dt className="text-sniffy-ink-mute">Network (CAIP-2)</dt>
            <dd className="text-sniffy-ink">{receipt.network}</dd>
          </div>
          <div>
            <dt className="text-sniffy-ink-mute">Report version</dt>
            <dd className="text-sniffy-ink">{report.reportVersion}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
