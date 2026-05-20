"use client";

import { useMemo } from "react";
import { useKeywordHistory } from "@/lib/api/hooks";
import type { GetHistoryInput } from "@/lib/api/history";
import { cn } from "@/lib/cn";

// Phase 4 — lazy 30-day rank-history sparkline.
//
// Renders four states:
//   • disabled (no signature)         → muted "history unavailable" copy
//   • loading                          → spinner glyph
//   • error                            → muted error message
//   • cold start (< 2 samples)         → "Need more sniffs" copy
//   • populated                        → SVG polyline of last 30 days
//
// SVG is pure CSS-styled, no chart library — keeps the bundle lean and the
// pixel-detective aesthetic intact. Y-axis is inverted (rank 1 at top, 100
// at bottom) and clamped to [1..200] so a `not_found` point pins to bottom.

interface Props {
  input: GetHistoryInput;
  enabled: boolean;
  className?: string;
}

export function TrendSparkline({ input, enabled, className }: Props) {
  const { data, error, isLoading } = useKeywordHistory(input, enabled);

  if (!input.signature) {
    return (
      <p
        className={cn(
          "font-mono text-[11px] text-sniffy-ink-mute",
          className,
        )}
      >
        History unavailable in this environment.
      </p>
    );
  }

  if (isLoading) {
    return (
      <p
        className={cn(
          "font-mono text-[11px] text-sniffy-ink-mute",
          className,
        )}
      >
        Fetching history…
      </p>
    );
  }

  if (error) {
    return (
      <p
        className={cn(
          "font-mono text-[11px] text-sniffy-warn",
          className,
        )}
      >
        Couldn&apos;t load history: {error.message}
      </p>
    );
  }

  const samples = data?.series ?? [];
  if (samples.length < 2) {
    return (
      <p
        className={cn(
          "font-mono text-[11px] text-sniffy-ink-mute",
          className,
        )}
      >
        Need more sniffs to draw a trend — history populates from your second
        paid diagnose for this (app, country, keyword) tuple.
      </p>
    );
  }

  return <Sparkline points={samples.map((s) => s.position)} className={className} />;
}

// Pure SVG polyline. We size the viewbox 100×40 and let CSS scale it.
function Sparkline({
  points,
  className,
}: {
  points: number[];
  className?: string;
}) {
  const { polyline, dotsX } = useMemo(() => {
    const n = points.length;
    // Clamp positions into a plottable range. 0 (not_found) pins to bottom.
    const clamped = points.map((p) => (p <= 0 ? 200 : Math.min(p, 200)));
    const min = Math.min(...clamped);
    const max = Math.max(...clamped);
    const span = max - min || 1;
    const stepX = n > 1 ? 100 / (n - 1) : 100;
    const coords = clamped.map((p, i) => {
      const x = i * stepX;
      // Invert Y so a smaller position (= better rank) renders at the top.
      const y = ((p - min) / span) * 32 + 4; // padded 4..36 within a 40-tall viewbox
      return { x, y };
    });
    const polyline = coords.map((c) => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(" ");
    const dotsX = coords;
    return { polyline, dotsX };
  }, [points]);

  return (
    <div className={cn("w-full", className)}>
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="h-12 w-full border border-sniffy-rule bg-sniffy-paper-2"
        aria-label="Rank history sparkline"
      >
        <polyline
          points={polyline}
          fill="none"
          stroke="#15110D"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        {dotsX.map((c, i) => (
          <circle
            key={i}
            cx={c.x}
            cy={c.y}
            r="1.5"
            fill="#21C2B6"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <p className="mt-1 font-mono text-[10px] text-sniffy-ink-mute">
        {points.length} samples · oldest left, newest right · lower = better
        rank
      </p>
    </div>
  );
}
