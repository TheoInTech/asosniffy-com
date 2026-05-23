import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = {
  title: "Privacy — Sniffy",
  description:
    "What Sniffy collects (and doesn't) when you visit gosniffy.vercel.app or pay over x402 on Morph.",
};

export default function PrivacyPage() {
  return (
    <Shell>
      <section className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-10">
        <header className="mb-6">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-sniffy-warn">
            policy · plain language
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-sniffy-ink md:text-3xl">
            Privacy
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-sniffy-ink-mute">
            Sniffy is a hackathon project for the Morph x402 Agentic Payments
            track. This page is short on purpose — we don&apos;t collect much,
            and we&apos;d rather be honest about it than pad a legal document.
          </p>
        </header>

        <div className="space-y-8">
          <section>
            <h2 className="font-display text-lg font-semibold text-sniffy-ink">
              What we collect
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-sniffy-ink-mute">
              <li>
                Anonymous page-view counts (which pages were visited, when, and
                roughly from where) via{" "}
                <Link
                  href="https://vercel.com/docs/analytics"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono underline decoration-sniffy-ink underline-offset-2 hover:text-sniffy-warn"
                >
                  Vercel Web Analytics
                </Link>
                .
              </li>
              <li>
                Cookieless. Vercel Analytics does not set tracking cookies and
                does not build a cross-site profile of you.
              </li>
              <li>
                No personally-identifying data, no IP storage by us, no email,
                no name. We do not run third-party ad pixels.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-sniffy-ink">
              How we treat URLs
            </h2>
            <p className="mt-2 text-sm text-sniffy-ink-mute">
              Sniffy is wallet-aware, and a wallet address in a URL would be
              identifying. Before any page-view event leaves your browser, we
              strip the following query-string keys:{" "}
              <span className="font-mono text-xs">
                address, wallet, account, tx, txHash, signature, signer,
                receipt
              </span>
              . Aggregate dimensions like{" "}
              <span className="font-mono text-xs">appId</span>,{" "}
              <span className="font-mono text-xs">country</span>, and{" "}
              <span className="font-mono text-xs">keyword</span> are kept —
              they tell us which App Store flows people are exploring, not who
              they are.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-sniffy-ink">
              Vercel as data processor
            </h2>
            <p className="mt-2 text-sm text-sniffy-ink-mute">
              Page-view events are processed by Vercel under the terms of the{" "}
              <Link
                href="https://vercel.com/legal/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono underline decoration-sniffy-ink underline-offset-2 hover:text-sniffy-warn"
              >
                Vercel Privacy Policy
              </Link>
              . We see only aggregate counts in the Vercel dashboard.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-sniffy-ink">
              Wallet integration
            </h2>
            <p className="mt-2 text-sm text-sniffy-ink-mute">
              Sniffy connects wallets through Reown AppKit, configured with{" "}
              <span className="font-mono text-xs">
                features.analytics: false
              </span>
              ,{" "}
              <span className="font-mono text-xs">features.email: false</span>,
              and{" "}
              <span className="font-mono text-xs">
                features.socials: false
              </span>{" "}
              — AppKit&apos;s own telemetry, email login, and social auth
              surfaces are all off. Your wallet address only leaves your
              browser when you sign an x402 payment authorization, and it goes
              to the Morph x402 facilitator, not to us.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-sniffy-ink">
              On-chain payments
            </h2>
            <p className="mt-2 text-sm text-sniffy-ink-mute">
              Payments settle on Morph Mainnet via the official facilitator.
              The transaction (your address, the amount, the timestamp) is
              public on the Morph block explorer. That&apos;s how blockchains
              work — we don&apos;t have a way to anonymize it and we
              don&apos;t pretend to. Use a dedicated agent EOA, not your
              personal hot wallet.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-sniffy-ink">
              Contact
            </h2>
            <p className="mt-2 text-sm text-sniffy-ink-mute">
              Questions, corrections, or a request to be forgotten — open an
              issue on{" "}
              <Link
                href="https://github.com/TheoInTech/asosniffy-com/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono underline decoration-sniffy-ink underline-offset-2 hover:text-sniffy-warn"
              >
                GitHub
              </Link>
              . This is a hackathon project; that&apos;s the fastest channel.
            </p>
          </section>
        </div>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t-2 border-sniffy-rule pt-5">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 border-2 border-sniffy-ink bg-sniffy-paper px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink shadow-ink-tab-sm transition-transform hover:-translate-x-[2px] hover:-translate-y-[2px] focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-sniffy-paper motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0"
          >
            ← back home
          </Link>
          <Link
            href="https://github.com/TheoInTech/asosniffy-com/blob/main/landing/src/app/privacy/page.tsx"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs uppercase tracking-[0.18em] text-sniffy-ink-mute underline-offset-2 hover:underline"
          >
            view source →
          </Link>
        </footer>
      </section>
    </Shell>
  );
}
