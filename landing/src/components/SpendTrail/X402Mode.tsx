import type { FacilitatorMode } from "@sniffy/scraper/schemas";
import { cn } from "@/lib/cn";

interface Props {
  mode: FacilitatorMode;
  isFixtureHash?: boolean;
  className?: string;
}

interface Variant {
  label: string;
  tint: string;
  tooltip: string;
}

const VARIANTS: Record<FacilitatorMode, Variant> = {
  "morph-official": {
    label: "Settled via Morph facilitator",
    tint: "bg-sniffy-teal text-sniffy-ink",
    tooltip:
      "Settled through the official Morph x402 facilitator at morph-rails.morph.network.",
  },
  "fixture-receipt": {
    label: "Demo settlement — on-chain pending",
    tint: "bg-sniffy-yellow text-sniffy-ink",
    tooltip:
      "Your wallet signed a real EIP-3009 authorization, but the Morph facilitator did not settle on-chain (network not in /v2/supported, or facilitator down). The scraper returned a fixture receipt so the demo flow stays end-to-end. See PLAN.md §21.",
  },
  "self-hosted-fallback": {
    label: "Settled via fallback facilitator",
    tint: "bg-sniffy-paper-2 text-sniffy-ink",
    tooltip:
      "Primary Morph facilitator was unavailable; the request settled via the configured self-hosted fallback.",
  },
};

export function X402Mode({ mode, isFixtureHash, className }: Props) {
  // Even if the scraper labels the receipt morph-official, a 0xsample… tx hash
  // means we got a stub back — surface the demo state to the judge.
  const effective: FacilitatorMode =
    isFixtureHash && mode !== "fixture-receipt" ? "fixture-receipt" : mode;
  const variant = VARIANTS[effective];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border-2 border-sniffy-ink px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em]",
        variant.tint,
        className,
      )}
      title={variant.tooltip}
    >
      <span aria-hidden className="inline-block h-1.5 w-1.5 bg-sniffy-ink" />
      {variant.label}
    </span>
  );
}
