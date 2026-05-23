import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = {
  title: "Terms — Sniffy",
  description:
    "Plain-language terms for using Sniffy and its x402-paywalled ASO API on Morph.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <Shell>
      <section className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-10">
        <header className="mb-6">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-sniffy-warn">
            policy · plain language
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-sniffy-ink md:text-3xl">
            Terms
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-sniffy-ink-mute">
            Sniffy is a hackathon project for the Morph x402 Agentic Payments
            track. These terms describe what we offer, what we don&apos;t
            promise, and what you agree to by using the site or the paid API.
          </p>
        </header>

        <div className="space-y-8">
          <section>
            <h2 className="font-display text-lg font-semibold text-sniffy-ink">
              What Sniffy is
            </h2>
            <p className="mt-2 text-sm text-sniffy-ink-mute">
              Sniffy is an App Store Optimization (ASO) intelligence API
              accessible to humans through the gosniffy.vercel.app demo UI and
              to AI agents through the published{" "}
              <span className="font-mono">@gosniffy/sdk</span>,{" "}
              <span className="font-mono">@gosniffy/cli</span>, and{" "}
              <span className="font-mono">@gosniffy/mcp</span> packages. The
              entire codebase is{" "}
              <Link
                href="https://github.com/TheoInTech/asosniffy-com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono underline decoration-sniffy-ink underline-offset-2 hover:text-sniffy-warn"
              >
                MIT-licensed on GitHub
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-sniffy-ink">
              Using the API
            </h2>
            <p className="mt-2 text-sm text-sniffy-ink-mute">
              The hosted API is rate-limited per IP and per request signature.
              Clients (human or agent) should respect HTTP{" "}
              <span className="font-mono">429 Too Many Requests</span>{" "}
              responses and the accompanying{" "}
              <span className="font-mono">Retry-After</span> header. The free{" "}
              <span className="font-mono">/api/v1/aso/sample</span> endpoint
              is for evaluation; sustained automated scraping of the sample
              fixture is abuse and may be blocked.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-sniffy-ink">
              Payments are non-refundable
            </h2>
            <p className="mt-2 text-sm text-sniffy-ink-mute">
              Paid diagnose calls settle on Morph Mainnet via the official
              Morph x402 facilitator. Once a payment is settled on-chain, the
              transfer is final and Sniffy cannot reverse it. We recommend
              the{" "}
              <Link
                href="/sample"
                className="font-mono underline decoration-sniffy-ink underline-offset-2 hover:text-sniffy-warn"
              >
                free sample report
              </Link>{" "}
              and a free{" "}
              <span className="font-mono">/api/v1/aso/quote</span> call (which
              includes a shallow scan teaser) before any paid request so you
              know what you&apos;re paying for. Use a dedicated agent EOA, not
              your personal hot wallet.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-sniffy-ink">
              No warranty
            </h2>
            <p className="mt-2 text-sm text-sniffy-ink-mute">
              Sniffy outputs are best-effort and carry per-field provenance
              tags (<span className="font-mono">live</span>,{" "}
              <span className="font-mono">cached</span>,{" "}
              <span className="font-mono">fixture</span>,{" "}
              <span className="font-mono">inferred</span>). When live App
              Store data is unavailable, the report may fall back to fixtures
              or inferred values &mdash; the response makes this explicit, and
              you should treat those fields accordingly. App Store rankings
              and metadata are signals, not guarantees: verify before acting
              on a recommendation, especially before shipping a metadata
              change to App Store Connect or Google Play Console.
            </p>
            <p className="mt-2 text-sm text-sniffy-ink-mute">
              The service is provided &quot;as is,&quot; without warranty of
              any kind, express or implied.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-sniffy-ink">
              Acceptable use
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-sniffy-ink-mute">
              <li>
                Don&apos;t resell raw Sniffy API responses without attribution
                back to gosniffy.vercel.app or the upstream repository.
              </li>
              <li>
                Don&apos;t use Sniffy to harass or harm App Store developers
                &mdash; the data is for optimizing your own apps, not for
                doxxing or pressuring others.
              </li>
              <li>
                Don&apos;t attempt to circumvent rate limits, the
                paywall&apos;s x402 signature requirement, or the per-IP
                cost-circuit. The whole point of x402 is honest payment;
                bypassing it is abuse.
              </li>
              <li>
                Don&apos;t scrape Apple, Google, or any upstream provider
                through Sniffy at a rate they would consider abusive &mdash;
                Sniffy passes those rate constraints through to you.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-lg font-semibold text-sniffy-ink">
              Changes &amp; contact
            </h2>
            <p className="mt-2 text-sm text-sniffy-ink-mute">
              These terms may change as the project evolves. Material changes
              will be flagged in the GitHub repository&apos;s release notes.
              Questions, corrections, or disputes &mdash; open an issue on{" "}
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
            href="https://github.com/TheoInTech/asosniffy-com/blob/main/landing/src/app/terms/page.tsx"
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
