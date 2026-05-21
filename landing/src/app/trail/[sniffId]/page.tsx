"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import type { DiagnosePaidResponse } from "@sniffy/scraper/schemas";
import { Shell } from "@/components/Shell";
import { Report } from "@/components/Report";
import { useSiweSession } from "@/lib/auth/use-siwe-session";
import { getWalletSniff } from "@/lib/api/client";
import { SiweAuthError } from "@/lib/api/errors";
import { ApiError } from "@/lib/api/errors";

// /trail/[sniffId] — replay a single previously-paid report.
//
// Reuses the existing <Report> component so the rendered layout is
// byte-identical to the original paid response.

interface PageProps {
  params: Promise<{ sniffId: string }>;
}

export default function TrailSniffPage({ params }: PageProps) {
  const { sniffId } = use(params);
  return (
    <Shell>
      <section className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-10">
        <header className="mb-4 flex items-baseline justify-between gap-2">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-sniffy-ink-mute">
              wallet history
            </p>
            <h1 className="mt-1 font-display text-xl font-bold text-sniffy-ink md:text-2xl">
              Sniff <span className="font-mono text-base text-sniffy-ink-mute">{sniffId}</span>
            </h1>
          </div>
          <Link
            href="/trail"
            className="font-mono text-xs uppercase tracking-[0.14em] text-sniffy-ink underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow"
          >
            ← Back to Trail
          </Link>
        </header>
        <SniffReplay sniffId={sniffId} />
      </section>
    </Shell>
  );
}

function SniffReplay({ sniffId }: { sniffId: string }) {
  // Mount guard — keeps SSR from invoking useAppKit before createAppKit runs.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div className="border-2 border-sniffy-ink bg-sniffy-paper-2 p-6 text-center font-mono text-sm text-sniffy-ink-mute md:p-10">
        Replaying the trail…
      </div>
    );
  }
  return <SniffReplayInner sniffId={sniffId} />;
}

function SniffReplayInner({ sniffId }: { sniffId: string }) {
  const siwe = useSiweSession();
  const { open } = useAppKit();
  const { isConnected } = useAccount();
  const [report, setReport] = useState<DiagnosePaidResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (siwe.status !== "signed_in" || !siwe.sessionToken) {
      setReport(null);
      return;
    }
    let cancelled = false;
    setReport(null);
    setError(null);
    getWalletSniff({ sessionToken: siwe.sessionToken, sniffId })
      .then((res) => {
        if (cancelled) return;
        setReport(res);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof SiweAuthError) {
          siwe.invalidateSession();
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          setError(
            "We can't find that sniff under your wallet. Either it expired (30-day retention) or it belongs to a different wallet.",
          );
          return;
        }
        setError(err instanceof Error ? err.message : "Couldn't open this sniff.");
      });
    return () => {
      cancelled = true;
    };
  }, [siwe.status, siwe.sessionToken, sniffId, siwe.invalidateSession]);

  if (siwe.status === "disconnected" || !isConnected) {
    return (
      <div className="border-2 border-sniffy-ink bg-sniffy-paper-2 p-6 text-center md:p-10">
        <p className="text-sm text-sniffy-ink-mute">
          Connect the wallet that paid for this sniff to view it.
        </p>
        <button
          type="button"
          onClick={() => open()}
          className="mt-4 inline-flex items-center gap-2 border-2 border-sniffy-ink bg-sniffy-yellow px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.14em] text-sniffy-ink shadow-ink-tab-sm"
        >
          Connect wallet
        </button>
      </div>
    );
  }

  if (siwe.status !== "signed_in") {
    return (
      <div className="border-2 border-sniffy-ink bg-sniffy-paper-2 p-6 text-center md:p-10">
        <p className="text-sm text-sniffy-ink-mute">
          {siwe.error ?? "Sign to unlock the Trail."}
        </p>
        <button
          type="button"
          onClick={() => void siwe.signIn()}
          className="mt-4 inline-flex items-center gap-2 border-2 border-sniffy-ink bg-sniffy-yellow px-4 py-2 font-display text-xs font-semibold uppercase tracking-[0.14em] text-sniffy-ink shadow-ink-tab-sm"
        >
          Sign to unlock the Trail
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-2 border-sniffy-warn bg-sniffy-paper p-6 text-sm text-sniffy-ink">
        {error}
      </div>
    );
  }

  if (!report) {
    return (
      <div className="border-2 border-sniffy-ink bg-sniffy-paper-2 p-6 text-center font-mono text-sm text-sniffy-ink-mute">
        Replaying the trail…
      </div>
    );
  }

  return <Report report={report} showReveal={false} />;
}
