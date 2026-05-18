import type {
  DiagnosePaidResponse,
  KeywordDiagnosisItem,
} from "@sniffy/scraper/schemas";
import { ProvenanceIcon } from "@/components/ProvenanceIcon";

const BUCKET_TINT: Record<KeywordDiagnosisItem["rankBucket"], string> = {
  "1-10": "bg-sniffy-teal text-sniffy-ink",
  "11-30": "bg-sniffy-yellow text-sniffy-ink",
  "31-50": "bg-sniffy-paper-2 text-sniffy-ink",
  "51-100": "bg-sniffy-paper-2 text-sniffy-ink",
  "100+": "bg-sniffy-paper-2 text-sniffy-ink",
  not_found: "bg-sniffy-warn text-sniffy-paper",
};

export function KeywordDiagnosisTable({
  report,
}: {
  report: DiagnosePaidResponse;
}) {
  return (
    <section className="border-2 border-sniffy-ink bg-sniffy-paper p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
          Keyword diagnosis
        </h3>
        <ProvenanceIcon value={report.dataProvenance.keywordRank} showLabel />
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className="border-b-2 border-sniffy-ink text-left uppercase tracking-[0.14em] text-sniffy-ink-mute">
              <th className="py-2 pr-3">Keyword</th>
              <th className="py-2 pr-3">Rank</th>
              <th className="py-2 pr-3">Intent</th>
              <th className="py-2 pr-3">Confidence</th>
              <th className="py-2">Recommendation</th>
            </tr>
          </thead>
          <tbody>
            {report.keywordDiagnosis.map((row) => (
              <tr key={row.keyword} className="border-b border-sniffy-rule">
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
                <td className="py-2 pr-3 text-sniffy-ink-2">
                  {(row.intentScore * 100).toFixed(0)}%
                </td>
                <td className="py-2 pr-3">
                  <span className="inline-flex items-center gap-1 text-sniffy-ink-mute">
                    <ProvenanceIcon value={row.provenance} />
                    {row.confidence}
                  </span>
                </td>
                <td className="py-2 text-sniffy-ink-2">{row.recommendation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
