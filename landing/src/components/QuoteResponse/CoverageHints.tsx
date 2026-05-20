import type {
  Confidence,
  Coverage,
  CoverageProviderError,
  CoverageStatus,
} from "@sniffy/scraper/schemas";
import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/cn";

// Restrict the table rows to the Confidence-typed dimensions of `Coverage`.
// Phase 1 added `status` and `providerErrors` to the schema — those render
// separately below the bars.
type ConfidenceRowKey = "appMetadata" | "keywordRank" | "competitorTrail" | "reviews";

const ROWS: Array<{ key: ConfidenceRowKey; label: string }> = [
  { key: "appMetadata", label: "App metadata" },
  { key: "keywordRank", label: "Keyword rank" },
  { key: "competitorTrail", label: "Competitor trail" },
  { key: "reviews", label: "Reviews signal" },
];

const PILL: Record<Confidence, string> = {
  high: "w-full bg-sniffy-teal",
  medium: "w-2/3 bg-sniffy-yellow",
  low: "w-1/3 bg-sniffy-warn",
};

// Phase 1 — top-of-card banner explaining the overall coverage state.
const STATUS_COPY: Record<CoverageStatus, { tone: string; text: string } | null> = {
  ok: null,
  partial:
    {
      tone: "border-sniffy-yellow bg-sniffy-paper-2 text-sniffy-ink",
      text: "Partial coverage — some providers responded, others didn't. Affected rows are intentionally empty (never fabricated).",
    },
  degraded:
    {
      tone: "border-sniffy-warn bg-sniffy-paper-2 text-sniffy-ink",
      text: "Degraded coverage — every live provider returned an error this run. We never substitute fake data; retry in a minute.",
    },
  fixture_only:
    {
      tone: "border-sniffy-rule bg-sniffy-paper-2 text-sniffy-ink-2",
      text: "Sample data — this response is from the demo fixture, not your live store.",
    },
};

// Map kind strings to UI-friendly snippets. Reasonable defaults; the
// server-supplied `message` is the source of truth and shown verbatim.
const KIND_HINT: Record<CoverageProviderError["kind"], string> = {
  rate_limited: "rate-limited",
  schema_drift: "schema drift",
  not_found: "not found",
  upstream_unavailable: "unavailable",
  network_error: "network error",
  partial: "partial",
};

export function CoverageHints({ coverage }: { coverage: Coverage }) {
  const status = coverage.status ?? "ok";
  const banner = STATUS_COPY[status];
  const errors = coverage.providerErrors ?? [];

  return (
    <div className="border-2 border-sniffy-ink bg-sniffy-paper p-4">
      <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
        Coverage estimate
      </p>

      {banner ? (
        <div
          className={cn(
            "mt-2 flex items-start gap-2 border-2 px-2 py-1.5 font-mono text-[11px] leading-snug",
            banner.tone,
          )}
          role="status"
        >
          <Info size={12} aria-hidden className="mt-0.5 shrink-0" />
          <span>{banner.text}</span>
        </div>
      ) : null}

      <ul className="mt-3 space-y-2">
        {ROWS.map((row) => {
          const value: Confidence = coverage[row.key];
          return (
            <li key={row.key}>
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="text-sniffy-ink">{row.label}</span>
                <span className="uppercase tracking-[0.16em] text-sniffy-ink-mute">
                  {value}
                </span>
              </div>
              <div className="mt-1 h-2 w-full border border-sniffy-ink bg-sniffy-paper-2">
                <div className={cn("h-full", PILL[value])} />
              </div>
            </li>
          );
        })}
      </ul>

      {errors.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-sniffy-rule pt-2 font-mono text-[11px] text-sniffy-ink-2">
          {errors.map((e, idx) => (
            <li
              key={`${e.provider}-${idx}`}
              className="flex items-start gap-1.5"
            >
              <AlertTriangle
                size={12}
                aria-hidden
                className="mt-0.5 shrink-0 text-sniffy-warn"
              />
              <span>
                <span className="font-semibold text-sniffy-ink">
                  {e.provider}
                </span>{" "}
                <span className="text-sniffy-ink-mute">
                  ({KIND_HINT[e.kind]})
                </span>{" "}
                <span>{e.message}</span>
                {e.retryAfterSec !== undefined ? (
                  <span className="text-sniffy-ink-mute">
                    {" "}
                    · retry in {e.retryAfterSec}s
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
