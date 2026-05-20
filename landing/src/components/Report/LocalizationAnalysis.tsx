import type { ReactElement } from "react";
import type {
  DiagnosePaidResponse,
  LocalizationStorefront,
} from "@sniffy/scraper/schemas";
import {
  AlertTriangle,
  CheckCircle2,
  Globe,
  HelpCircle,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/cn";

// Phase 5 — multi-storefront localization gap analysis.
//
// For each queried storefront, we report: title variant, detected language,
// `localized` boolean (description language matches storefront's primary
// language), and gapScore (0–100). The overall section header surfaces a
// "N of M storefronts need translation" callout when unlocalizedCount > 0.
//
// Renders nothing when localizationAnalysis is null (LOCALIZATION_ENABLED=false
// in the scraper, or the multi-storefront fetch produced no usable storefronts).

const LOCALIZED_ICON: Record<string, ReactElement> = {
  yes: <CheckCircle2 size={14} aria-hidden className="text-sniffy-teal" />,
  no: <XCircle size={14} aria-hidden className="text-sniffy-warn" />,
  unknown: <HelpCircle size={14} aria-hidden className="text-sniffy-ink-mute" />,
};

function localizedKey(value: LocalizationStorefront["localized"]): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

function gapBarTint(score: number): string {
  if (score >= 80) return "bg-sniffy-teal";
  if (score >= 50) return "bg-sniffy-yellow";
  return "bg-sniffy-warn";
}

export function LocalizationAnalysis({
  report,
}: {
  report: DiagnosePaidResponse;
}) {
  const analysis = report.localizationAnalysis;
  if (analysis === null) return null;
  const { storefronts, titleVariants, overallGapScore, unlocalizedCount } =
    analysis;
  if (storefronts.length === 0) return null;

  return (
    <section className="border-2 border-sniffy-ink bg-sniffy-paper p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
          <Globe size={14} aria-hidden />
          Localization across storefronts
        </h3>
        {overallGapScore !== null ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-sniffy-ink-mute">
            overall gap score · {overallGapScore}/100
          </span>
        ) : null}
      </div>

      {unlocalizedCount > 0 ? (
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
            <span className="font-semibold">
              {unlocalizedCount} of {storefronts.length} storefronts
            </span>{" "}
            ship an English description in a non-English market. Translation
            typically yields a 15–30% organic install lift in those regions.
          </span>
        </div>
      ) : null}

      {titleVariants.length > 1 ? (
        <p className="mt-2 font-mono text-[11px] text-sniffy-ink-mute">
          <span className="text-sniffy-ink">{titleVariants.length}</span>{" "}
          distinct title variants across queried storefronts.
        </p>
      ) : null}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className="border-b-2 border-sniffy-ink text-left uppercase tracking-[0.14em] text-sniffy-ink-mute">
              <th className="py-2 pr-3">Storefront</th>
              <th className="py-2 pr-3">Title</th>
              <th className="py-2 pr-3">Language</th>
              <th className="py-2 pr-3">Localized</th>
              <th className="py-2 pr-3">Gap</th>
              <th className="py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {storefronts.map((s) => (
              <tr
                key={s.country}
                className="border-b border-sniffy-rule align-top"
              >
                <td className="py-2 pr-3 font-semibold text-sniffy-ink">
                  {s.country}
                </td>
                <td className="py-2 pr-3 text-sniffy-ink-2">
                  {s.title || (
                    <span className="text-sniffy-ink-mute">—</span>
                  )}
                </td>
                <td className="py-2 pr-3 uppercase tracking-[0.12em] text-sniffy-ink-mute">
                  {s.descriptionLanguage ?? "—"}
                  {s.expectedLanguages.length > 0 ? (
                    <span className="ml-1 text-[10px]">
                      / exp {s.expectedLanguages.join(",")}
                    </span>
                  ) : null}
                </td>
                <td className="py-2 pr-3">
                  <span
                    className="inline-flex items-center gap-1"
                    title={
                      s.localized === null
                        ? "Description too short or detection inconclusive"
                        : s.localized
                          ? "Description language matches storefront"
                          : "Description language does NOT match storefront"
                    }
                  >
                    {LOCALIZED_ICON[localizedKey(s.localized)]}
                    <span className="text-[10px] uppercase tracking-[0.14em] text-sniffy-ink-mute">
                      {s.localized === null
                        ? "unknown"
                        : s.localized
                          ? "match"
                          : "mismatch"}
                    </span>
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <span
                    className="inline-flex items-center gap-2"
                    title={`gapScore ${s.gapScore}/100`}
                  >
                    <span className="relative inline-block h-2 w-16 border border-sniffy-ink bg-sniffy-paper-2">
                      <span
                        className={cn("absolute inset-y-0 left-0", gapBarTint(s.gapScore))}
                        style={{ width: `${s.gapScore}%` }}
                        aria-hidden
                      />
                    </span>
                    <span className="tabular-nums text-sniffy-ink">
                      {s.gapScore}
                    </span>
                  </span>
                </td>
                <td className="py-2 text-sniffy-ink-2">
                  {s.error ? (
                    <span className="text-sniffy-warn">{s.error}</span>
                  ) : s.descriptionLength < analysis.detectionMinChars ? (
                    <span className="text-sniffy-ink-mute">
                      description too short for detection
                    </span>
                  ) : (
                    <span className="text-sniffy-ink-mute">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
