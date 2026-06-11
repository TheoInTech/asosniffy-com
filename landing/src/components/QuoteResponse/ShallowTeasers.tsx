import type { QuoteResponse } from "@sniffy/scraper/schemas";
import { Bot, CheckCircle2, XCircle } from "lucide-react";
import { ProvenanceIcon } from "@/components/ProvenanceIcon";
import { cn } from "@/lib/cn";

// Wave 1 (roadmap 1.5) — free one-bit teasers on /quote, one per funnel
// edge, zero paid leakage (PLAN.md §22):
//   ratingBandVerdict — rating positioned against community-tested bands;
//     full rating economics stay paid-only (conversionAudit).
//   aiMention — one probe, one model, one intent; the multi-prompt
//     share-of-voice section is paid-only (aiVisibility).
//   webPlumbing — three booleans; the full field-level audit is paid-only
//     (webDiscoverability).
// Each field is nullable/optional — render nothing when all are absent.

type ShallowScan = QuoteResponse["shallowScan"];
type RatingBand = NonNullable<ShallowScan["ratingBandVerdict"]>["band"];

const BAND_TINT: Record<RatingBand, string> = {
  "below-suppression": "bg-sniffy-warn text-sniffy-paper",
  "below-credibility": "bg-sniffy-yellow text-sniffy-ink",
  credible: "bg-sniffy-paper-2 text-sniffy-ink",
  "top-cluster": "bg-sniffy-teal text-sniffy-ink",
};

const BAND_LABEL: Record<RatingBand, string> = {
  "below-suppression": "below suppression",
  "below-credibility": "below credibility",
  credible: "credible",
  "top-cluster": "top cluster",
};

function PlumbingChip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 border border-sniffy-ink bg-sniffy-paper-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-sniffy-ink"
      title={`${label}: ${ok ? "present" : "absent"}`}
    >
      {ok ? (
        <CheckCircle2 size={11} aria-hidden className="text-sniffy-teal" />
      ) : (
        <XCircle size={11} aria-hidden className="text-sniffy-warn" />
      )}
      {label}
    </span>
  );
}

export function ShallowTeasers({ shallowScan }: { shallowScan: ShallowScan }) {
  const { ratingBandVerdict, aiMention, webPlumbing } = shallowScan;
  if (!ratingBandVerdict && !aiMention && !webPlumbing) return null;

  return (
    <div className="border-2 border-sniffy-ink bg-sniffy-paper p-4">
      <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
        Extra scent markers · free
      </p>
      <ul className="mt-2 space-y-2 font-mono text-xs">
        {ratingBandVerdict ? (
          <li className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center border-2 border-sniffy-ink px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
                BAND_TINT[ratingBandVerdict.band],
              )}
            >
              {BAND_LABEL[ratingBandVerdict.band]}
            </span>
            <span className="text-sniffy-ink-2">{ratingBandVerdict.note}</span>
          </li>
        ) : null}
        {aiMention ? (
          <li className="flex flex-wrap items-center gap-2">
            <Bot size={14} aria-hidden className="shrink-0 text-sniffy-ink-mute" />
            <span className="text-sniffy-ink-2">
              An AI assistant{" "}
              <span
                className={cn(
                  "font-semibold",
                  aiMention.mentioned ? "text-sniffy-teal" : "text-sniffy-warn",
                )}
              >
                {aiMention.mentioned ? "named" : "did not name"} this app
              </span>{" "}
              for &quot;{aiMention.intent}&quot;
            </span>
            <span className="inline-flex items-center border border-sniffy-rule px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-sniffy-ink-mute">
              {aiMention.model}
            </span>
            <ProvenanceIcon value={aiMention.provenance} showLabel />
          </li>
        ) : null}
        {webPlumbing ? (
          <li className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.14em] text-sniffy-ink-mute">
              Web plumbing
            </span>
            <PlumbingChip
              label="smart app banner"
              ok={webPlumbing.smartAppBanner}
            />
            <PlumbingChip label="app schema" ok={webPlumbing.appSchema} />
            <PlumbingChip label="deep linking" ok={webPlumbing.deepLinking} />
          </li>
        ) : null}
      </ul>
    </div>
  );
}
