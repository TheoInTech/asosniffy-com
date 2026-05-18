"use client";

import type { DiagnosePaidResponse } from "@sniffy/scraper/schemas";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

const FIELDS: Array<{
  key: keyof DiagnosePaidResponse["readyToPaste"];
  label: string;
}> = [
  { key: "title", label: "Title" },
  { key: "subtitle", label: "Subtitle" },
  { key: "keywordsField", label: "Keywords field (iOS)" },
  { key: "shortDescription", label: "Short description (Android)" },
];

function CopyBlock({ label, value }: { label: string; value: string }) {
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
    <div className="border border-sniffy-ink bg-sniffy-paper-2 p-3">
      <div className="flex items-center justify-between">
        <p className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
          {label}
        </p>
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
      </div>
      <pre className="mt-2 whitespace-pre-wrap break-words border border-sniffy-rule bg-sniffy-paper p-2 font-mono text-xs text-sniffy-ink">
        {value || "—"}
      </pre>
    </div>
  );
}

export function ReadyToPaste({ report }: { report: DiagnosePaidResponse }) {
  return (
    <section className="border-2 border-sniffy-ink bg-sniffy-paper p-5">
      <h3 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute">
        Ready to paste
      </h3>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {FIELDS.map((f) => (
          <CopyBlock
            key={f.key as string}
            label={f.label}
            value={report.readyToPaste[f.key]}
          />
        ))}
      </div>
    </section>
  );
}
