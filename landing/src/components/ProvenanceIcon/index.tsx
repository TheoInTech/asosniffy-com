import Image from "next/image";
import type { Provenance } from "@sniffy/scraper/schemas";
import { cn } from "@/lib/cn";

const LABELS: Record<Provenance, string> = {
  live: "Live — fetched in real time from the store",
  cached: "Cached — recent live data, served from cache",
  degraded:
    "Degraded — provider returned an error; row is intentionally empty (never fabricated)",
  fixture: "Fixture — fallback when live providers are down",
  inferred: "Inferred — model-derived (no direct ground truth)",
};

const SHORT: Record<Provenance, string> = {
  live: "live",
  cached: "cached",
  degraded: "degraded",
  fixture: "fixture",
  inferred: "inferred",
};

interface Props {
  value: Provenance;
  className?: string;
  size?: number;
  showLabel?: boolean;
}

export function ProvenanceIcon({
  value,
  className,
  size = 12,
  showLabel = false,
}: Props) {
  const title = LABELS[value];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 align-middle", className)}
      title={title}
    >
      <Image
        src={`/icons/provenance/${value}.svg`}
        alt=""
        width={size}
        height={size}
        aria-hidden="true"
        unoptimized
      />
      <span className="sr-only">{title}</span>
      {showLabel ? (
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-sniffy-ink-mute">
          {SHORT[value]}
        </span>
      ) : null}
    </span>
  );
}
