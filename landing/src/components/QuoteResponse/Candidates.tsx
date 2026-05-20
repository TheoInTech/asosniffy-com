"use client";

import Image from "next/image";
import type { ShallowScan } from "@sniffy/scraper/schemas";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/cn";

// Phase 1 — shallowScan.candidates surfaces ambiguous app-name detection.
// Sniffy's detect.ts runs a similarity scorer (Levenshtein + Jaccard + bundleId
// + popularity) and emits up to 5 alternatives whenever the top match scores
// below the "high" identity confidence threshold. The UI's job: ask the user
// "did you mean…?" before they pay for a /diagnose against the wrong app.
//
// Renders nothing when detectionConfidence is "high" — the scoring is
// confident enough that we don't waste vertical space on confirmation.

interface Props {
  shallowScan: ShallowScan;
  detectedAppId: string;
  onSelect: (appId: string) => void;
  disabled?: boolean;
}

export function Candidates({
  shallowScan,
  detectedAppId,
  onSelect,
  disabled,
}: Props) {
  const { detectionConfidence, candidates } = shallowScan;
  if (detectionConfidence === "high") return null;
  if (candidates.length === 0) return null;

  return (
    <section className="border-2 border-sniffy-yellow bg-sniffy-paper-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
          Did you mean…?
        </p>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-sniffy-ink-mute">
          confidence: {detectionConfidence}
        </span>
      </div>
      <p className="mt-1 font-mono text-xs text-sniffy-ink-2">
        We weren't fully sure about the app match. Pick one to re-run the sniff
        before paying.
      </p>
      <ul className="mt-3 grid gap-2 md:grid-cols-2">
        {candidates.map((c) => {
          const isSelected = c.id === detectedAppId;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                disabled={disabled || isSelected}
                className={cn(
                  "flex w-full items-center gap-3 border-2 px-3 py-2 text-left transition-transform",
                  isSelected
                    ? "border-sniffy-ink bg-sniffy-teal cursor-default"
                    : "border-sniffy-ink bg-sniffy-paper hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[4px_4px_0_0_#15110D]",
                  "motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0",
                  "disabled:cursor-not-allowed disabled:opacity-70",
                )}
              >
                {c.iconUrl ? (
                  <Image
                    src={c.iconUrl}
                    alt=""
                    width={36}
                    height={36}
                    className="rounded border border-sniffy-rule"
                    unoptimized
                  />
                ) : (
                  <span className="inline-block h-9 w-9 border border-sniffy-rule bg-sniffy-paper-2" />
                )}
                <span className="flex-1 min-w-0">
                  <span className="block truncate font-display font-semibold text-sniffy-ink">
                    {c.name}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-sniffy-ink-mute">
                    {c.developer}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] text-sniffy-ink-mute">
                  {isSelected ? (
                    <>
                      <CheckCircle2 size={12} aria-hidden /> match
                    </>
                  ) : (
                    <span>
                      sim {Math.round(c.similarityScore * 100)}%
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
