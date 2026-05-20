import type { Trend } from "@sniffy/scraper/schemas";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";

// Phase 4 — compact trend badge. Renders the keyword's rank movement vs the
// historical baseline:
//   trend = null            → "—" (cold start: first paid diagnose, no history)
//   deltaPositions = null   → samplesCount badge only (current is not_found)
//   deltaPositions < 0      → ↑ improved (rank position decreased)
//   deltaPositions > 0      → ↓ regressed (rank position increased)
//   deltaPositions = 0      → flat
//
// Sign convention matches scoring/trend.ts: positive deltaPositions = worse rank.

interface Props {
  trend: Trend | null;
  className?: string;
}

export function TrendBadge({ trend, className }: Props) {
  if (trend === null) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 font-mono text-[11px] text-sniffy-ink-mute",
          className,
        )}
        title="Need more sniffs to detect a trend — history populates from the second paid diagnose onward."
      >
        <Minus size={10} aria-hidden />
        <span className="sr-only">No trend yet — cold start</span>
      </span>
    );
  }

  const { window, deltaPositions, previousBucket, samplesCount } = trend;

  if (deltaPositions === null) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 font-mono text-[11px] text-sniffy-ink-mute",
          className,
        )}
        title={`Last ${samplesCount} sample${samplesCount === 1 ? "" : "s"} · previous bucket ${previousBucket ?? "—"} · current is not_found`}
      >
        <Minus size={10} aria-hidden />
        <span>off chart</span>
      </span>
    );
  }

  const improved = deltaPositions < 0; // position decreased = better rank
  const flat = deltaPositions === 0;
  const Icon = flat ? Minus : improved ? TrendingUp : TrendingDown;
  const tint = flat
    ? "text-sniffy-ink-mute"
    : improved
      ? "text-sniffy-teal"
      : "text-sniffy-warn";
  const sign = improved ? "" : deltaPositions > 0 ? "+" : "";
  const titleParts = [
    `${window} window`,
    `Δ ${sign}${deltaPositions} positions`,
    previousBucket ? `was ${previousBucket}` : null,
    `${samplesCount} samples`,
  ].filter(Boolean);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-mono text-[11px] tabular-nums",
        tint,
        className,
      )}
      title={titleParts.join(" · ")}
    >
      <Icon size={12} aria-hidden />
      {!flat ? (
        <span>
          {sign}
          {Math.abs(deltaPositions)}
        </span>
      ) : (
        <span>flat</span>
      )}
      <span className="text-[9px] uppercase tracking-[0.12em] text-sniffy-ink-mute">
        {window}
      </span>
    </span>
  );
}
