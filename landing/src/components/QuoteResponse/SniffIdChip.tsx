"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function SniffIdChip({ sniffId }: { sniffId: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sniffId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard API may be unavailable in some browsers; surface no error to
      // the user — they can still select & copy the text manually.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy sniff ID"
      className="inline-flex items-center gap-1.5 border border-sniffy-rule bg-sniffy-paper-2 px-2 py-0.5 font-mono text-[11px] text-sniffy-ink hover:border-sniffy-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow"
      aria-label={`Copy sniff ID ${sniffId}`}
    >
      <span>{sniffId}</span>
      {copied ? (
        <Check size={11} className="text-sniffy-teal" aria-hidden />
      ) : (
        <Copy size={11} aria-hidden />
      )}
    </button>
  );
}
