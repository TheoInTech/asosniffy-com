import type { Metadata } from "next";
import { Shell } from "@/components/Shell";
import { TrailGate } from "@/components/Trail";

export const metadata: Metadata = {
  title: "The Trail — Sniffy",
  description: "Every paid sniff your wallet has run. SIWE-authed; no extra spend.",
};

export default function TrailPage() {
  return (
    <Shell>
      <section className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-10">
        <header className="mb-4">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-sniffy-ink-mute">
            wallet history
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-sniffy-ink md:text-3xl">
            The Trail
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-sniffy-ink-mute">
            Every paid sniff your wallet has run. Sign in to view past
            reports — no extra spend, no fresh diagnose.
          </p>
        </header>
        <TrailGate />
      </section>
    </Shell>
  );
}
