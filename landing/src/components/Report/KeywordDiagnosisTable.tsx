"use client";

import { useState } from "react";
import type {
  DiagnosePaidResponse,
  KeywordDiagnosisItem,
} from "@sniffy/scraper/schemas";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ProvenanceIcon } from "@/components/ProvenanceIcon";
import type { ReportScope } from "./types";
import { PopularityBar } from "./PopularityBar";
import { TrendBadge } from "./TrendBadge";
import { TrendSparkline } from "./TrendSparkline";

const BUCKET_TINT: Record<KeywordDiagnosisItem["rankBucket"], string> = {
  "1-10": "bg-sniffy-teal text-sniffy-ink",
  "11-30": "bg-sniffy-yellow text-sniffy-ink",
  "31-50": "bg-sniffy-paper-2 text-sniffy-ink",
  "51-100": "bg-sniffy-paper-2 text-sniffy-ink",
  "100+": "bg-sniffy-paper-2 text-sniffy-ink",
  not_found: "bg-sniffy-warn text-sniffy-paper",
};

// Exported so Regressions can re-use the same tint mapping for previous /
// current bucket badges (visual consistency across sections).
export { BUCKET_TINT };

interface Props {
  report: DiagnosePaidResponse;
  // Phase 4 — when present, expanding a row fetches the keyword's history
  // via /api/v1/aso/history (HMAC-gated by report.historySignature). When
  // absent, the row still expands but the sparkline shows
  // "history unavailable in this environment".
  scope?: ReportScope;
}

