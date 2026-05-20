import type {
  CompetitorTrailItem,
  DiagnosePaidResponse,
} from "@sniffy/scraper/schemas";
import { ProvenanceIcon } from "@/components/ProvenanceIcon";

// Phase 2 — competitor source distinguishes iOS-style discovery (top-of-keyword
// search) from Android-style discovery (gplay.similar — algorithmic "more like
// this"). Teal for the algorithmic source so it visually differs from the
// keyword-search default.
const SOURCE_LABEL: Record<CompetitorTrailItem["source"], string> = {
  search: "via search",
  similar: "via similar apps",
};

const SOURCE_TINT: Record<CompetitorTrailItem["source"], string> = {
  search: "bg-sniffy-paper border-sniffy-rule text-sniffy-ink-mute",
  similar: "bg-sniffy-teal border-sniffy-ink text-sniffy-ink",
};

export function CompetitorTrail({ report }: { report: DiagnosePaidResponse }) {
  return (
    <section className="border-2 border-sniffy-ink bg-sniffy-paper p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
          Competitor trail
        </h3>
        <ProvenanceIcon value={report.dataProvenance.competitors} showLabel />
      </div>
      {report.competitorTrail.length === 0 ? (
        <p className="mt-3 font-mono text-xs text-sniffy-ink-mute">
          No competitor trail surfaced for this run.
        </p>
      ) : (
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {report.competitorTrail.map((c) => (
            <li
              key={c.appId}
              className="border border-sniffy-ink bg-sniffy-paper-2 p-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="font-display font-semibold text-sniffy-ink">
                    {c.name}
                  </p>
                  <span
                    className={`inline-flex items-center border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${SOURCE_TINT[c.source]}`}
                    title={
                      c.source === "similar"
                        ? "Discovered via Google Play's algorithmic similar-apps endpoint"
                        : "Discovered via App Store search for the first keyword"
                    }
                  >
                    {SOURCE_LABEL[c.source]}
                  </span>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-sniffy-ink-mute">
                  {c.appId}
                </span>
              </div>
              {c.overlapKeywords.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-1">
                  {c.overlapKeywords.map((kw) => (
                    <li
                      key={kw}
                      className="border border-sniffy-rule px-1.5 py-0.5 font-mono text-[11px] text-sniffy-ink"
                    >
                      {kw}
                    </li>
                  ))}
                </ul>
              ) : null}
              {c.notes ? (
                <p className="mt-2 font-mono text-xs text-sniffy-ink-2">
                  {c.notes}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
