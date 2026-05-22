import Image from "next/image";
import Link from "next/link";
import { getActiveMorphNetwork } from "@/lib/morph-urls";

const ACTIVE = getActiveMorphNetwork();

export function Hero() {
  return (
    <section className="grid items-start gap-6 md:grid-cols-[1fr_auto]">
      <div>
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-sniffy-warn">
          Pay-per-sniff app store optimization
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-sniffy-ink md:text-4xl">
          No subscription. No seats. No card on file.
        </h1>
        <p className="mt-3 max-w-prose font-mono text-sm text-sniffy-ink-2">
          Drop in an app, pick a country, list the keywords you care about.
          Run a <strong className="font-semibold text-sniffy-ink">free sniff test</strong>{" "}
          with no wallet, then pay{" "}
          <strong className="font-semibold text-sniffy-ink">$0.07–$0.50</strong>{" "}
          in USDC on{" "}
          <strong className="font-semibold text-sniffy-ink">{ACTIVE.name}</strong>{" "}
          over x402 for the full keyword diagnosis, competitor trail, metadata
          score, and ready-to-paste copy.
        </p>
        <p className="mt-3 max-w-prose font-mono text-xs text-sniffy-ink-mute">
          Four audits a year? You'd pay under a dollar. Typical ASO subscriptions
          run $59–$199 a month. Every Sniffy field is labelled{" "}
          <span className="font-semibold text-sniffy-ink">live · cached · fixture · inferred</span>{" "}
          — you always know how fresh the trail is.{" "}
          <Link
            href="/sample"
            className="text-sniffy-ink underline decoration-sniffy-ink underline-offset-2 hover:text-sniffy-warn"
          >
            See a sample report →
          </Link>
        </p>
      </div>
      <Image
        src="/sniffy/idle.png"
        alt="Sniffy, a pixel-art detective dog with a magnifying glass"
        width={160}
        height={160}
        priority
        className="hidden md:block"
      />
    </section>
  );
}
