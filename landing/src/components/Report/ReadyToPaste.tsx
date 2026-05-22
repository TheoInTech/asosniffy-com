"use client";

import type {
  DiagnosePaidResponse,
  ReadyToPasteField,
  ReadyToPasteSource,
} from "@sniffy/scraper/schemas";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

const SOURCE_LABEL: Record<ReadyToPasteSource, string> = {
  ai: "AI",
  deterministic: "Deterministic",
  "template-fallback": "Template",
};

const SOURCE_ICON: Record<ReadyToPasteSource, string> = {
  ai: "●",
  deterministic: "◐",
  "template-fallback": "◇",
};

const FIELDS = [
  { key: "title", label: "Title" },
  { key: "subtitle", label: "Subtitle" },
  { key: "keywordsField", label: "Keywords field (iOS)" },
  { key: "promotionalText", label: "Promotional text (iOS, 170)" },
  { key: "androidShortDescription", label: "Short description (Play, 80)" },
  { key: "shortDescription", label: "Short description (legacy)" },
] as const satisfies ReadonlyArray<{
  key: Exclude<keyof DiagnosePaidResponse["readyToPaste"], "source">;
  label: string;
}>;

function CharCount({ count, limit }: { count: number; limit: number }) {
  const ratio = limit > 0 ? count / limit : 0;
  const colorClass =
    ratio > 1.0
      ? "text-sniffy-warn"
      : ratio > 0.9
        ? "text-amber-700"
        : "text-sniffy-ink-mute";
  return (
    <span className={cn("font-mono text-[11px]", colorClass)}>
      {count}/{limit}
    </span>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* no-op */
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={`Copy ${label}`}
      className="inline-flex items-center gap-1 border border-sniffy-rule bg-sniffy-paper px-2 py-0.5 font-mono text-[11px] hover:border-sniffy-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow"
    >
      {copied ? (
        <Check size={11} className="text-sniffy-teal" aria-hidden />
      ) : (
        <Copy size={11} aria-hidden />
      )}
      {copied ? "copied" : "copy"}
    </button>
  );
}

function FieldCard({
  label,
  field,
  source,
}: {
  label: string;
  field: ReadyToPasteField;
  source: ReadyToPasteSource;
}) {
  const noChange = field.recommended === null;
  return (
    <div className="border border-sniffy-ink bg-sniffy-paper-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
          {label}
        </p>
        <div className="flex items-center gap-2">
          <CharCount count={field.charCount} limit={field.charLimit} />
          <span
            className="font-mono text-[12px] leading-none text-sniffy-ink-mute"
            title={`Source: ${SOURCE_LABEL[source]}`}
            aria-label={`Source: ${SOURCE_LABEL[source]}`}
          >
            {SOURCE_ICON[source]}
          </span>
          {!noChange && field.recommended !== null ? (
            <CopyButton value={field.recommended} label={label} />
          ) : null}
        </div>
      </div>

      <div className="mt-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-sniffy-ink-mute">
          Current
        </p>
        <pre className="mt-1 whitespace-pre-wrap break-words border border-sniffy-rule bg-sniffy-paper p-2 font-mono text-xs text-sniffy-ink-mute">
          {field.current.length > 0 ? field.current : "—"}
        </pre>
      </div>

      {noChange ? (
        <div className="mt-2 flex items-start gap-2 border border-sniffy-teal bg-sniffy-paper p-2 text-xs">
          <span className="shrink-0 font-mono uppercase tracking-[0.16em] text-sniffy-teal">
            ✓ No change
          </span>
          <span className="text-sniffy-ink">
            — {field.changeReason ?? "already covers your highest-intent term"}
          </span>
        </div>
      ) : (
        <div className="mt-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-sniffy-ink-mute">
            Recommended
          </p>
          <pre className="mt-1 whitespace-pre-wrap break-words border-2 border-sniffy-ink bg-sniffy-paper p-2 font-mono text-xs font-semibold text-sniffy-ink">
            {field.recommended}
          </pre>
          {field.changeReason !== null ? (
            <p className="mt-1 font-mono text-[11px] text-sniffy-ink-mute">
              <span className="font-semibold text-sniffy-ink">Why:</span>{" "}
              {field.changeReason}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function ReadyToPaste({ report }: { report: DiagnosePaidResponse }) {
  const r = report.readyToPaste;
  return (
    <section className="border-2 border-sniffy-ink bg-sniffy-paper p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
          Ready to paste
        </h3>
        <p
          className="font-mono text-[10px] uppercase tracking-[0.16em] text-sniffy-ink-mute"
          title={`Source: ${SOURCE_LABEL[r.source]}`}
        >
          <span aria-hidden>{SOURCE_ICON[r.source]}</span> {SOURCE_LABEL[r.source]}
        </p>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {FIELDS.map((f) => {
          const value = r[f.key];
          if (value === null) return null;
          return (
            <FieldCard
              key={f.key}
              label={f.label}
              field={value}
              source={r.source}
            />
          );
        })}
      </div>
    </section>
  );
}
