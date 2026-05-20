import type { Metadata } from "next";
import { Inconsolata, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
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

export const metadata: Metadata = {
  title: "Sniffy — agent-buyable ASO intelligence",
  description:
    "Run a free sniff test on any iOS app, then pay per request over x402 on Morph for a full ASO trail.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: "/apple-touch-icon.png",
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
      </body>
    </html>
  );
}
