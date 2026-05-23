import type { Metadata } from "next";
import { Inconsolata, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { VercelAnalytics } from "@/components/analytics/VercelAnalytics";
import { Providers } from "@/components/providers/Providers";
import "./globals.css";

const inconsolata = Inconsolata({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inconsolata",
  weight: ["400", "500", "600", "700"],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-space-grotesk",
  weight: ["400", "500", "600", "700"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://gosniffy.vercel.app";
const siteTitle = "Sniffy — agent-buyable ASO intelligence";
const siteDescription =
  "Run a free sniff test on any iOS app, then pay per request over x402 on Morph for a full ASO trail.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: siteTitle,
  description: siteDescription,
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Sniffy",
    title: siteTitle,
    description: siteDescription,
    images: [
      {
        url: "/og-image.png",
        width: 1731,
        height: 909,
        alt: "Sniffy — agent-buyable ASO intelligence on Morph x402",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/og-image.png"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inconsolata.variable} ${spaceGrotesk.variable}`}
    >
      <body className="min-h-screen bg-sniffy-paper text-sniffy-ink antialiased">
        <Providers>{children}</Providers>
        <VercelAnalytics />
      </body>
    </html>
  );
}
