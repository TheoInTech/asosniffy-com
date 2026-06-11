import type { QuoteResponse } from "@sniffy/scraper/schemas";
import { Candidates } from "./Candidates";
import { CoverageHints } from "./CoverageHints";
import { DetectedApp } from "./DetectedApp";
import { PreviewKeywordCard } from "./PreviewKeyword";
import { PricingBreakdown } from "./PricingBreakdown";
import { ShallowTeasers } from "./ShallowTeasers";
import { SniffIdChip } from "./SniffIdChip";

interface Props {
  quote: QuoteResponse;
  // Phase 1 — invoked when the user picks a candidate from the
  // "did you mean…?" panel. Parent re-runs the quote with that appId.
  onSelectCandidate?: (appId: string) => void;
  isReQuoting?: boolean;
}

export function QuoteResponseView({
  quote,
  onSelectCandidate,
  isReQuoting,
}: Props) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold uppercase tracking-[0.14em] text-sniffy-ink">
          Quote · scent trail preview
        </h2>
        <SniffIdChip sniffId={quote.sniffId} />
      </div>

      <DetectedApp app={quote.detectedApp} shallowScan={quote.shallowScan} />
      {onSelectCandidate ? (
        <Candidates
          shallowScan={quote.shallowScan}
          detectedAppId={quote.detectedApp.id}
          onSelect={onSelectCandidate}
          {...(isReQuoting !== undefined ? { disabled: isReQuoting } : {})}
        />
      ) : null}
      <PreviewKeywordCard value={quote.shallowScan.previewKeyword} />
      {/* Wave 1 — free one-bit teasers (rating band, AI mention, web
          plumbing). Renders nothing when all three fields are absent. */}
      <ShallowTeasers shallowScan={quote.shallowScan} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <PricingBreakdown pricing={quote.pricing} />
        <CoverageHints coverage={quote.coverage} />
      </div>
    </section>
  );
}
