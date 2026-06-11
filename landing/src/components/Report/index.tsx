"use client";

import Image from "next/image";
import type { DiagnosePaidResponse } from "@sniffy/scraper/schemas";
import { SpendTrail } from "@/components/SpendTrail";
import type { ProtocolTraceEntry } from "@/lib/api/errors";
import { AiVisibilityCard } from "./AiVisibility";
import { CompetitorTrail } from "./CompetitorTrail";
import { ConversionAuditCard } from "./ConversionAudit";
import { KeywordDiagnosisTable } from "./KeywordDiagnosisTable";
import { LocalizationAnalysis } from "./LocalizationAnalysis";
import { MetadataMechanicsCard } from "./MetadataMechanics";
import { MetadataScoreCard } from "./MetadataScore";
import { WebDiscoverabilityCard } from "./WebDiscoverability";
import { ReadyToPaste } from "./ReadyToPaste";
import { Recommendations } from "./Recommendations";
import { Regressions } from "./Regressions";
import { SuggestedKeywords } from "./SuggestedKeywords";
import { Summary } from "./Summary";
import { TargetAppSignals } from "./TargetAppSignals";
import type { ReportScope } from "./types";

export interface ReportProps {
  report: DiagnosePaidResponse;
  showReveal?: boolean;
  protocolTrace?: ProtocolTraceEntry[];
  // Phase 4 — scope (store/country/appId) is required to enable the lazy
  // TrendSparkline in expanded keyword rows. Without it the row expands
  // but the sparkline renders "history unavailable for this session."
  scope?: ReportScope;
  // Phase 3 — "Add to next sniff" callback wired into SuggestedKeywords cards.
  // Parent (HomeView) rebuilds the QuoteRequest with the chosen keyword.
  onAddKeyword?: (keyword: string) => void;
}

export function Report({
  report,
  showReveal = true,
  protocolTrace,
  scope,
  onAddKeyword,
}: ReportProps) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold uppercase tracking-[0.14em] text-sniffy-ink">
          Sniff trail · {report.reportVersion}
        </h2>
        {showReveal ? (
          <Image
            src="/sniffy/unlock.png"
            alt=""
            width={72}
            height={72}
          />
        ) : null}
      </div>
      {/* Phase 4 — regressions surface as the very first thing the founder
          sees when present. Renders nothing on cold start. */}
      <Regressions report={report} />
      <Summary report={report} />
      <SpendTrail report={report} protocolTrace={protocolTrace} />
      {/* Phase 6 — target-app momentum (ratings-per-day + growing/steady/
          declining). Renders nothing when targetAppSignals is null. */}
      <TargetAppSignals report={report} />
      {/* Wave 1 — rating economics + reset lever + experiment plan, all
          inferred from public signals. Sits next to the momentum block so
          the ratings story reads top-to-bottom. Renders nothing when
          conversionAudit is null. */}
      <ConversionAuditCard report={report} />
      <KeywordDiagnosisTable report={report} scope={scope} />
      <CompetitorTrail report={report} scope={scope} />
      {/* Phase 5 — multi-storefront localization gap analysis. Renders nothing
          when localizationAnalysis is null (LOCALIZATION_ENABLED=false). */}
      <LocalizationAnalysis report={report} />
      <MetadataScoreCard report={report} />
      {/* Wave 1 — deterministic iOS indexing-mechanics lint, directly under
          the score card it explains. Renders nothing on android runs. */}
      <MetadataMechanicsCard report={report} />
      {/* Wave 2 — the off-store pair: LLM share-of-voice + marketing-site
          plumbing facts. Both render nothing when their flags are off. */}
      <AiVisibilityCard report={report} />
      <WebDiscoverabilityCard report={report} />
      <Recommendations report={report} />
      {/* Phase 3 — review-frequency + competitor-overlap keyword suggestions.
          Renders nothing when suggestedKeywords is empty. */}
      <SuggestedKeywords report={report} onAddKeyword={onAddKeyword} />
      <ReadyToPaste report={report} />
    </section>
  );
}
