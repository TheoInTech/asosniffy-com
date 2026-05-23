import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { TrackedCTALink } from "@/components/analytics/TrackedCTALink";
import { GUIDES, getAllGuideSlugs, getGuide } from "@/data/guides";

type RouteParams = { slug: string };

export async function generateStaticParams(): Promise<RouteParams[]> {
  return getAllGuideSlugs().map((slug) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) {
    return { title: "Guide not found · Sniffy", robots: { index: false } };
  }

  const canonical = `/guides/${slug}`;

  return {
    title: `${guide.title} · Sniffy`,
    description: guide.description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      url: canonical,
      siteName: "Sniffy",
      title: guide.title,
      description: guide.description,
      images: ["/og-image.png"],
    },
    twitter: {
      card: "summary_large_image",
      title: guide.title,
      description: guide.description,
      images: ["/og-image.png"],
    },
  };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const related = GUIDES.filter((g) => g.slug !== slug).slice(0, 2);
  const GuideContent = guide.Component;

  return (
    <Shell>
      <article className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-10">
        <header className="mb-6">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-sniffy-warn">
            guide · {guide.eyebrow} · {guide.readingMinutes} min read
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-sniffy-ink md:text-3xl">
            {guide.title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-sniffy-ink-mute">
            {guide.description}
          </p>
        </header>

        <GuideContent />

        <div className="mt-10 flex flex-wrap items-center gap-3 border-t-2 border-sniffy-rule pt-5">
          <TrackedCTALink
            href="/sample"
            eventName="guide_cta_click"
            eventProps={{ slug, cta: "see-sample" }}
            className="inline-flex items-center gap-1.5 border-2 border-sniffy-ink bg-sniffy-yellow px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink shadow-ink-tab-sm transition-transform hover:-translate-x-[2px] hover:-translate-y-[2px] focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-sniffy-paper motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0"
          >
            See a sample sniff →
          </TrackedCTALink>
          <TrackedCTALink
            href="/"
            eventName="guide_cta_click"
            eventProps={{ slug, cta: "home" }}
            className="font-mono text-xs uppercase tracking-[0.18em] text-sniffy-ink-mute underline-offset-2 hover:underline"
          >
            ← back home
          </TrackedCTALink>
        </div>

        {related.length > 0 ? (
          <nav className="mt-8" aria-label="Related guides">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-sniffy-ink-mute">
              keep reading
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`/guides/${r.slug}`}
                    className="font-mono underline decoration-sniffy-ink underline-offset-2 hover:text-sniffy-warn"
                  >
                    {r.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </article>
    </Shell>
  );
}
