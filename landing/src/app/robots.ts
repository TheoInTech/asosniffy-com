import type { MetadataRoute } from "next";

// Sprint C — robots.txt. Next.js serves this at /robots.txt. Allows all
// crawlers everywhere except internal Next.js machinery and the trail
// pages (those are per-wallet and shouldn't be indexed). Points at the
// sitemap at /sitemap.xml.

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://sniffy.io"
).replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/sample", "/insights", "/docs"],
        disallow: [
          "/api/",
          "/trail/",
          "/_next/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
