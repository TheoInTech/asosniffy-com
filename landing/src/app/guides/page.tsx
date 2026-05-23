import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { GUIDES } from "@/data/guides";

export const metadata: Metadata = {
  title: "ASO Guides · Sniffy",
  description:
    "Long-form guides on App Store Optimization grounded in Sniffy's report methodology — subtitle strategy, competitor overlap, metadata scoring, and rank buckets.",
  alternates: { canonical: "/guides" },
  openGraph: {
    type: "website",
    url: "/guides",
    siteName: "Sniffy",
    title: "ASO Guides · Sniffy",
    description:
      "Long-form guides on App Store Optimization grounded in Sniffy's report methodology.",
    images: ["/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "ASO Guides · Sniffy",
    description:
      "Long-form guides on App Store Optimization grounded in Sniffy's report methodology.",
    images: ["/og-image.png"],
  },
};

export default function GuidesIndexPage() {
  return (
    <Shell>
      <section className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-10">
        <header className="mb-8">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-sniffy-warn">
            library · long-form
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-sniffy-ink md:text-3xl">
            ASO guides
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-sniffy-ink-mute">
            Plain-language guides to App Store Optimization, grounded in the
            same methodology Sniffy uses to score apps. Read one, then{" "}
            <Link
              href="/sample"
              className="font-mono underline decoration-sniffy-ink underline-offset-2 hover:text-sniffy-warn"
            >
              see a sample sniff
            </Link>{" "}
            to watch it applied to a real app.
          </p>
        </header>

        <ul className="space-y-4">
          {GUIDES.map((guide) => (
            <li key={guide.slug}>
              <Link
                href={`/guides/${guide.slug}`}
                className="group block border-2 border-sniffy-ink bg-sniffy-paper p-4 shadow-ink-tab-sm transition-transform hover:-translate-x-[2px] hover:-translate-y-[2px] focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-sniffy-paper motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0 md:p-5"
              >
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-sniffy-warn">
                  {guide.eyebrow} · {guide.readingMinutes} min read
                </p>
                <h2 className="mt-1 font-display text-lg font-bold text-sniffy-ink group-hover:text-sniffy-warn md:text-xl">
                  {guide.title}
                </h2>
                <p className="mt-2 text-sm text-sniffy-ink-mute">
                  {guide.description}
                </p>
              </Link>
            </li>
          ))}
        </ul>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t-2 border-sniffy-rule pt-5">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 border-2 border-sniffy-ink bg-sniffy-paper px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink shadow-ink-tab-sm transition-transform hover:-translate-x-[2px] hover:-translate-y-[2px] focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-sniffy-paper motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0"
          >
            ← back home
          </Link>
          <Link
            href="/sample"
            className="font-mono text-xs uppercase tracking-[0.18em] text-sniffy-ink-mute underline-offset-2 hover:underline"
          >
            see sample report →
          </Link>
        </footer>
      </section>
    </Shell>
  );
}
