import type {
  BenchmarkRange,
  ConversionAudit,
  DiagnosePaidResponse,
} from "@sniffy/scraper/schemas";
import { AlertTriangle, FlaskConical, RotateCcw } from "lucide-react";
import { ProvenanceIcon } from "@/components/ProvenanceIcon";
import { cn } from "@/lib/cn";

// Wave 1 (roadmap 1.2) — deterministic conversion audit. Everything in this
// block is an ESTIMATE from public signals + attributed vendor benchmarks
// (provenance "inferred"), never a measurement. Two brand-critical rendering
// rules:
//   1. Benchmarks ship as low–high RANGES with source + year attribution —
//      never collapse a range to a point, never drop the attribution.
//   2. The rating band verdict is the headline; the experiment plan is
//      secondary (collapsed) because it depends on traffic assumptions the
//      audit cannot verify.
// Renders nothing when conversionAudit is null (no ratings data fetched).

type RatingBand = NonNullable<
  ConversionAudit["ratingEconomics"]["ratingBand"]
>;

const BAND_LABEL: Record<RatingBand, string> = {
  "below-suppression": "Below suppression band",
  "below-credibility": "Below credibility band",
  credible: "Credible",
  "top-cluster": "Top cluster",
};

const BAND_TINT: Record<RatingBand, string> = {
  "below-suppression": "bg-sniffy-warn text-sniffy-paper",
  "below-credibility": "bg-sniffy-yellow text-sniffy-ink",
  credible: "bg-sniffy-paper-2 text-sniffy-ink",
  "top-cluster": "bg-sniffy-teal text-sniffy-ink",
};

const RESET_STANCE_TINT: Record<"consider" | "avoid", string> = {
  consider: "bg-sniffy-teal text-sniffy-ink",
  avoid: "bg-sniffy-warn text-sniffy-paper",
};

// Range + attribution, rendered together — the attribution is part of the
// number, not a footnote.
function RangeStat({
  label,
  range,
  unit,
}: {
  label: string;
  range: BenchmarkRange;
  unit: "×" | "%";
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.14em] text-sniffy-ink-mute">
        {label}
      </dt>
      <dd className="font-display text-base font-semibold tabular-nums text-sniffy-ink">
        {range.low}–{range.high}
        {unit}
      </dd>
      <dd className="mt-0.5 text-[10px] leading-snug text-sniffy-ink-mute">
        {range.source} ({range.year})
      </dd>
    </div>
  );
}

export function ConversionAuditCard({
  report,
}: {
  report: DiagnosePaidResponse;
}) {
  const audit = report.conversionAudit;
  if (audit === null) return null;
  const { ratingEconomics, ratingReset, experimentPlan } = audit;
  const band = ratingEconomics.ratingBand;
  const plan = experimentPlan;

  const showReset =
    ratingReset !== null && ratingReset.stance !== "insufficient-data";

  const feasibleLabel =
    plan.feasible === null
      ? "feasibility unknown"
      : plan.feasible
        ? "feasible"
        : "not feasible";

  return (
    <section className="border-2 border-sniffy-ink bg-sniffy-paper p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
          Conversion audit
        </h3>
        <ProvenanceIcon value={audit.provenance} showLabel />
      </div>

      {band !== null ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span
            className={cn(
              "inline-flex items-center border-2 border-sniffy-ink px-3 py-1 font-display text-sm font-semibold uppercase tracking-[0.1em]",
              BAND_TINT[band],
            )}
          >
            {BAND_LABEL[band]}
          </span>
          {ratingEconomics.thinVolume ? (
            <span className="inline-flex items-center gap-1 border-2 border-sniffy-warn bg-sniffy-paper-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-sniffy-ink">
              <AlertTriangle size={11} aria-hidden className="text-sniffy-warn" />
              thin ratings volume
            </span>
          ) : null}
        </div>
      ) : null}
      {ratingEconomics.bandNote ? (
        <p className="mt-2 font-mono text-xs text-sniffy-ink-2">
          {ratingEconomics.bandNote}
        </p>
      ) : null}

      <dl className="mt-3 grid grid-cols-1 gap-3 font-mono text-xs sm:grid-cols-3">
        {ratingEconomics.ratingMultiplier !== null ? (
          <RangeStat
            label="Rating multiplier"
            range={ratingEconomics.ratingMultiplier}
            unit="×"
          />
        ) : null}
        {ratingEconomics.categoryCvrBaseline !== null ? (
          <RangeStat
            label="Category CVR baseline"
            range={ratingEconomics.categoryCvrBaseline}
            unit="%"
          />
        ) : null}
        {ratingEconomics.estimatedConversionIndex !== null ? (
          <RangeStat
            label="Est. conversion index"
            range={ratingEconomics.estimatedConversionIndex}
            unit="%"
          />
        ) : null}
      </dl>

      {showReset ? (
        <div className="mt-3 border border-sniffy-ink bg-sniffy-paper-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <RotateCcw size={14} aria-hidden className="text-sniffy-ink-mute" />
            <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
              Rating reset
            </p>
            <span
              className={cn(
                "inline-flex items-center border border-sniffy-ink px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]",
                RESET_STANCE_TINT[ratingReset.stance as "consider" | "avoid"],
              )}
            >
              {ratingReset.stance}
            </span>
          </div>
          <p className="mt-2 font-mono text-xs text-sniffy-ink-2">
            {ratingReset.rationale}
          </p>
          <p className="mt-1 font-mono text-[11px] text-sniffy-ink-mute">
            {ratingReset.mechanics}
          </p>
        </div>
      ) : null}

      <details className="mt-3">
        <summary className="cursor-pointer font-mono text-[11px] text-sniffy-ink-mute hover:text-sniffy-ink">
          <span className="inline-flex items-center gap-1.5">
            <FlaskConical size={12} aria-hidden />
            Experiment plan — {feasibleLabel}
            {plan.daysToSignificance !== null ? (
              <span className="tabular-nums">
                · {plan.daysToSignificance.low}–{plan.daysToSignificance.high}{" "}
                days to significance
              </span>
            ) : null}
          </span>
        </summary>
        <div className="mt-2 border border-sniffy-rule bg-sniffy-paper-2 p-3 font-mono text-xs text-sniffy-ink-2">
          <p>{plan.recommendation}</p>
          <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
            {plan.suggestedFirstTest !== null ? (
              <div className="flex gap-2">
                <dt className="text-sniffy-ink-mute">First test</dt>
                <dd className="text-sniffy-ink">{plan.suggestedFirstTest}</dd>
              </div>
            ) : null}
            <div className="flex gap-2">
              <dt className="text-sniffy-ink-mute">Where</dt>
              <dd className="text-sniffy-ink">{plan.platformPath}</dd>
            </div>
          </dl>
          {plan.assumptions.length > 0 ? (
            <div className="mt-2">
              <p className="text-[10px] uppercase tracking-[0.14em] text-sniffy-ink-mute">
                Assumptions
              </p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] text-sniffy-ink-mute">
                {plan.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </details>
    </section>
  );
}