export function KeywordDiagnosisTable({ report, scope }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const canFetchHistory =
    scope !== undefined && report.historySignature.length > 0;

  return (
    <section className="border-2 border-sniffy-ink bg-sniffy-paper p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
          Keyword diagnosis
        </h3>
        <ProvenanceIcon value={report.dataProvenance.keywordRank} showLabel />
      </div>

      {/* md+ : horizontal table */}
      <div className="mt-3 hidden overflow-x-auto md:block">
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className="border-b-2 border-sniffy-ink text-left uppercase tracking-[0.14em] text-sniffy-ink-mute">
              <th className="py-2 pr-2 w-6"></th>
              <th className="py-2 pr-3">Keyword</th>
              <th className="py-2 pr-3">Rank</th>
              <th className="py-2 pr-3">Trend</th>
              <th className="py-2 pr-3">Popularity</th>
              <th className="py-2 pr-3">Difficulty</th>
              <th className="py-2 pr-3">Intent</th>
              <th className="py-2 pr-3">Confidence</th>
              <th className="py-2 pr-3">Related</th>
              <th className="py-2">Recommendation</th>
            </tr>
          </thead>
          <tbody>
            {report.keywordDiagnosis.map((row) => {
              const isOpen = expanded === row.keyword;
              return (
                <Row
                  key={row.keyword}
                  row={row}
                  isOpen={isOpen}
                  onToggle={() => setExpanded(isOpen ? null : row.keyword)}
                  scope={scope}
                  signature={report.historySignature}
                  sniffId={report.sniffId}
                  canFetchHistory={canFetchHistory}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {/* sub-md : stacked cards (table is too cramped under 640px) */}
      <ul className="mt-3 grid gap-3 md:hidden">
        {report.keywordDiagnosis.map((row) => (
          <li
            key={row.keyword}
            className="border border-sniffy-ink bg-sniffy-paper-2 p-3 font-mono text-xs"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-display text-sm font-semibold text-sniffy-ink">
                {row.keyword}
              </p>
              <span
                className={`inline-flex items-center border-2 border-sniffy-ink px-1.5 py-0.5 ${BUCKET_TINT[row.rankBucket]}`}
              >
                {row.rankBucket}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
              <dt className="text-sniffy-ink-mute">Trend</dt>
              <dd>
                <TrendBadge trend={row.trend} />
              </dd>
              <dt className="text-sniffy-ink-mute">Popularity</dt>
              <dd>
                <PopularityBar
                  score={row.popularityScore}
                  source={row.popularitySource}
                  asOf={row.popularityAsOf}
                />
              </dd>
              <dt className="text-sniffy-ink-mute">Difficulty</dt>
              <dd>
                <DifficultyBadge
                  difficulty={row.difficulty}
                  isFallback={row.difficultyIsFallback}
                />
              </dd>
              <dt className="text-sniffy-ink-mute">Listing match</dt>
              <dd className="text-sniffy-ink-2 text-[11px]">
                {describeMatchKind(row.matchKind)}
              </dd>
              <dt className="text-sniffy-ink-mute">Intent</dt>
              <dd className="text-sniffy-ink-2">
                {(row.intentScore * 100).toFixed(0)}%
              </dd>
              <dt className="text-sniffy-ink-mute">Confidence</dt>
              <dd>
                <span className="inline-flex items-center gap-1 text-sniffy-ink-mute">
                  <ProvenanceIcon value={row.provenance} />
                  {row.confidence}
                </span>
              </dd>
            </dl>
            {row.relatedTerms.length > 0 ? (
              <div className="mt-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-sniffy-ink-mute">
                  Related
                </p>
                <p className="mt-0.5 flex flex-wrap gap-1">
                  {row.relatedTerms.slice(0, 5).map((term) => (
                    <span
                      key={term}
                      className="border border-sniffy-rule px-1 py-0.5 text-[10px] text-sniffy-ink-2"
                    >
                      {term}
                    </span>
                  ))}
                </p>
              </div>
            ) : null}
            <p className="mt-2 text-sniffy-ink-2">{row.recommendation}</p>
            {canFetchHistory && scope ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-[11px] text-sniffy-ink-mute hover:text-sniffy-ink">
                  Show rank history
                </summary>
                <div className="mt-2">
                  <TrendSparkline
                    input={{
                      sniffId: report.sniffId,
                      store: scope.store,
                      country: scope.country,
                      appId: scope.appId,
                      keyword: row.keyword,
                      signature: report.historySignature,
                      window: "30d",
                    }}
                    enabled
                  />
                </div>
              </details>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

interface RowProps {
  row: KeywordDiagnosisItem;
  isOpen: boolean;
  onToggle: () => void;
  scope: ReportScope | undefined;
  signature: string;
  sniffId: string;
  canFetchHistory: boolean;
}

function Row({
  row,
  isOpen,
  onToggle,
  scope,
  signature,
  sniffId,
  canFetchHistory,
}: RowProps) {
  return (
    <>
      <tr
        className="border-b border-sniffy-rule align-top cursor-pointer hover:bg-sniffy-paper-2"
        onClick={onToggle}
      >
        <td className="py-2 pr-2 text-sniffy-ink-mute">
          {isOpen ? (
            <ChevronDown size={12} aria-label="Collapse" />
          ) : (
            <ChevronRight size={12} aria-label="Expand" />
          )}
        </td>
        <td className="py-2 pr-3 font-semibold text-sniffy-ink">
          {row.keyword}
        </td>
        <td className="py-2 pr-3">
          <span
            className={`inline-flex items-center border-2 border-sniffy-ink px-1.5 py-0.5 ${BUCKET_TINT[row.rankBucket]}`}
          >
            {row.rankBucket}
          </span>
        </td>
        <td className="py-2 pr-3">
          <TrendBadge trend={row.trend} />
        </td>
        <td className="py-2 pr-3">
          <PopularityBar
            score={row.popularityScore}
            source={row.popularitySource}
            asOf={row.popularityAsOf}
          />
        </td>
        <td className="py-2 pr-3">
          <DifficultyBadge
            difficulty={row.difficulty}
            isFallback={row.difficultyIsFallback}
          />
        </td>
        <td className="py-2 pr-3 text-sniffy-ink-2">
          {(row.intentScore * 100).toFixed(0)}%
        </td>
        <td className="py-2 pr-3">
          <span className="inline-flex items-center gap-1 text-sniffy-ink-mute">
            <ProvenanceIcon value={row.provenance} />
            {row.confidence}
          </span>
        </td>
        <td className="py-2 pr-3">
          {row.relatedTerms.length === 0 ? (
            <span className="text-sniffy-ink-mute">—</span>
          ) : (
            <span className="flex flex-wrap gap-1">
              {row.relatedTerms.slice(0, 5).map((term) => (
                <span
                  key={term}
                  className="border border-sniffy-rule px-1 py-0.5 text-[10px] text-sniffy-ink-2"
                >
                  {term}
                </span>
              ))}
            </span>
          )}
        </td>
        <td className="py-2 text-sniffy-ink-2">{row.recommendation}</td>
      </tr>
      {isOpen ? (
        <tr>
          <td colSpan={10} className="border-b border-sniffy-rule bg-sniffy-paper-2 p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
                  Rank history (30d)
                </p>
                <div className="mt-2">
                  {canFetchHistory && scope ? (
                    <TrendSparkline
                      input={{
                        sniffId,
                        store: scope.store,
                        country: scope.country,
                        appId: scope.appId,
                        keyword: row.keyword,
                        signature,
                        window: "30d",
                      }}
                      enabled
                    />
                  ) : (
                    <p className="font-mono text-[11px] text-sniffy-ink-mute">
                      History unavailable for this session.
                    </p>
                  )}
                </div>
              </div>
              <div>
                <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
                  Popularity context
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
                  <dt className="text-sniffy-ink-mute">Source</dt>
                  <dd className="text-sniffy-ink">
                    {row.popularitySource === "apple-search-ads"
                      ? "Apple Search Ads"
                      : "Heuristic"}
                  </dd>
                  <dt className="text-sniffy-ink-mute">As of</dt>
                  <dd className="text-sniffy-ink">
                    {row.popularityAsOf
                      ? new Date(row.popularityAsOf).toLocaleString()
                      : "—"}
                  </dd>
                  <dt className="text-sniffy-ink-mute">Searched depth</dt>
                  <dd className="text-sniffy-ink">
                    {row.trend ? "(see history)" : "first sniff"}
                  </dd>
                </dl>
                {row.relatedTerms.length > 0 ? (
                  <div className="mt-2">
                    <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
                      Related (gplay.suggest)
                    </p>
                    <p className="mt-1 flex flex-wrap gap-1 font-mono text-[10px]">
                      {row.relatedTerms.slice(0, 8).map((term) => (
                        <span
                          key={term}
                          className="border border-sniffy-rule px-1 py-0.5 text-sniffy-ink-2"
                        >
                          {term}
                        </span>
                      ))}
                    </p>
                  </div>
                ) : null}
                <div className="mt-2">
                  <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
                    Competitive context
                  </p>
                  <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
                    <dt className="text-sniffy-ink-mute">Difficulty</dt>
                    <dd className="text-sniffy-ink">
                      <DifficultyBadge
                        difficulty={row.difficulty}
                        isFallback={row.difficultyIsFallback}
                      />
                    </dd>
                    <dt className="text-sniffy-ink-mute">Weakest top-5</dt>
                    <dd className="text-sniffy-ink">
                      {row.minDifficulty !== null
                        ? `${row.minDifficulty}/100`
                        : "—"}
                    </dd>
                    <dt className="text-sniffy-ink-mute">Listing match</dt>
                    <dd className="text-sniffy-ink">
                      {describeMatchKind(row.matchKind)}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

// Color-coded difficulty pill. Green 1-33, amber 34-66, red 67-100. Returns
// an honest "—" when the top-five gate tripped (difficulty is null and
// difficultyIsFallback is true) — we don't fake the number.
function DifficultyBadge({
  difficulty,
  isFallback,
}: {
  difficulty: number | null;
  isFallback: boolean;
}) {
  if (difficulty === null || isFallback) {
    return <span className="text-sniffy-ink-mute">—</span>;
  }
  const tint =
    difficulty >= 67
      ? "bg-sniffy-warn text-sniffy-paper"
      : difficulty >= 34
        ? "bg-sniffy-yellow text-sniffy-ink"
        : "bg-sniffy-teal text-sniffy-ink";
  return (
    <span
      className={`inline-flex items-center border-2 border-sniffy-ink px-1.5 py-0.5 ${tint}`}
      title={
        difficulty >= 67
          ? "Hard to rank — strong top-5"
          : difficulty >= 34
            ? "Moderate — beatable with effort"
            : "Soft — weak top-5"
      }
    >
      {difficulty}
    </span>
  );
}

function describeMatchKind(matchKind: KeywordDiagnosisItem["matchKind"]): string {
  switch (matchKind) {
    case "titleExactPhrase":
      return "Title (exact phrase)";
    case "titleAllWords":
      return "Title (separated words)";
    case "subtitleExactPhrase":
      return "Subtitle (exact phrase)";
    case "subtitleAllWords":
      return "Subtitle (separated words)";
    case "combinedPhrase":
      return "Spans title + subtitle";
    case "none":
      return "Not on listing";
  }
}
