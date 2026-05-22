"use client";

import { useId, useState } from "react";

// Sprint A — anonymous savings comparison. Numbers reference public pricing
// tiers of mainstream ASO subscription products; this block never names a
// specific competitor. The same anchor numbers also ship in the /quote
// response as `savingsNote` so SDK / CLI / MCP / UI all reflect identical
// framing.

const SNIFFY_QUICK_PER_AUDIT_USD = 0.05;
const TYPICAL_ASO_START_ANNUAL_USD = 589;
const TYPICAL_ASO_PRO_ANNUAL_USD = 1699;
const PRO_TIER_THRESHOLD_AUDITS = 50;

interface FounderPatternRow {
  label: string;
  detail: string;
  audits: number;
}

const PATTERN_ROWS: FounderPatternRow[] = [
  { label: "Quarterly checkup", detail: "4 audits/yr", audits: 4 },
  { label: "Monthly optimization", detail: "12 audits/yr", audits: 12 },
  { label: "Active iteration", detail: "50 audits/yr", audits: 50 },
  { label: "Agent automation", detail: "100 audits/yr", audits: 100 },
];

function subscriptionAnnualFor(audits: number): number {
  return audits >= PRO_TIER_THRESHOLD_AUDITS
    ? TYPICAL_ASO_PRO_ANNUAL_USD
    : TYPICAL_ASO_START_ANNUAL_USD;
}

function sniffyAnnualFor(audits: number): number {
  // Round to two decimals so the rendered USD strings are byte-stable.
  return Math.round(audits * SNIFFY_QUICK_PER_AUDIT_USD * 100) / 100;
}

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function ratio(sniffy: number, subscription: number): number {
  // Floor to integer for the "X× cheaper" headline. Guard against the
  // degenerate sniffy=0 case (slider at 0) with a tiny floor.
  return Math.round(subscription / Math.max(sniffy, 0.01));
}

export function PricingComparison() {
  const [audits, setAudits] = useState(12);
  const sliderId = useId();

  const sliderSniffy = sniffyAnnualFor(audits);
  const sliderSubscription = subscriptionAnnualFor(audits);
  const sliderRatio = ratio(sliderSniffy, sliderSubscription);
  const tierLabel =
    audits >= PRO_TIER_THRESHOLD_AUDITS
      ? "typical ASO Pro tier (annual)"
      : "typical ASO Start tier (annual)";

  return (
    <section
      aria-labelledby="pricing-comparison-heading"
      className="border-2 border-sniffy-ink bg-sniffy-paper-2 p-5 md:p-7 shadow-ink-tab"
    >
      <p className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-sniffy-warn">
        Subscription math vs pay-per-sniff
      </p>
      <h2
        id="pricing-comparison-heading"
        className="mt-2 font-display text-2xl font-semibold leading-tight text-sniffy-ink md:text-3xl"
      >
        Subscription pricing is built for constant use.
      </h2>
      <p className="mt-2 max-w-prose font-mono text-sm text-sniffy-ink-2">
        Indie founders use ASO in bursts — a launch push, a quarterly refresh,
        a "why am I not ranking" diagnostic. Pay only for those.
      </p>

      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full border-collapse text-left font-mono text-xs text-sniffy-ink-2">
          <caption className="sr-only">
            Comparison of Sniffy pay-per-sniff and a typical ASO subscription
            across common founder usage patterns.
          </caption>
          <thead>
            <tr className="border-b-2 border-sniffy-ink text-[10px] uppercase tracking-[0.18em] text-sniffy-ink">
              <th scope="col" className="py-2 pr-3">
                Founder pattern
              </th>
              <th scope="col" className="py-2 pr-3 text-right">
                Sniffy / year
              </th>
              <th scope="col" className="py-2 pr-3 text-right">
                Typical ASO subscription
              </th>
              <th scope="col" className="py-2 text-right">
                Multiplier
              </th>
            </tr>
          </thead>
          <tbody>
            {PATTERN_ROWS.map((row) => {
              const sniffy = sniffyAnnualFor(row.audits);
              const subscription = subscriptionAnnualFor(row.audits);
              const mult = ratio(sniffy, subscription);
              return (
                <tr key={row.audits} className="border-b border-sniffy-rule">
                  <td className="py-2 pr-3">
                    <strong className="font-semibold text-sniffy-ink">
                      {row.label}
                    </strong>
                    <span className="block text-[10px] text-sniffy-ink-mute">
                      {row.detail}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    ${formatUsd(sniffy)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    ${subscription.toLocaleString("en-US")}
                  </td>
                  <td className="py-2 text-right font-semibold text-sniffy-warn tabular-nums">
                    {mult.toLocaleString("en-US")}×
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 border-t-2 border-sniffy-ink pt-4">
        <label
          htmlFor={sliderId}
          className="block font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-sniffy-ink"
        >
          Calculate your savings
        </label>
        <div className="mt-2 flex items-center gap-4">
          <input
            id={sliderId}
            type="range"
            min={1}
            max={200}
            step={1}
            value={audits}
            onChange={(e) => setAudits(parseInt(e.target.value, 10))}
            className="flex-1 accent-sniffy-warn"
            aria-label="Audits per year"
          />
          <span className="min-w-[7ch] text-right font-mono text-sm tabular-nums text-sniffy-ink">
            {audits} audit{audits === 1 ? "" : "s"}/yr
          </span>
        </div>
        <p className="mt-3 font-mono text-xs text-sniffy-ink-2">
          Sniffy:{" "}
          <strong className="font-semibold tabular-nums text-sniffy-ink">
            ${formatUsd(sliderSniffy)}/yr
          </strong>
          {" · "}
          {tierLabel}:{" "}
          <strong className="font-semibold tabular-nums text-sniffy-ink">
            ${sliderSubscription.toLocaleString("en-US")}/yr
          </strong>
          {" · "}
          <span className="font-semibold text-sniffy-warn">
            {sliderRatio.toLocaleString("en-US")}× cheaper
          </span>
        </p>
        <p className="mt-2 font-mono text-[10px] text-sniffy-ink-mute">
          Numbers reference public pricing tiers of mainstream ASO subscription
          products. Sniffy figures use the Quick-tier sniff at $0.05.
          No subscription, no seats, no card on file.
        </p>
      </div>
    </section>
  );
}
