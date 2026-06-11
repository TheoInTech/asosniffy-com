import type { DiagnosePaidResponse } from "@sniffy/scraper/schemas";
import { EyeOff } from "lucide-react";
import { ProvenanceIcon } from "@/components/ProvenanceIcon";
import { cn } from "@/lib/cn";

// Wave 2.1 (roadmap) — LLM share-of-voice probe ("v5-10" prompt set).
// Honesty rules baked into this component:
//   • targetSov NEVER renders without its ±pp band — the band is a pilot
//     calibration (v5-pilot-2026-06), not a per-run confidence interval,
//     and the tooltip says so.
//   • SOV measures one model family's tools-off recommendation recall —
//     it is NOT store rank, and the sub-copy says what was measured.
//   • deterministicMisses (intents where the app was never named across
//     all replicates) is the actionable signal, so it gets the visual
//     weight; the full prompt table is collapsed secondary detail.
// Renders nothing when aiVisibility is null (flag off, quick tier, no key,
// or a degraded probe run — partial SOV never ships).

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function AiVisibilityCard({
  report,
}: {
  report: DiagnosePaidResponse;
}) {
  const av = report.aiVisibility;
  if (av === null) return null;

  const ranked = [...av.shareOfVoice].sort(
    (a, b) => b.mentionRate - a.mentionRate,
  );
  const maxRate = ranked[0]?.mentionRate ?? 0;

  return (
    <section className="border-2 border-sniffy-ink bg-sniffy-paper p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
          AI assistant visibility
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-sniffy-ink-mute">
          share of voice · prompt set {av.promptSetVersion}
        </span>
      </div>

      {/* Headline SOV + band — one group, never separated. */}
      <div
        className="mt-3 flex items-baseline gap-2"
        title="Band is a v5 pilot calibration (v5-pilot-2026-06), not a per-run confidence interval."
      >
        <span className="font-display text-3xl font-semibold tabular-nums text-sniffy-ink">
          {pct(av.targetSov)}
        </span>
        <span className="font-mono text-sm tabular-nums text-sniffy-ink-mute">
          ±{av.sovBand.plusMinusPp}pp
        </span>
      </div>
      <p className="mt-1 font-mono text-xs text-sniffy-ink-2">
        How often this app was named when {av.modelsUsed.join(", ")} answered{" "}
        {av.promptTable.length} recommendation intents (tools off). This is one
        model family&apos;s recall — not store rank.
      </p>

      <ul className="mt-3 space-y-1.5">
        {ranked.map((entry) => (
          <li
            key={entry.name}
            className="flex items-center gap-2 font-mono text-xs"
          >
            <span
              className={cn(
                "w-36 shrink-0 truncate",
                entry.isTarget
                  ? "font-semibold text-sniffy-ink"
                  : "text-sniffy-ink-2",
              )}
              title={entry.name}
            >
              {entry.name}
            </span>
            <span className="relative h-2.5 flex-1 border border-sniffy-ink bg-sniffy-paper-2">
              <span
                className={cn(
                  "absolute inset-y-0 left-0",
                  entry.isTarget ? "bg-sniffy-teal" : "bg-sniffy-rule",
                )}
                style={{
                  width: `${maxRate > 0 ? (entry.mentionRate / maxRate) * 100 : 0}%`,
                }}
                aria-hidden
              />
            </span>
            <span className="w-10 shrink-0 text-right tabular-nums text-sniffy-ink">
              {pct(entry.mentionRate)}
            </span>
            {entry.isTarget ? (
              <span className="inline-flex items-center border border-sniffy-ink bg-sniffy-yellow px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-sniffy-ink">
                target
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {av.deterministicMisses.length > 0 ? (
        <div className="mt-3 border-2 border-sniffy-warn bg-sniffy-paper-2 p-3">
          <p className="inline-flex items-center gap-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-warn">
            <EyeOff size={12} aria-hidden />
            Never named for:
          </p>
          <ul className="mt-1.5 space-y-1 font-mono text-xs">
            {av.deterministicMisses.map((miss) => (
              <li key={miss.templateIdx} title={miss.prompt}>
                <span className="font-semibold text-sniffy-ink">
                  {miss.intent}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 font-mono text-[10px] text-sniffy-ink-mute">
            0 mentions across every replicate of these intents — the most
            actionable gaps in this probe.
          </p>
        </div>
      ) : null}

      <details className="mt-3">
        <summary className="cursor-pointer font-mono text-[11px] text-sniffy-ink-mute hover:text-sniffy-ink">
          Show per-prompt results ({av.promptTable.length})
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className="border-b-2 border-sniffy-ink text-left uppercase tracking-[0.14em] text-sniffy-ink-mute">
                <th className="py-1.5 pr-3">#</th>
                <th className="py-1.5 pr-3">Intent</th>
                <th className="py-1.5 pr-3">Prompt</th>
                <th className="py-1.5">Mentioned</th>
              </tr>
            </thead>
            <tbody>
              {av.promptTable.map((row) => (
                <tr
                  key={row.templateIdx}
                  className="border-b border-sniffy-rule align-top"
                >
                  <td className="py-1.5 pr-3 tabular-nums text-sniffy-ink-mute">
                    {row.templateIdx}
                  </td>
                  <td className="py-1.5 pr-3 text-sniffy-ink">{row.intent}</td>
                  <td className="py-1.5 pr-3 text-sniffy-ink-mute">
                    {row.prompt}
                  </td>
                  <td className="py-1.5 tabular-nums text-sniffy-ink">
                    {pct(row.mentionRate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-sniffy-rule pt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-sniffy-ink-mute">
        <span>models: {av.modelsUsed.join(", ")}</span>
        <span aria-hidden>·</span>
        <span>
          {av.totalCalls} calls
          {av.failedCalls > 0 ? ` (${av.failedCalls} failed)` : ""}
        </span>
        <span aria-hidden>·</span>
        <ProvenanceIcon value={av.provenance} showLabel />
      </p>
    </section>
  );
}
