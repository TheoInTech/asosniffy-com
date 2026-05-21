import { ExternalLink } from "lucide-react";
import type {
  CompetitorTrailItem,
  DiagnosePaidResponse,
  Store,
} from "@sniffy/scraper/schemas";
import { ProvenanceIcon } from "@/components/ProvenanceIcon";
import type { ReportScope } from "./types";

// Phase 2 — competitor source distinguishes iOS-style discovery (top-of-keyword
// search) from Android-style discovery (gplay.similar — algorithmic "more like
// this"). Teal for the algorithmic source so it visually differs from the
// keyword-search default.
const SOURCE_LABEL: Record<CompetitorTrailItem["source"], string> = {
  search: "via search",
  similar: "via similar apps",
};

const SOURCE_TINT: Record<CompetitorTrailItem["source"], string> = {
  search: "bg-sniffy-paper border-sniffy-rule text-sniffy-ink-mute",
  similar: "bg-sniffy-teal border-sniffy-ink text-sniffy-ink",
};

function appStoreUrl(store: Store, country: string, appId: string): string {
  const cc = country.toLowerCase();
  if (store === "ios") {
    return `https://apps.apple.com/${cc}/app/id${appId}`;
  }
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(appId)}&hl=en&gl=${cc}`;
}

const STORE_NAME: Record<Store, string> = {
  ios: "App Store",
  android: "Play Store",
};

const CARD_CLASS_BASE = "block border border-sniffy-ink bg-sniffy-paper-2 p-3";
const CARD_CLASS_INTERACTIVE =
  "transition-transform hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[4px_4px_0_0_#15110D] focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-sniffy-paper motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0";

export function CompetitorTrail({
  report,
  scope,
}: {
  report: DiagnosePaidResponse;
  scope?: ReportScope;
}) {
  return (
    <section className="border-2 border-sniffy-ink bg-sniffy-paper p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
          Competitor trail
        </h3>
        <ProvenanceIcon value={report.dataProvenance.competitors} showLabel />
      </div>
      {report.competitorTrail.length === 0 ? (
        <p className="mt-3 font-mono text-xs text-sniffy-ink-mute">
          No competitor trail surfaced for this run.
        </p>
      ) : (
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {report.competitorTrail.map((c) => {
            const cardBody = (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <p className="inline-flex items-baseline gap-1.5 font-display font-semibold text-sniffy-ink">
                      <span>{c.name}</span>
                      {scope ? (
                        <ExternalLink
                          size={12}
                          aria-hidden
                          className="self-center text-sniffy-ink-mute"
                        />
                      ) : null}
                    </p>
                    <span
                      className={`inline-flex items-center border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${SOURCE_TINT[c.source]}`}
                      title={
                        c.source === "similar"
                          ? "Discovered via Google Play's algorithmic similar-apps endpoint"
                          : "Discovered via App Store search for the first keyword"
                      }
                    >
                      {SOURCE_LABEL[c.source]}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-sniffy-ink-mute">
                    {c.appId}
                  </span>
                </div>
                {c.overlapKeywords.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-1">
                    {c.overlapKeywords.map((kw) => (
                      <li
                        key={kw}
                        className="border border-sniffy-rule px-1.5 py-0.5 font-mono text-[11px] text-sniffy-ink"
                      >
                        {kw}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {c.notes ? (
                  <p className="mt-2 font-mono text-xs text-sniffy-ink-2">
                    {c.notes}
                  </p>
                ) : null}
              </>
            );

            return (
              <li key={c.appId}>
                {scope ? (
                  <a
                    href={appStoreUrl(scope.store, scope.country, c.appId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${c.name} in ${STORE_NAME[scope.store]} (opens in new tab)`}
                    className={`${CARD_CLASS_BASE} ${CARD_CLASS_INTERACTIVE}`}
                  >
                    {cardBody}
                  </a>
                ) : (
                  <div className={CARD_CLASS_BASE}>{cardBody}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
