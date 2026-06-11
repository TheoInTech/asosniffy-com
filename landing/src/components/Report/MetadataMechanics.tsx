import type {
  DiagnosePaidResponse,
  MechanicsFinding,
  ReviewRiskFlag,
} from "@sniffy/scraper/schemas";
import { AlertTriangle } from "lucide-react";
import { ProvenanceIcon } from "@/components/ProvenanceIcon";
import { cn } from "@/lib/cn";

// Wave 1 (roadmap 1.4) — deterministic iOS metadata mechanics lint.
// Simulation of documented indexing rules over public metadata, NOT a live
// measurement (provenance "inferred"). The epistemic split is the feature:
// every finding is labelled "Apple-documented" or "community-tested" so the
// founder knows which rules are store policy and which are practitioner lore.
// Renders nothing when metadataMechanics is null (android runs, or no
// AppRecord fetched).

const KIND_LABEL: Record<MechanicsFinding["kind"], string> = {
  "cross-field-duplicate": "cross-field duplicate",
  "plural-duplicate": "plural duplicate",
  "camelcase-hidden-split": "camelCase hidden split",
  "auto-indexed-word": "auto-indexed word",
  "keyword-field-format": "keyword-field format",
};

const FIELD_LABEL: Record<MechanicsFinding["field"], string> = {
  title: "title",
  subtitle: "subtitle",
  keywordsField: "keyword field",
};

// Apple-documented rules are store policy (teal); community-tested rules are
// practitioner lore shipped honestly as such (bordered, muted).
function RuleProvenanceBadge({
  value,
}: {
  value: MechanicsFinding["ruleProvenance"];
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap border border-sniffy-ink px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]",
        value === "apple-documented"
          ? "bg-sniffy-teal text-sniffy-ink"
          : "bg-sniffy-paper text-sniffy-ink-mute",
      )}
      title={
        value === "apple-documented"
          ? "Documented Apple indexing behavior"
          : "Community-tested claim, not store-documented policy"
      }
    >
      {value === "apple-documented" ? "Apple-documented" : "community-tested"}
    </span>
  );
}

function wastedTint(total: number): string {
  if (total === 0) return "bg-sniffy-teal";
  if (total < 10) return "bg-sniffy-yellow";
  return "bg-sniffy-warn text-sniffy-paper";
}

function ReviewSafetyChip({ flag }: { flag: ReviewRiskFlag }) {
  return (
    <li
      className={cn(
        "inline-flex items-start gap-1.5 border-2 px-2 py-1 font-mono text-[11px]",
        flag.severity === "likely-violation"
          ? "border-sniffy-warn bg-sniffy-warn text-sniffy-paper"
          : "border-sniffy-warn bg-sniffy-paper-2 text-sniffy-ink",
      )}
    >
      <AlertTriangle
        size={12}
        aria-hidden
        className={cn(
          "mt-0.5 shrink-0",
          flag.severity === "likely-violation"
            ? "text-sniffy-paper"
            : "text-sniffy-warn",
        )}
      />
      <span>
        {flag.field}: &quot;{flag.term}&quot; — {flag.rule}
      </span>
    </li>
  );
}

export function MetadataMechanicsCard({
  report,
}: {
  report: DiagnosePaidResponse;
}) {
  const mechanics = report.metadataMechanics;
  if (mechanics === null) return null;

  return (
    <section className="border-2 border-sniffy-ink bg-sniffy-paper p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
          Metadata mechanics
        </h3>
        <ProvenanceIcon value={mechanics.provenance} showLabel />
      </div>

      <div className="mt-3 flex items-center gap-4">
        <div
          className={cn(
            "flex h-20 w-20 flex-col items-center justify-center border-2 border-sniffy-ink",
            wastedTint(mechanics.totalCharsWasted),
          )}
          aria-label={`${mechanics.totalCharsWasted} indexed characters wasted`}
        >
          <span className="font-display text-2xl font-semibold tabular-nums">
            {mechanics.totalCharsWasted}
          </span>
        </div>
        <dl className="flex-1 grid grid-cols-1 gap-x-4 gap-y-1 font-mono text-xs sm:grid-cols-3">
          <div>
            <dt className="text-[10px] uppercase tracking-[0.14em] text-sniffy-ink-mute">
              Chars wasted
            </dt>
            <dd className="text-sniffy-ink">
              across {FIELD_LABEL.title}, {FIELD_LABEL.subtitle}
              {mechanics.keywordsFieldProvided ? " + keyword field" : ""}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.14em] text-sniffy-ink-mute">
              Distinct indexed tokens
            </dt>
            <dd className="font-display text-base font-semibold text-sniffy-ink">
              {mechanics.distinctIndexedTokens}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.14em] text-sniffy-ink-mute">
              Phrase permutations
            </dt>
            <dd className="font-display text-base font-semibold tabular-nums text-sniffy-ink">
              <span>{mechanics.phrasePermutations}</span>
              <span className="text-sniffy-ink-mute"> → </span>
              <span>{mechanics.phrasePermutationsIfFixed}</span>
              <span className="ml-1 font-mono text-[10px] font-normal uppercase tracking-[0.12em] text-sniffy-ink-mute">
                if fixed
              </span>
            </dd>
          </div>
        </dl>
      </div>

      {!mechanics.keywordsFieldProvided ? (
        <p className="mt-2 font-mono text-[11px] text-sniffy-ink-mute">
          Lint covers title + subtitle only — paste in your App Store Connect
          keyword field for full calibration.
        </p>
      ) : null}

      {mechanics.findings.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className="border-b-2 border-sniffy-ink text-left uppercase tracking-[0.14em] text-sniffy-ink-mute">
                <th className="py-2 pr-3">Finding</th>
                <th className="py-2 pr-3">Token</th>
                <th className="py-2 pr-3">Field</th>
                <th className="py-2 pr-3">Wasted</th>
                <th className="py-2">Rule</th>
              </tr>
            </thead>
            <tbody>
              {mechanics.findings.map((f) => (
                <tr
                  key={`${f.kind}-${f.field}-${f.token}`}
                  className="border-b border-sniffy-rule align-top"
                >
                  <td className="py-2 pr-3">
                    <span className="text-sniffy-ink">{KIND_LABEL[f.kind]}</span>
                    <p className="mt-0.5 text-[10px] leading-snug text-sniffy-ink-mute">
                      {f.detail}
                    </p>
                  </td>
                  <td className="py-2 pr-3 font-semibold text-sniffy-ink">
                    {f.token}
                  </td>
                  <td className="py-2 pr-3 text-sniffy-ink-mute">
                    {FIELD_LABEL[f.field]}
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-sniffy-ink">
                    {f.charsWasted}
                  </td>
                  <td className="py-2">
                    <RuleProvenanceBadge value={f.ruleProvenance} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 font-mono text-xs text-sniffy-ink-mute">
          No mechanics findings — no wasted indexed characters detected in the
          fields we could see.
        </p>
      )}

      {mechanics.reviewSafety.length > 0 ? (
        <div className="mt-3">
          <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
            Review safety
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {mechanics.reviewSafety.map((flag) => (
              <ReviewSafetyChip
                key={`${flag.field}-${flag.term}`}
                flag={flag}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {mechanics.notes.length > 0 ? (
        <ul className="mt-3 space-y-0.5 font-mono text-[10px] text-sniffy-ink-mute">
          {mechanics.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
