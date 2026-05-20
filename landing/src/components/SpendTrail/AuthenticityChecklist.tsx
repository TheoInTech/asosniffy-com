"use client";

import type { Receipt } from "@sniffy/scraper/schemas";
import { Check, ChevronDown, ChevronRight, X, Minus, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import {
  verifyReceiptOnChain,
  type AuthenticityReport,
  type CheckResult,
  type CheckStatus,
} from "@/lib/wallet/verify";

interface Props {
  receipt: Receipt;
  className?: string;
}

function StatusIcon({ status }: { status: CheckStatus }) {
  switch (status) {
    case "passed":
      return <Check size={12} aria-hidden className="text-sniffy-ink" />;
    case "failed":
      return <X size={12} aria-hidden className="text-sniffy-warn" />;
    case "skipped":
      return <Minus size={12} aria-hidden className="text-sniffy-ink-mute" />;
    case "pending":
      return (
        <Loader2 size={12} aria-hidden className="animate-spin text-sniffy-ink-mute" />
      );
  }
}

function badgeTint(status: CheckStatus): string {
  switch (status) {
    case "passed":
      return "bg-sniffy-teal text-sniffy-ink";
    case "failed":
      return "bg-sniffy-warn text-sniffy-ink";
    case "skipped":
      return "bg-sniffy-paper-2 text-sniffy-ink-mute";
    case "pending":
      return "bg-sniffy-paper-2 text-sniffy-ink-mute";
  }
}

function badgeLabel(status: CheckStatus): string {
  switch (status) {
    case "passed":
      return "verified";
    case "failed":
      return "failed";
    case "skipped":
      return "skipped";
    case "pending":
      return "checking…";
  }
}

function CheckRow({ check }: { check: CheckResult }) {
  const [open, setOpen] = useState(false);
  const hasEvidence =
    check.evidence !== undefined && Object.keys(check.evidence).length > 0;

  return (
    <div className="border border-sniffy-rule bg-sniffy-paper">
      <button
        type="button"
        onClick={() => hasEvidence && setOpen((s) => !s)}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left",
          hasEvidence
            ? "hover:bg-sniffy-paper-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow"
            : "cursor-default",
        )}
        aria-expanded={hasEvidence ? open : undefined}
        disabled={!hasEvidence}
      >
        {hasEvidence ? (
          open ? (
            <ChevronDown size={11} aria-hidden />
          ) : (
            <ChevronRight size={11} aria-hidden />
          )
        ) : (
          <span className="inline-block w-[11px]" aria-hidden />
        )}
        <StatusIcon status={check.status} />
        <span className="flex-1 font-mono text-[11px] text-sniffy-ink">
          {check.label}
        </span>
        <span
          className={cn(
            "border border-sniffy-ink px-1.5 py-0.5 font-display text-[9px] uppercase tracking-[0.14em]",
            badgeTint(check.status),
          )}
        >
          {badgeLabel(check.status)}
        </span>
      </button>
      <div className="border-t border-sniffy-rule px-3 py-2">
        <p className="font-mono text-[10px] text-sniffy-ink-mute">
          {check.detail}
        </p>
        {hasEvidence && open ? (
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all border border-sniffy-rule bg-sniffy-paper-2 p-2 font-mono text-[10px] leading-snug text-sniffy-ink">
            {JSON.stringify(check.evidence, null, 2)}
          </pre>
        ) : null}
      </div>
    </div>
  );
}

const INITIAL_CHECKS: CheckResult[] = [
  {
    id: "tx-exists",
    label: "Transaction exists on the declared network",
    status: "pending",
    detail: "Querying Morph RPC…",
  },
  {
    id: "settlement-contract",
    label: "Settlement contract is the official Morph facilitator",
    status: "pending",
    detail: "Waiting for tx data…",
  },
  {
    id: "relayer-advertised",
    label: "Relayer is an officially advertised facilitator signer",
    status: "pending",
    detail: "Fetching /v2/supported…",
  },
  {
    id: "authorization-used",
    label: "EIP-3009 AuthorizationUsed event emitted",
    status: "pending",
    detail: "Scanning receipt logs…",
  },
  {
    id: "meta-tx-pattern",
    label: "Payer signed off-chain; facilitator submitted on-chain",
    status: "pending",
    detail: "Cross-referencing payer vs relayer…",
  },
];

export function AuthenticityChecklist({ receipt, className }: Props) {
  const [report, setReport] = useState<AuthenticityReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setReport(null);
    verifyReceiptOnChain(receipt)
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Verification failed.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [receipt]);

  const checks = report?.checks ?? INITIAL_CHECKS;
  const passed = checks.filter((c) => c.status === "passed").length;
  const failed = checks.filter((c) => c.status === "failed").length;
  const total = checks.length;
  const allPending = checks.every((c) => c.status === "pending");

  return (
    <section
      className={cn(
        "border-2 border-sniffy-ink bg-sniffy-paper-2 p-4",
        className,
      )}
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
            On-chain authenticity
          </h4>
          <p className="mt-1 font-mono text-[11px] text-sniffy-ink">
            Five forensic checks against the settled tx — verifiable
            independently from any Morph RPC. Click a row for raw evidence.
          </p>
        </div>
        <span
          className={cn(
            "border-2 border-sniffy-ink px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em]",
            allPending
              ? "bg-sniffy-paper-2 text-sniffy-ink-mute"
              : failed > 0
                ? "bg-sniffy-warn text-sniffy-ink"
                : "bg-sniffy-teal text-sniffy-ink",
          )}
        >
          {allPending ? "checking…" : `${passed}/${total} verified`}
        </span>
      </header>

      {error ? (
        <p
          role="alert"
          className="mb-3 border-2 border-sniffy-warn bg-sniffy-paper p-2 font-mono text-[11px] text-sniffy-ink"
        >
          Verification could not complete: {error}
        </p>
      ) : null}

      <div className="space-y-2">
        {checks.map((c) => (
          <CheckRow key={c.id} check={c} />
        ))}
      </div>
    </section>
  );
}
