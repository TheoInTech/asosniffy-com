import type { Pricing } from "@sniffy/scraper/schemas";

export function PricingBreakdown({ pricing }: { pricing: Pricing }) {
  return (
    <div className="border-2 border-sniffy-ink bg-sniffy-paper-2 p-4">
      <div className="flex items-baseline justify-between">
        <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
          Cost to unlock full trail
        </p>
        <p className="font-mono text-base font-semibold text-sniffy-ink">
          {pricing.estimatedTotal} {pricing.currency}
        </p>
      </div>
      <ul className="mt-3 space-y-1 font-mono text-xs">
        {pricing.breakdown.map((item) => (
          <li
            key={`${item.label}-${item.amount}`}
            className="flex items-baseline justify-between"
          >
            <span className="text-sniffy-ink-mute">{item.label}</span>
            <span className="text-sniffy-ink">
              {item.amount} {pricing.currency}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-sniffy-rule pt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-sniffy-ink-mute">
        Settled on {pricing.network}
      </p>
    </div>
  );
}
