import type { DiagnosePaidResponse, MetadataScore } from "@sniffy/scraper/schemas";
import { ProvenanceIcon } from "@/components/ProvenanceIcon";
import { cn } from "@/lib/cn";

function scoreTint(score: number): string {
  if (score >= 80) return "bg-sniffy-teal";
  if (score >= 60) return "bg-sniffy-yellow";
  return "bg-sniffy-warn text-sniffy-paper";
}

function barTint(score: number): string {
  if (score >= 80) return "bg-sniffy-teal";
  if (score >= 60) return "bg-sniffy-yellow";
  return "bg-sniffy-warn";
}

type SubscoreKey =
  | "title"
  | "subtitle"
  | "keywords"
  | "screenshots"
  | "ratingsAndReviews"
  | "keywordRankings";

type RowSpec = { key: SubscoreKey; label: string };

const ROWS: ReadonlyArray<RowSpec> = [
  { key: "title", label: "Title" },
  { key: "subtitle", label: "Subtitle" },
  { key: "keywords", label: "Keyword field" },
  { key: "screenshots", label: "Screenshots" },
  { key: "ratingsAndReviews", label: "Ratings & reviews" },
  { key: "keywordRankings", label: "Keyword rankings" },
];

export function MetadataScoreCard({ report }: { report: DiagnosePaidResponse }) {
  const { metadataScore } = report;
  const weights = metadataScore.weights;
  return (
    <section className="border-2 border-sniffy-ink bg-sniffy-paper p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
          ASO Score Card
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
        <ul className="flex-1 space-y-2 font-mono text-xs">
          {ROWS.map(({ key, label }) => (
            <ScoreRow
              key={key}
              label={label}
              weight={weights[key as keyof MetadataScore["weights"]]}
              subscore={metadataScore[key]}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

function ScoreRow({
  label,
  weight,
  subscore,
}: {
  label: string;
  weight: number;
  subscore: { score: number; notes: string };
}) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sniffy-ink-mute">
          {label} <span className="text-[10px]">({weight}%)</span>
        </span>
        <span className="font-semibold text-sniffy-ink">{subscore.score}/100</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden border border-sniffy-ink bg-sniffy-paper">
        <div
          className={cn("h-full", barTint(subscore.score))}
          style={{ width: `${Math.max(0, Math.min(100, subscore.score))}%` }}
          aria-hidden
        />
      </div>
      <p className="mt-1 text-sniffy-ink-2">{subscore.notes}</p>
    </li>
  );
}
