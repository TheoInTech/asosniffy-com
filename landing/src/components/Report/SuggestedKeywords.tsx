import type {
  DiagnosePaidResponse,
  SuggestedKeyword,
} from "@sniffy/scraper/schemas";
import { Plus } from "lucide-react";
import { ProvenanceIcon } from "@/components/ProvenanceIcon";
import { cn } from "@/lib/cn";

// Phase 3 — suggestedKeywords[] surfaces terms the user *should* have submitted
// but didn't. Two sources, both labeled honestly via the `reason` field:
//   review-frequency   → mined from public reviews; provenance "inferred"
//   competitor-overlap → keywords competitors carry that the target doesn't
//
// Optional "Add to next sniff" CTA wires back to the QuoteForm so the user
// can pre-fill the keyword input. Parent passes onAddKeyword when wiring.

const REASON_LABEL: Record<SuggestedKeyword["reason"], string> = {
  "review-frequency": "from reviews",
  "competitor-overlap": "from competitor",
};

const REASON_TINT: Record<SuggestedKeyword["reason"], string> = {
  "review-frequency": "bg-sniffy-teal text-sniffy-ink",
  "competitor-overlap": "bg-sniffy-yellow text-sniffy-ink",
};

interface Props {
  report: DiagnosePaidResponse;
  onAddKeyword?: (keyword: string) => void;
}

export function SuggestedKeywords({ report, onAddKeyword }: Props) {
  if (report.suggestedKeywords.length === 0) return null;
  return (
    <section className="border-2 border-sniffy-ink bg-sniffy-paper p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
          Keywords worth sniffing next
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-sniffy-ink-mute">
          {report.suggestedKeywords.length} suggestion
          {report.suggestedKeywords.length === 1 ? "" : "s"}
        </span>
      </div>
      <p className="mt-1 font-mono text-xs text-sniffy-ink-2">
        Mined from your reviews and competitors' metadata — keywords you didn't
        submit but probably should.
      </p>
      <ul className="mt-3 grid gap-3 md:grid-cols-2">
        {report.suggestedKeywords.map((k) => (
          <li
            key={`${k.reason}-${k.keyword}`}
            className="border border-sniffy-ink bg-sniffy-paper-2 p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-display text-sm font-semibold text-sniffy-ink">
                {k.keyword}
              </p>
              <span
                className={cn(
                  "border border-sniffy-ink px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]",
                  REASON_TINT[k.reason],
                )}
              >
                {REASON_LABEL[k.reason]}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[11px] text-sniffy-ink-mute">
              <span className="inline-flex items-center gap-1">
                <ProvenanceIcon value={k.provenance} />
                {k.confidence}
              </span>
              {k.reason === "review-frequency" && k.reviewCount !== undefined ? (
                <span>seen in {k.reviewCount} reviews</span>
              ) : null}
            </div>
            {onAddKeyword ? (
              <button
                type="button"
                onClick={() => onAddKeyword(k.keyword)}
                className="mt-2 inline-flex items-center gap-1 border-2 border-sniffy-ink bg-sniffy-paper px-2 py-1 font-display text-[10px] font-semibold uppercase tracking-[0.14em] hover:bg-sniffy-yellow focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow"
              >
                <Plus size={10} aria-hidden /> Add to next sniff
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
