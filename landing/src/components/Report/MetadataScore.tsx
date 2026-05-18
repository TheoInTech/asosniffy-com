import type { DiagnosePaidResponse } from "@sniffy/scraper/schemas";
import { ProvenanceIcon } from "@/components/ProvenanceIcon";
import { cn } from "@/lib/cn";

function scoreTint(score: number): string {
  if (score >= 80) return "bg-sniffy-teal";
  if (score >= 60) return "bg-sniffy-yellow";
  return "bg-sniffy-warn text-sniffy-paper";
}

export function MetadataScoreCard({ report }: { report: DiagnosePaidResponse }) {
  const { metadataScore } = report;
  const rows: Array<{ key: keyof typeof metadataScore; label: string }> = [
    { key: "title", label: "Title" },
    { key: "subtitle", label: "Subtitle" },
    { key: "keywords", label: "Keywords field" },
    { key: "screenshots", label: "Screenshots" },
  ];
  return (
    <section className="border-2 border-sniffy-ink bg-sniffy-paper p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
          Metadata score
        </h3>
        <ProvenanceIcon value={report.dataProvenance.appMetadata} showLabel />
      </div>
      <div className="mt-3 flex items-center gap-4">
        <div
          className={cn(
            "flex h-20 w-20 items-center justify-center border-2 border-sniffy-ink font-display text-2xl font-semibold",
            scoreTint(metadataScore.overall),
          )}
          aria-label={`Overall metadata score: ${metadataScore.overall} out of 100`}
        >
          {metadataScore.overall}
        </div>
        <ul className="grid flex-1 grid-cols-2 gap-x-3 gap-y-2 font-mono text-xs">
          {rows.map(({ key, label }) => {
            const v = metadataScore[key];
            if (typeof v === "number") return null;
            return (
              <li key={key as string}>
                <div className="flex items-baseline justify-between">
                  <span className="text-sniffy-ink-mute">{label}</span>
                  <span className="font-semibold text-sniffy-ink">{v.score}</span>
                </div>
                <p className="text-sniffy-ink-2">{v.notes}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
