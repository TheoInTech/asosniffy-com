import type { PreviewKeyword as PreviewKeywordType } from "@sniffy/scraper/schemas";
import { ProvenanceIcon } from "@/components/ProvenanceIcon";

const BUCKET_TINT: Record<PreviewKeywordType["rankBucket"], string> = {
  "1-10": "bg-sniffy-teal",
  "11-30": "bg-sniffy-yellow",
  "31-50": "bg-sniffy-paper-2",
  "51-100": "bg-sniffy-paper-2",
  "100+": "bg-sniffy-paper-2",
  not_found: "bg-sniffy-warn text-sniffy-paper",
};

export function PreviewKeywordCard({
  value,
}: {
  value: PreviewKeywordType;
}) {
  const tint = BUCKET_TINT[value.rankBucket];
  return (
    <div className="border-2 border-sniffy-ink bg-sniffy-paper p-4">
      <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
        Preview keyword
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span className="font-display text-lg font-semibold text-sniffy-ink">
          {value.keyword}
        </span>
        <span
          className={`inline-flex items-center gap-1 border-2 border-sniffy-ink px-2 py-0.5 font-mono text-xs font-semibold uppercase ${tint}`}
        >
          rank {value.rankBucket}
        </span>
        <span className="inline-flex items-center gap-1 font-mono text-xs text-sniffy-ink-mute">
          <ProvenanceIcon value={value.provenance} showLabel />
        </span>
        <span className="inline-flex items-center gap-1 border border-sniffy-rule px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-sniffy-ink-mute">
          {value.confidence} confidence
        </span>
      </div>
      <p className="mt-3 font-mono text-xs text-sniffy-ink-mute">
        One sample bucket from your keyword list — the paid trail covers all of
        them, plus competitors and metadata.
      </p>
    </div>
  );
}
