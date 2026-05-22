import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { getInsightsReport } from "@/lib/api/client";

// Sprint C — public showcase detail page. Server-rendered at request time;
// each (store, country, appId) tuple becomes its own indexable URL the
// moment a paying diagnose lands. No interactive JS — the page is just
// data + citations for SEO crawlers and link-clickers.

interface Params {
  store: string;
  country: string;
  appId: string;
}

interface PageProps {
  params: Promise<Params>;
}

// Cache the per-page fetch for 5 minutes between rebuilds — matches the
// scraper's Cache-Control on the same endpoint and keeps the page snappy
// without serving truly stale data.
export const revalidate = 300;

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { store, country, appId } = await params;
  const report = await getInsightsReport(store, country, appId).catch(
    () => null,
  );
  if (!report) {
    return {
      title: "Sniff not found · Sniffy",
      robots: { index: false },
    };
  }
  const appName = report.detectedApp.name;
  const score = report.metadataScore?.overall ?? null;
  const scoreLine =
    score !== null ? ` (ASO score ${score}/100)` : "";
  return {
    title: `${appName} · App Store Optimization sniff${scoreLine} · Sniffy`,
    description:
      `Public ASO diagnosis for ${appName} on the ${country} ${store === "ios" ? "App Store" : "Play Store"}: ` +
      `metadata score, keyword diagnosis, competitor trail, and recommendations grounded in Apple/Google primary sources.`,
    alternates: {
      canonical: `/insights/${store}/${country}/${appId}`,
    },
    openGraph: {
      title: `${appName}${scoreLine} · ASO sniff`,
      description: `Public ASO diagnosis for ${appName} (${country}).`,
      type: "article",
    },
  };
}

function StoreLabel({ store }: { store: string }) {
  return store === "ios" ? <>iOS App Store</> : <>Google Play</>;
}

export default async function InsightsDetailPage({ params }: PageProps) {
  const { store, country, appId } = await params;
  const report = await getInsightsReport(store, country, appId).catch(
    () => null,
  );
  if (!report) {
    notFound();
  }

  const score = report.metadataScore?.overall ?? null;
  const recommendations = (report.recommendations ?? []).slice(0, 5);
  const competitorTrail = (report.competitorTrail ?? []).slice(0, 5);
  const suggestedKeywords = (report.suggestedKeywords ?? []).slice(0, 8);

  return (
    <Shell>
      <article className="mx-auto max-w-3xl px-4 py-8 md:px-6 md:py-12">
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-sniffy-warn">
          Public ASO sniff · <StoreLabel store={store} /> · {country}
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-sniffy-ink md:text-4xl">
          {report.detectedApp.name}
        </h1>
        <p className="mt-1 font-mono text-sm text-sniffy-ink-2">
          by {report.detectedApp.developer}
        </p>

        {score !== null ? (
          <div className="mt-5 inline-flex items-baseline gap-2 border-2 border-sniffy-ink bg-sniffy-paper-2 px-4 py-2 shadow-ink-tab-sm">
            <span className="font-display text-3xl font-semibold tabular-nums text-sniffy-ink">
              {score}
            </span>
            <span className="font-mono text-xs text-sniffy-ink-mute">
              / 100 ASO score
            </span>
          </div>
        ) : null}

        <section className="mt-6 border-l-4 border-sniffy-ink pl-4">
          <p className="font-mono text-sm text-sniffy-ink-2">
            {report.summary}
          </p>
        </section>

        {recommendations.length > 0 ? (
          <section className="mt-8">
            <h2 className="font-display text-xl font-semibold text-sniffy-ink">
              Recommendations
            </h2>
            <ol className="mt-3 space-y-3">
              {recommendations.map((rec) => (
                <li
                  key={rec.rank}
                  className="border-2 border-sniffy-ink bg-sniffy-paper p-3 md:p-4"
                >
                  <p className="font-display text-sm font-semibold text-sniffy-ink">
                    {rec.rank}. {rec.action}
                  </p>
                  <p className="mt-1 font-mono text-xs text-sniffy-ink-2">
                    {rec.rationale}
                  </p>
                  {rec.knowledge ? (
                    <p className="mt-2 font-mono text-[11px] text-sniffy-ink-mute">
                      <strong className="font-semibold text-sniffy-ink">
                        Why this matters:
                      </strong>{" "}
                      {rec.knowledge.summary}{" "}
                      <a
                        href={rec.knowledge.sourceUrl}
                        rel="noopener noreferrer external"
                        className="underline decoration-sniffy-ink underline-offset-2 hover:text-sniffy-warn"
                      >
                        {rec.knowledge.sourceName}
                      </a>
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {competitorTrail.length > 0 ? (
          <section className="mt-8">
            <h2 className="font-display text-xl font-semibold text-sniffy-ink">
              Competitor trail
            </h2>
            <ul className="mt-3 space-y-2">
              {competitorTrail.map((c) => (
                <li
                  key={c.appId}
                  className="border border-sniffy-rule bg-sniffy-paper p-3 font-mono text-xs text-sniffy-ink-2"
                >
                  <strong className="font-semibold text-sniffy-ink">
                    {c.name}
                  </strong>
                  {c.overlapKeywords.length > 0 ? (
                    <span className="text-sniffy-ink-mute">
                      {" "}
                      · overlap: {c.overlapKeywords.slice(0, 5).join(", ")}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {suggestedKeywords.length > 0 ? (
          <section className="mt-8">
            <h2 className="font-display text-xl font-semibold text-sniffy-ink">
              Suggested keywords
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {suggestedKeywords.map((k) => (
                <li
                  key={k.keyword}
                  className="border border-sniffy-ink bg-sniffy-paper-2 px-2 py-1 font-mono text-xs text-sniffy-ink"
                >
                  {k.keyword}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="mt-12 border-t-2 border-sniffy-ink pt-5">
          <p className="font-mono text-xs text-sniffy-ink-mute">
            Sniffed {new Date(report.showcasedAt).toLocaleDateString()}. All
            signals derived from public {store === "ios" ? "App Store" : "Play Store"} data and
            Apple Search Ads. Citations link to Apple / Google primary docs.
          </p>
          <p className="mt-3 font-mono text-sm text-sniffy-ink-2">
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
