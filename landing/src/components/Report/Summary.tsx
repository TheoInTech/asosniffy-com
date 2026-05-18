import type { DiagnosePaidResponse } from "@sniffy/scraper/schemas";
import { ProvenanceIcon } from "@/components/ProvenanceIcon";

export function Summary({ report }: { report: DiagnosePaidResponse }) {
  return (
    <section className="border-2 border-sniffy-ink bg-sniffy-paper p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
          Summary
        </h3>
        <ProvenanceIcon value={report.dataProvenance.appMetadata} showLabel />
      </div>
      <p className="mt-3 font-mono text-sm leading-relaxed text-sniffy-ink">
        {report.summary}
      </p>
    </section>
  );
}
