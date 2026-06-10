import type { KeywordDiagnosisItem } from "@sniffy/scraper/schemas";
import { cn } from "@/lib/cn";

// Phase 3 — Apple Search Ads popularity score (5-100) surfaced as a fill bar
// with a source label. ASA-corroborated demand gets a teal fill; heuristic
// fallback gets a muted fill so consumers can see the confidence gap. When
// the score is null (provider disabled / not_found), the bar collapses to
// a single "—" character with a tooltip explaining the source.

interface Props {
  score: KeywordDiagnosisItem["popularityScore"]; // number | null
  source: KeywordDiagnosisItem["popularitySource"]; // "apple-search-ads" | "heuristic"
  asOf: KeywordDiagnosisItem["popularityAsOf"]; // ISO string | null
  className?: string;
}

const SOURCE_LABEL: Record<Props["source"], string> = {
  "apple-search-ads": "Apple Search Ads",
  // Wave 1 — documented public-signal blend (obs-1): result depth, leader
  // strength, title-match density, market depth, specificity, exact-phrase.
  // Sniffy's own estimate, provenance inferred — NOT Apple's number.
  "observable-signals": "Observable signals (obs-1)",
  heuristic: "Heuristic",
};

export function PopularityBar({ score, source, asOf, className }: Props) {
  // Null score: no popularity data for this keyword (either ASA disabled or
  // the keyword didn't return a record). Show "—" instead of an empty bar so
  // consumers don't read it as "popularity = 0".
  if (score === null) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-sniffy-ink-mute",
          className,
        )}
        title={`No popularity signal (${SOURCE_LABEL[source]})`}
      >
        <span aria-hidden className="font-mono">
          —
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
          {source === "apple-search-ads" ? "no data" : SOURCE_LABEL[source] === "Heuristic" ? "heuristic" : "obs"}
        </span>
      </span>
    );
  }

  // Apple's popularity scale is 5–100. Normalize to 0–100 for the bar.
  const pct = Math.max(0, Math.min(100, ((score - 5) / 95) * 100));
  const tint =
    source === "apple-search-ads"
      ? "bg-sniffy-teal"
      : source === "observable-signals"
        ? "bg-sniffy-rule"
        : "bg-sniffy-paper-2 border border-sniffy-rule";
  const titleParts = [
    `${score}/100 ${SOURCE_LABEL[source]}`,
    asOf ? `as of ${new Date(asOf).toLocaleDateString()}` : null,
  ].filter(Boolean);

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      title={titleParts.join(" · ")}
    >
      <span className="relative inline-block h-2 w-16 border border-sniffy-ink bg-sniffy-paper-2">
        <span
          className={cn("absolute inset-y-0 left-0", tint)}
          style={{ width: `${pct}%` }}
          aria-hidden
        />
      </span>
      <span className="font-mono text-[10px] tabular-nums text-sniffy-ink">
        {score}
      </span>
      {source !== "apple-search-ads" ? (
        <span
          className="font-mono text-[9px] uppercase tracking-[0.12em] text-sniffy-ink-mute"
          aria-hidden
        >
          {source === "observable-signals" ? "obs" : "heur"}
        </span>
      ) : null}
      <span className="sr-only">
        {`Popularity ${score} out of 100, ${SOURCE_LABEL[source]}`}
      </span>
    </span>
  );
}
