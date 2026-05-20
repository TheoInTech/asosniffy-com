"use client";

import Image from "next/image";
import type { DiagnosePaidResponse } from "@sniffy/scraper/schemas";
import { SpendTrail } from "@/components/SpendTrail";
import type { ProtocolTraceEntry } from "@/lib/api/errors";
import { CompetitorTrail } from "./CompetitorTrail";
import { KeywordDiagnosisTable } from "./KeywordDiagnosisTable";
import { MetadataScoreCard } from "./MetadataScore";
import { ReadyToPaste } from "./ReadyToPaste";
import { Recommendations } from "./Recommendations";
import { Summary } from "./Summary";

export interface ReportProps {
  report: DiagnosePaidResponse;
  showReveal?: boolean;
  protocolTrace?: ProtocolTraceEntry[];
}

export function Report({ report, showReveal = true, protocolTrace }: ReportProps) {
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
      <Summary report={report} />
      <SpendTrail report={report} protocolTrace={protocolTrace} />
      <KeywordDiagnosisTable report={report} />
      <CompetitorTrail report={report} />
      <MetadataScoreCard report={report} />
      <Recommendations report={report} />
      <ReadyToPaste report={report} />
    </section>
  );
}
