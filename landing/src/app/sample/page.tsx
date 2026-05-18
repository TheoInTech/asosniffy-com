"use client";

import Link from "next/link";
import { Report } from "@/components/Report";
import { Shell } from "@/components/Shell";
import { useSample } from "@/lib/api/hooks";

export default function SamplePage() {
  const sample = useSample(true);

  return (
    <Shell>
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-12">
        <header className="mb-6">
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-sniffy-warn">
            Sample sniff trail
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-sniffy-ink md:text-3xl">
            A fully populated report — no wallet, no charge.
          </h1>
          <p className="mt-2 max-w-prose font-mono text-sm text-sniffy-ink-2">
            This response comes from{" "}
            <code className="border border-sniffy-rule bg-sniffy-paper-2 px-1 font-mono text-xs">
              GET /api/v1/aso/sample
            </code>{" "}
            on the live scraper — the endpoint guaranteed to work even when
            every upstream provider is down. Use it to preview the shape of a
            paid trail without spending anything.{" "}
            <Link
              href="/"
              className="text-sniffy-ink underline decoration-sniffy-ink underline-offset-2 hover:text-sniffy-warn"
            >
              ← Run your own sniff
            </Link>
          </p>
        </header>

        {sample.isPending ? (
          <p className="font-mono text-sm text-sniffy-ink-mute">
            Loading sample trail…
          </p>
        ) : null}

        {sample.error ? (
          <div
            role="alert"
            className="border-2 border-sniffy-warn bg-sniffy-paper-2 p-4 font-mono text-sm text-sniffy-ink"
          >
            <p className="font-display font-semibold uppercase tracking-[0.14em] text-sniffy-warn">
              Couldn't reach the sample endpoint.
            </p>
            <p className="mt-1">{sample.error.message}</p>
            <p className="mt-2 text-xs text-sniffy-ink-mute">
              The scraper has a fixture fallback — usually this means the URL
              in NEXT_PUBLIC_SCRAPER_BASE_URL is wrong or the server isn't
              running.
            </p>
          </div>
        ) : null}

        {sample.data ? <Report report={sample.data} showReveal /> : null}
      </div>
    </Shell>
  );
}
