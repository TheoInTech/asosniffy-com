import type { Confidence, Coverage } from "@sniffy/scraper/schemas";
import { cn } from "@/lib/cn";

const ROWS: Array<{ key: keyof Coverage; label: string }> = [
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

export function CoverageHints({ coverage }: { coverage: Coverage }) {
  return (
    <div className="border-2 border-sniffy-ink bg-sniffy-paper p-4">
      <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
        Coverage estimate
      </p>
      <ul className="mt-3 space-y-2">
        {ROWS.map((row) => {
          const value = coverage[row.key];
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
    </div>
  );
}
