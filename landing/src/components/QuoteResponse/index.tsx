import type { QuoteResponse } from "@sniffy/scraper/schemas";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Candidates } from "./Candidates";
import { CoverageHints } from "./CoverageHints";
import { DetectedApp } from "./DetectedApp";
import { PreviewKeywordCard } from "./PreviewKeyword";
import { PricingBreakdown } from "./PricingBreakdown";
import { SniffIdChip } from "./SniffIdChip";

interface Props {
  quote: QuoteResponse;
  onUnlock: () => void;
  isUnlocking?: boolean;
  unlockError?: string | null;
  // Phase 1 — invoked when the user picks a candidate from the
  // "did you mean…?" panel. Parent re-runs the quote with that appId.
  onSelectCandidate?: (appId: string) => void;
  isReQuoting?: boolean;
}

export function QuoteResponseView({
  quote,
  onUnlock,
  isUnlocking,
  unlockError,
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <PricingBreakdown pricing={quote.pricing} />
        <CoverageHints coverage={quote.coverage} />
      </div>

      {unlockError ? (
        <div
          role="alert"
          className="border-2 border-sniffy-warn bg-sniffy-paper-2 px-3 py-2 text-sm text-sniffy-ink"
        >
          <span className="font-display font-semibold uppercase tracking-[0.12em] text-sniffy-warn">
            Unlock issue:
          </span>{" "}
          {unlockError}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 border-t-2 border-dashed border-sniffy-rule pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-mono text-xs text-sniffy-ink-mute">
          Paying unlocks the full keyword diagnosis, competitor trail, metadata
          score, ranked recommendations, and ready-to-paste copy — every field
          carries a provenance label.
        </p>
        <button
          type="button"
          onClick={onUnlock}
          disabled={isUnlocking}
          className={cn(
            "inline-flex items-center gap-2 border-2 border-sniffy-ink bg-sniffy-teal px-5 py-2.5 font-display text-sm font-semibold uppercase tracking-[0.14em] text-sniffy-ink shadow-ink-tab transition-transform",
            "hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[6px_6px_0_0_#15110D]",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-ink focus-visible:ring-offset-2 focus-visible:ring-offset-sniffy-paper",
            "motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          Unlock full trail
          <ArrowRight size={14} aria-hidden />
        </button>
      </div>
    </section>
  );
}
