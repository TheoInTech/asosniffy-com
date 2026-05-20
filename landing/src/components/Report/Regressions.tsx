import type { DiagnosePaidResponse } from "@sniffy/scraper/schemas";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { BUCKET_TINT } from "./KeywordDiagnosisTable";

// Phase 4 — rank-regression alerts.
//
// `report.regressions[]` lists keywords whose current rank dropped ≥10
// positions vs the 7-day rolling median (with a 3-sample floor — first-time
// users won't see any). When present, we render this BEFORE the Summary so
// the regression is the first thing the founder sees.
//
// Returns null when there are no regressions so the Report layout stays
// flat for cold-start users.

export function Regressions({ report }: { report: DiagnosePaidResponse }) {
  if (report.regressions.length === 0) return null;
  return (
    <section className="border-2 border-sniffy-warn bg-sniffy-paper p-5">
      <div className="flex items-center gap-2">
        <AlertTriangle
          size={16}
          aria-hidden
          className="shrink-0 text-sniffy-warn"
        />
        <h3 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-sniffy-warn">
          {report.regressions.length} keyword
          {report.regressions.length === 1 ? "" : "s"} regressed since last sniff
        </h3>
      </div>
      <p className="mt-2 font-mono text-xs text-sniffy-ink-2">
        Rank dropped ≥10 positions vs the 7-day rolling median. Largest drop
        first.
      </p>
      <ul className="mt-3 space-y-2">
        {report.regressions.map((r) => (
          <li
            key={r.keyword}
            className="border border-sniffy-ink bg-sniffy-paper-2 p-3 font-mono text-xs"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-sm font-semibold text-sniffy-ink">
                {r.keyword}
              </span>
              <span
                className={`inline-flex items-center border-2 border-sniffy-ink px-1.5 py-0.5 ${BUCKET_TINT[r.previousBucket]}`}
                title="Previous bucket"
              >
                {r.previousBucket}
              </span>
              <ArrowRight size={12} aria-hidden className="text-sniffy-ink-mute" />
              <span
                className={`inline-flex items-center border-2 border-sniffy-ink px-1.5 py-0.5 ${BUCKET_TINT[r.currentBucket]}`}
                title="Current bucket"
              >
                {r.currentBucket}
              </span>
              <span className="ml-auto inline-flex items-center gap-1 tabular-nums text-sniffy-warn">
                +{r.deltaPositions} positions
              </span>
            </div>
            <p className="mt-1 text-[11px] text-sniffy-ink-mute">
              Computed over {r.samplesCount} recent sample
              {r.samplesCount === 1 ? "" : "s"}.
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
