import type { DiagnosePaidResponse } from "@sniffy/scraper/schemas";
import { ProvenanceIcon } from "@/components/ProvenanceIcon";
import { cn } from "@/lib/cn";

const IMPACT_TINT: Record<"high" | "medium" | "low", string> = {
  high: "bg-sniffy-teal",
  medium: "bg-sniffy-yellow",
  low: "bg-sniffy-paper-2",
};

const EFFORT_LABEL: Record<"high" | "medium" | "low", string> = {
  high: "heavy lift",
  medium: "fair lift",
  low: "quick win",
};

export function Recommendations({ report }: { report: DiagnosePaidResponse }) {
  return (
    <section className="border-2 border-sniffy-ink bg-sniffy-paper p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
          Best next sniffs
        </h3>
        <ProvenanceIcon value={report.dataProvenance.recommendations} showLabel />
      </div>
      <ol className="mt-3 space-y-3">
        {report.recommendations.map((r) => (
          <li
            key={r.rank}
            className="border border-sniffy-ink bg-sniffy-paper-2 p-3"
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="border-2 border-sniffy-ink bg-sniffy-paper px-1.5 font-mono text-xs">
                #{r.rank}
              </span>
              <p className="font-display font-semibold text-sniffy-ink">
                {r.action}
              </p>
              <span
                className={cn(
                  "border-2 border-sniffy-ink px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em]",
                  IMPACT_TINT[r.impact],
                )}
              >
                {r.impact} impact
              </span>
              <span className="border border-sniffy-rule px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-sniffy-ink-mute">
                {EFFORT_LABEL[r.effort]}
              </span>
            </div>
            <p className="mt-2 font-mono text-xs text-sniffy-ink-2">
              {r.rationale}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
