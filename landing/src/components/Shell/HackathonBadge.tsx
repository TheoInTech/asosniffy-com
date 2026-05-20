import { getActiveMorphNetwork } from "@/lib/morph-urls";
import { cn } from "@/lib/cn";

const ACTIVE = getActiveMorphNetwork();
const LABEL = ACTIVE.testnet ? `${ACTIVE.name} testnet` : ACTIVE.name;

export function HackathonBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-none border-ink border-2 border-sniffy-ink bg-sniffy-yellow px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink shadow-ink-tab-sm",
        className,
      )}
      aria-label={`Hackathon edition: ${LABEL}`}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 bg-sniffy-warn animate-pixel-pulse motion-reduce:animate-none"
      />
      {LABEL}
    </span>
  );
}
