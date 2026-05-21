"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import type { SniffSummary } from "@sniffy/scraper/schemas";
import { getWalletSniffs } from "@/lib/api/client";
import { SiweAuthError } from "@/lib/api/errors";
import { useSiweSession } from "@/lib/auth/use-siwe-session";
import { ProvenanceIcon } from "@/components/ProvenanceIcon";

// Mount-guarded entry point. AppKit's `useAppKit()` throws server-side
// because createAppKit only runs on the client. Deferring the full Trail
// machinery until after first paint lets Next.js SSR/hydrate this route
// without triggering "Please call createAppKit before using useAppKit hook".
export function TrailGate() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div className="border-2 border-sniffy-ink bg-sniffy-paper-2 p-6 text-center font-mono text-sm text-sniffy-ink-mute md:p-10">
        Loading the Trail…
      </div>
    );
  }
  return <TrailGateInner />;
}

// The Trail: per-wallet history of paid sniffs.
//
// State machine (rendered by <TrailGateInner> after mount):
//   disconnected   → "Connect wallet to follow the scent trail" + AppKit modal
//   ready_to_sign  → "Sign to sniff out your past reports" button
//   signing        → spinner copy
//   error          → "The trail went cold" + retry
//   signed_in      → fetch /wallet/sniffs and render <TrailList>
//
// Reuses the existing playful pixel-detective voice in UI copy. JSON keys,
// schemas, and function names stay clean (per CLAUDE.md branding rules).

function TrailGateInner() {
  const siwe = useSiweSession();
  const { open } = useAppKit();
  const { isConnected } = useAccount();

  if (siwe.status === "disconnected" || !isConnected) {
    return (
      <EmptyState
        title="Connect your wallet to follow the scent trail."
        body="The Trail keeps a copy of every sniff your wallet has paid for. Connect to unlock."
        action={{ label: "Connect wallet", onClick: () => open() }}
      />
    );
  }

  if (siwe.status === "ready_to_sign" || siwe.status === "error") {
    return (
      <EmptyState
        title={
          siwe.status === "error"
            ? "The trail went cold. Try signing again."
            : "Sign to sniff out your past reports."
        }
        body={
          siwe.error ??
          "No gas, just a signature. We use SIWE (EIP-4361) to prove the wallet is yours, then issue a 30-minute session token."
        }
        action={{ label: "Sign to unlock the Trail", onClick: siwe.signIn }}
      />
    );
  }

  if (siwe.status === "signing") {
    return (
      <EmptyState
        title="Waiting for your signature…"
        body="Check your wallet for the SIWE prompt. We never ask for gas — only a signature."
      />
    );
  }

  // signed_in
  return (
    <TrailList
      sessionToken={siwe.sessionToken!}
      onInvalidate={siwe.invalidateSession}
      onSignOut={siwe.signOut}
    />
  );
}

interface EmptyStateProps {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}

function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className="border-2 border-sniffy-ink bg-sniffy-paper-2 p-6 text-center md:p-10">
      <h2 className="font-display text-base font-semibold uppercase tracking-[0.14em] text-sniffy-ink md:text-lg">
        {title}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-sniffy-ink-mute">
        {body}
      </p>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 inline-flex items-center gap-2 border-2 border-sniffy-ink bg-sniffy-yellow px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.14em] text-sniffy-ink shadow-ink-tab-sm transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-ink motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

interface TrailListProps {
  sessionToken: string;
  onInvalidate: () => void;
  onSignOut: () => Promise<void>;
}

function TrailList({ sessionToken, onInvalidate, onSignOut }: TrailListProps) {
  const [items, setItems] = useState<SniffSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    getWalletSniffs({ sessionToken })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof SiweAuthError) {
          // Session expired/revoked — clear and prompt to re-sign.
          onInvalidate();
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load Trail.");
      });
    return () => {
      cancelled = true;
    };
  }, [sessionToken, onInvalidate]);

  if (error) {
    return (
      <EmptyState
        title="The trail went cold."
        body={error}
        action={{ label: "Sign out", onClick: () => void onSignOut() }}
      />
    );
  }

  if (items === null) {
    return (
      <div className="border-2 border-sniffy-ink bg-sniffy-paper-2 p-6 text-center font-mono text-sm text-sniffy-ink-mute">
        Sniffing out your past reports…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="No scent trail yet."
        body="Run your first paid sniff and it will show up here within a few seconds. Your Trail keeps the last 200 reports for 30 days per wallet."
        action={{ label: "Start a sniff", onClick: () => (window.location.href = "/") }}
      />
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold uppercase tracking-[0.14em] text-sniffy-ink md:text-lg">
          The Trail · {items.length} sniff{items.length === 1 ? "" : "s"}
        </h2>
        <button
          type="button"
          onClick={() => void onSignOut()}
          className="font-mono text-xs text-sniffy-ink-mute underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow"
        >
          Sign out
        </button>
      </div>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((s) => (
          <li key={s.sniffId}>
            <SniffCard summary={s} />
          </li>
        ))}
      </ul>
    </>
  );
}

interface SniffCardProps {
  summary: SniffSummary;
}

function SniffCard({ summary }: SniffCardProps) {
  return (
    <Link
      href={`/trail/${encodeURIComponent(summary.sniffId)}`}
      aria-label={`Open trail for ${summary.app.name} — score ${summary.overallScore ?? "—"} of 100`}
      className="block border-2 border-sniffy-ink bg-sniffy-paper p-4 transition-transform hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-ink-tab-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0"
    >
      <div className="flex items-start gap-3">
        {summary.app.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={summary.app.iconUrl}
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 border-2 border-sniffy-ink object-cover"
          />
        ) : (
          <div className="grid h-12 w-12 place-items-center border-2 border-sniffy-ink bg-sniffy-paper-2 font-display text-xl font-bold text-sniffy-ink">
            {summary.app.name.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="truncate font-display text-sm font-semibold text-sniffy-ink">
              {summary.app.name}
            </h3>
            <ProvenanceIcon value={summary.appMetadataProvenance} />
          </div>
          <p className="truncate font-mono text-xs text-sniffy-ink-mute">
            {summary.app.id} · {flagFor(summary.country)} {summary.country} · {summary.store.toUpperCase()}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between font-mono text-xs text-sniffy-ink-mute">
        <span>
          {summary.keywords.length} keyword{summary.keywords.length === 1 ? "" : "s"} ·
          {" "}score{" "}
          <span className="font-semibold text-sniffy-ink">
            {summary.overallScore ?? "—"}/100
          </span>
        </span>
        <span>{relativeTime(summary.settledAt)}</span>
      </div>
      <p className="mt-2 inline-flex items-center gap-1 font-mono text-xs font-semibold text-sniffy-ink">
        <span aria-hidden>🔍</span> View trail →
      </p>
    </Link>
  );
}

// Lightweight relative-time formatter. Avoids pulling in a dep for one place.
function relativeTime(iso: string): string {
  const now = Date.now();
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "—";
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const min = Math.round(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  return `${days}d ago`;
}

// Tiny ISO-country → emoji flag helper (regional indicator math). Returns the
// country code unchanged if it's not exactly two letters.
function flagFor(country: string): string {
  if (country.length !== 2) return "";
  const code = country.toUpperCase();
  const A = 0x1f1e6;
  const codePointA = code.charCodeAt(0) - 65 + A;
  const codePointB = code.charCodeAt(1) - 65 + A;
  if (codePointA < A || codePointB < A) return "";
  return String.fromCodePoint(codePointA, codePointB);
}
