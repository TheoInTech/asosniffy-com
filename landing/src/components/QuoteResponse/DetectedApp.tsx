import type { QuoteResponse } from "@sniffy/scraper/schemas";

interface Props {
  app: QuoteResponse["detectedApp"];
  shallowScan: QuoteResponse["shallowScan"];
}

export function DetectedApp({ app, shallowScan }: Props) {
  const stars = Math.round(shallowScan.ratingsSummary.average * 10) / 10;
  return (
    <div className="border-2 border-sniffy-ink bg-sniffy-paper p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
            Detected app
          </p>
          <h3 className="mt-0.5 font-display text-xl font-semibold text-sniffy-ink">
            {shallowScan.title || app.name}
          </h3>
          {shallowScan.subtitle ? (
            <p className="font-mono text-sm text-sniffy-ink-mute">
              {shallowScan.subtitle}
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
            Ratings
          </p>
          <p className="font-mono text-sm text-sniffy-ink">
            {stars.toFixed(1)} ★ ·{" "}
            <span className="text-sniffy-ink-mute">
              {shallowScan.ratingsSummary.count.toLocaleString()}
            </span>
          </p>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs">
        <div>
          <dt className="text-sniffy-ink-mute">Developer</dt>
          <dd className="text-sniffy-ink">{app.developer}</dd>
        </div>
        <div>
          <dt className="text-sniffy-ink-mute">Category</dt>
          <dd className="text-sniffy-ink">{shallowScan.primaryCategory}</dd>
        </div>
      </dl>
    </div>
  );
}
