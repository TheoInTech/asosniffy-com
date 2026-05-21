"use client";

import type { DiagnosePaidResponse } from "@sniffy/scraper/schemas";

// Compact target-app momentum block. Renders nothing when the orchestrator
// returned `targetAppSignals: null` (region-locked listing without a
// releaseDate, or Android-only detection where we don't have the dates).
export function TargetAppSignals({ report }: { report: DiagnosePaidResponse }) {
  const signals = report.targetAppSignals;
  if (!signals || signals.ratingsPerDay === null) return null;

  const labelTint =
    signals.momentumLabel === "growing"
      ? "bg-sniffy-teal text-sniffy-ink"
      : signals.momentumLabel === "declining"
        ? "bg-sniffy-warn text-sniffy-paper"
        : "bg-sniffy-paper-2 text-sniffy-ink";

  return (
    <section className="border-2 border-sniffy-ink bg-sniffy-paper p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
          App momentum
        </h3>
        <span
          className={`inline-flex items-center border-2 border-sniffy-ink px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.14em] ${labelTint}`}
        >
          {signals.momentumLabel ?? "unknown"}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-3 font-mono text-xs">
        <div>
          <dt className="text-[10px] uppercase tracking-[0.14em] text-sniffy-ink-mute">
            Ratings / day
          </dt>
          <dd className="font-display text-base font-semibold text-sniffy-ink">
            {signals.ratingsPerDay.toFixed(2)}
          </dd>
        </div>
        {signals.daysSinceFirstRelease !== null ? (
          <div>
            <dt className="text-[10px] uppercase tracking-[0.14em] text-sniffy-ink-mute">
              Days live
            </dt>
            <dd className="font-display text-base font-semibold text-sniffy-ink">
              {signals.daysSinceFirstRelease}
            </dd>
          </div>
        ) : null}
        {signals.daysSinceLastRelease !== null ? (
          <div>
            <dt className="text-[10px] uppercase tracking-[0.14em] text-sniffy-ink-mute">
              Since last update
            </dt>
            <dd className="font-display text-base font-semibold text-sniffy-ink">
              {signals.daysSinceLastRelease}d
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
