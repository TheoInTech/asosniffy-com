import type { ReactNode } from "react";
import type { DiagnosePaidResponse } from "@sniffy/scraper/schemas";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { ProvenanceIcon } from "@/components/ProvenanceIcon";
import { cn } from "@/lib/cn";

// Wave 2.2 (roadmap) — web discoverability audit. Deterministic hygiene
// FACTS from bounded fetches of the detected marketing domain. Editorial
// stance (per the [V-corrected] roadmap note): this component states what is
// present/absent and nothing else — no install-diversion or web-checkout
// advice, because web-to-app flows can cannibalize store rank signal. Any
// prose advice belongs in recommendations, not here.
// Renders nothing when webDiscoverability is null (flag off, no marketing
// URL, SSRF-rejected, or page fetch failed).

function PresenceIcon({ present }: { present: boolean }) {
  return present ? (
    <CheckCircle2 size={14} aria-hidden className="shrink-0 text-sniffy-teal" />
  ) : (
    <XCircle size={14} aria-hidden className="shrink-0 text-sniffy-warn" />
  );
}

function ChecklistRow({
  present,
  label,
  children,
}: {
  present: boolean;
  label: string;
  children?: ReactNode;
}) {
  return (
    <li className="flex items-start gap-2 border-b border-sniffy-rule py-2 font-mono text-xs last:border-b-0">
      <span className="mt-0.5">
        <PresenceIcon present={present} />
      </span>
      <span className="flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold text-sniffy-ink">{label}</span>
          <span className="text-[10px] uppercase tracking-[0.14em] text-sniffy-ink-mute">
            {present ? "present" : "absent"}
          </span>
        </span>
        {children}
      </span>
    </li>
  );
}

function CrawlerChip({
  name,
  state,
}: {
  name: string;
  state: "allowed" | "blocked";
}) {
  return (
    <span className="inline-flex items-center gap-1.5 border border-sniffy-ink bg-sniffy-paper-2 px-2 py-0.5 font-mono text-[11px]">
      <span className="text-sniffy-ink">{name}</span>
      <span
        className={cn(
          "text-[10px] uppercase tracking-[0.12em]",
          state === "allowed" ? "text-sniffy-teal" : "text-sniffy-warn",
        )}
      >
        {state}
      </span>
    </span>
  );
}

export function WebDiscoverabilityCard({
  report,
}: {
  report: DiagnosePaidResponse;
}) {
  const audit = report.webDiscoverability;
  if (audit === null) return null;
  const {
    smartAppBanner,
    appSchema,
    universalLinks,
    androidAppLinks,
    aiCrawlerAccess,
    openGraph,
    ratingDrift,
  } = audit;

  const ogParts: Array<{ key: string; present: boolean }> = [
    { key: "title", present: openGraph.title },
    { key: "description", present: openGraph.description },
    { key: "image", present: openGraph.image },
  ];
  const ogPresent = ogParts.some((p) => p.present);

  return (
    <section className="border-2 border-sniffy-ink bg-sniffy-paper p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
          Web discoverability
        </h3>
        <ProvenanceIcon value={audit.provenance} showLabel />
      </div>

      <ul className="mt-2">
        <ChecklistRow present={smartAppBanner.present} label="Smart App Banner">
          {smartAppBanner.present ? (
            <span className="mt-0.5 block text-[11px] text-sniffy-ink-mute">
              app-id {smartAppBanner.appId ?? "—"} ·{" "}
              {smartAppBanner.hasAppArgument
                ? "app-argument set"
                : "no app-argument"}
            </span>
          ) : null}
        </ChecklistRow>

        <ChecklistRow
          present={appSchema.present}
          label="App schema (schema.org)"
        >
          {appSchema.present ? (
            <span className="mt-0.5 block text-[11px] text-sniffy-ink-mute">
              {appSchema.type ?? "unknown type"}
              {appSchema.aggregateRatingValue !== null
                ? ` · aggregateRating ${appSchema.aggregateRatingValue}`
                : ""}
              {appSchema.missingRequiredFields.length > 0 ? (
                <span className="block text-sniffy-warn">
                  missing required fields:{" "}
                  {appSchema.missingRequiredFields.join(", ")}
                </span>
              ) : null}
            </span>
          ) : null}
        </ChecklistRow>

        <ChecklistRow
          present={universalLinks.present}
          label="Universal Links (AASA)"
        >
          {universalLinks.present ? (
            <span className="mt-0.5 block text-[11px] text-sniffy-ink-mute">
              {universalLinks.valid ? "valid" : "invalid"} · bundle ID{" "}
              {universalLinks.bundleIdListed === null
                ? "unknown"
                : universalLinks.bundleIdListed
                  ? "listed"
                  : "not listed"}
            </span>
          ) : null}
        </ChecklistRow>

        <ChecklistRow
          present={androidAppLinks.present}
          label="Android App Links (assetlinks.json)"
        >
          {androidAppLinks.present ? (
            <span className="mt-0.5 block text-[11px] text-sniffy-ink-mute">
              {androidAppLinks.valid ? "valid" : "invalid"} · package{" "}
              {androidAppLinks.packageListed === null
                ? "unknown"
                : androidAppLinks.packageListed
                  ? "listed"
                  : "not listed"}
            </span>
          ) : null}
        </ChecklistRow>

        <ChecklistRow present={ogPresent} label="Open Graph tags">
          <span className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-sniffy-ink-mute">
            {ogParts.map((p) => (
              <span key={p.key} className="inline-flex items-center gap-1">
                <PresenceIcon present={p.present} />
                {p.key}
              </span>
            ))}
          </span>
        </ChecklistRow>
      </ul>

      <div className="mt-3">
        <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
          AI crawler access
        </p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <CrawlerChip name="GPTBot" state={aiCrawlerAccess.gptBot} />
          <CrawlerChip
            name="PerplexityBot"
            state={aiCrawlerAccess.perplexityBot}
          />
          <CrawlerChip
            name="Google-Extended"
            state={aiCrawlerAccess.googleExtended}
          />
        </div>
        {!aiCrawlerAccess.robotsTxtPresent ? (
          <p className="mt-1 font-mono text-[10px] text-sniffy-ink-mute">
            no robots.txt found — crawlers are allowed by default
          </p>
        ) : null}
      </div>

      {ratingDrift !== null ? (
        <div
          role="status"
          className="mt-3 flex items-start gap-2 border-2 border-sniffy-warn bg-sniffy-paper-2 px-3 py-2 font-mono text-xs text-sniffy-ink"
        >
          <AlertTriangle
            size={14}
            aria-hidden
            className="mt-0.5 shrink-0 text-sniffy-warn"
          />
          <span>
            <span className="font-semibold">Rating drift:</span> schema.org
            markup says {ratingDrift.schemaValue}, the store says{" "}
            {ratingDrift.storeValue} (drift {ratingDrift.drift}).
          </span>
        </div>
      ) : null}

      <p className="mt-3 flex flex-wrap items-center gap-x-2 border-t border-sniffy-rule pt-2 font-mono text-[10px] text-sniffy-ink-mute">
        <span className="truncate">{audit.url}</span>
        <span aria-hidden>·</span>
        <span>
          checked {new Date(audit.checkedAt).toLocaleDateString()}
        </span>
      </p>
    </section>
  );
}
