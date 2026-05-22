import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { listInsights } from "@/lib/api/client";

// Sprint C — public showcase index. Server-rendered listing of recent
// showcased apps. Each card links to the detail page, which is itself
// SEO-indexed at /insights/{store}/{country}/{appId}. ISR cache aligned
// with the scraper's Cache-Control (60s) so the index stays fresh as
// new diagnose calls land.

export const revalidate = 60;

const PAGE_TITLE = "Recent ASO sniffs · Sniffy";
const PAGE_DESCRIPTION =
  "Live feed of public App Store Optimization diagnoses on Sniffy. Browse recent app scores, " +
  "competitor trails, and recommendations grounded in Apple and Google primary-source docs.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "/insights" },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    type: "website",
  },
};

function formatStore(store: string): string {
  return store === "ios" ? "iOS" : "Android";
}

function formatRelative(iso: string): string {
  const settled = new Date(iso).getTime();
  if (!Number.isFinite(settled)) return iso;
  const diffMs = Date.now() - settled;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
}

function scoreTint(score: number | null): string {
  if (score === null) return "bg-sniffy-paper-2 text-sniffy-ink-mute";
  if (score >= 75) return "bg-sniffy-teal text-sniffy-ink";
  if (score >= 50) return "bg-sniffy-yellow text-sniffy-ink";
  return "bg-sniffy-paper-2 text-sniffy-ink";
}

export default async function InsightsIndexPage() {
  const data = await listInsights({ limit: 50 }).catch(() => ({
    entries: [],
    freshestAt: null,
    filters: { store: null, country: null, limit: 50 },
  }));

  const entries = data.entries;

  return (
    <Shell>
      <article className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-12">
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-sniffy-warn">
          Public showcase
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-sniffy-ink md:text-4xl">
          Recent ASO sniffs
        </h1>
        <p className="mt-2 max-w-prose font-mono text-sm text-sniffy-ink-2">
          Every paying diagnose lands here automatically (unless the caller
          opted out with{" "}
          <code className="font-mono text-sniffy-ink">X-Sniffy-No-Index</code>).
          Wallet addresses, transaction hashes, and request IDs are stripped
          before the report reaches this page — only public App Store / Play
          Store signals remain.
        </p>
        {data.freshestAt ? (
          <p className="mt-1 font-mono text-xs text-sniffy-ink-mute">
            Freshest entry: {formatRelative(data.freshestAt)}.{" "}
            {entries.length} sniff{entries.length === 1 ? "" : "s"} shown.
          </p>
        ) : null}

        {entries.length === 0 ? (
          <section className="mt-8 border-2 border-sniffy-ink bg-sniffy-paper-2 p-5 md:p-7 shadow-ink-tab">
            <p className="font-display text-lg font-semibold text-sniffy-ink">
              No sniffs in the public showcase yet.
            </p>
            <p className="mt-2 font-mono text-sm text-sniffy-ink-2">
              The showcase fills as paying diagnoses land.{" "}
              <Link
                href="/"
                className="underline decoration-sniffy-ink underline-offset-2 hover:text-sniffy-warn"
              >
                Run the first one →
              </Link>
            </p>
          </section>
        ) : (
          <ul className="mt-8 grid gap-3 md:grid-cols-2">
            {entries.map((entry) => (
              <li key={`${entry.store}-${entry.country}-${entry.appId}`}>
                <Link
                  href={`/insights/${entry.store}/${entry.country}/${entry.appId}`}
                  className="block border-2 border-sniffy-ink bg-sniffy-paper p-4 transition-transform hover:-translate-y-[1px] hover:shadow-ink-tab-sm md:p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-sniffy-ink-mute">
                        {formatStore(entry.store)} · {entry.country}
                      </p>
                      <p className="mt-1 truncate font-display text-lg font-semibold text-sniffy-ink">
                        {entry.appName}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-xs text-sniffy-ink-2">
                        {entry.appDeveloper}
                      </p>
                    </div>
                    <div
                      className={`shrink-0 border-2 border-sniffy-ink px-2 py-1 text-center ${scoreTint(entry.overallScore)}`}
                      aria-label={
                        entry.overallScore !== null
                          ? `ASO score ${entry.overallScore} out of 100`
                          : "ASO score unavailable"
                      }
                    >
                      <span className="block font-display text-xl font-semibold tabular-nums">
                        {entry.overallScore ?? "—"}
                      </span>
                      <span className="block font-mono text-[9px] uppercase tracking-[0.18em] text-sniffy-ink-mute">
                        / 100
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 font-mono text-[10px] text-sniffy-ink-mute">
                    Sniffed {formatRelative(entry.settledAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <footer className="mt-12 border-t-2 border-sniffy-ink pt-5">
          <p className="font-mono text-sm text-sniffy-ink-2">
            <Link
              href="/"
              className="underline decoration-sniffy-ink underline-offset-2 hover:text-sniffy-warn"
            >
              Run a sniff on your own app →
            </Link>
          </p>
        </footer>
      </article>
    </Shell>
  );
}
