import type { MetadataRoute } from "next";
import { listInsights } from "@/lib/api/client";

// Sprint C — auto-generated sitemap. Next.js serves this at /sitemap.xml.
// Three blocks of URLs:
//
//   1. Static pages — home, /sample, /insights index. Always present.
//   2. Showcase detail pages — one entry per recent showcased app, with
//      lastModified = settledAt. Fetched at build/revalidate time from the
//      scraper's /api/v1/aso/insights endpoint.
//
// The scraper page itself is short-cached (60s CDN); the sitemap pulls
// snapshots that match. A crawler that follows up on a stale sitemap entry
// will see the latest showcase content via the page's own ISR layer.

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://sniffy.io"
).replace(/\/$/, "");

// Cap the sitemap at the scraper's per-call max so a single request can
// render the full index. If we ever exceed this we'll need to fan across
// multiple sitemaps via sitemap-index.xml (Next.js supports this natively).
const SHOWCASE_LIMIT = 200;

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/sample`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/insights`,
      changeFrequency: "hourly",
      priority: 0.9,
    },
  ];

  // Showcase entries. A scraper outage or empty index just returns the
  // static block — better to serve a smaller sitemap than to 5xx the
  // crawler.
  const showcase = await listInsights({ limit: SHOWCASE_LIMIT }).catch(
    () => null,
  );
  const dynamicEntries: MetadataRoute.Sitemap =
    showcase?.entries.map((entry) => ({
      url: `${SITE_URL}/insights/${entry.store}/${entry.country}/${entry.appId}`,
      lastModified: new Date(entry.settledAt),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })) ?? [];

  return [...staticEntries, ...dynamicEntries];
}
