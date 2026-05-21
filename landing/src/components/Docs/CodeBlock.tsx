"use client";

import { useCallback, useState } from "react";

export function CodeBlock({
  language,
  children,
}: {
  language?: string;
  children: string;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [children]);

  return (
    <div className="relative my-2 border-2 border-sniffy-ink bg-sniffy-ink text-sniffy-paper shadow-ink-tab-sm">
      {language ? (
        <div className="flex items-center justify-between border-b-2 border-sniffy-paper/20 px-3 py-1.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-sniffy-paper/70">
            {language}
          </span>
          <button
            type="button"
            onClick={onCopy}
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-sniffy-yellow underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-sniffy-ink"
            aria-label={copied ? "Copied to clipboard" : "Copy snippet"}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onCopy}
          className="absolute right-2 top-2 z-10 border border-sniffy-paper/40 bg-sniffy-ink px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-sniffy-yellow hover:bg-sniffy-paper/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-sniffy-ink"
          aria-label={copied ? "Copied to clipboard" : "Copy snippet"}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      )}
      <pre
        tabIndex={0}
        role="region"
        aria-label={language ? `${language} snippet` : "code snippet"}
        className="overflow-x-auto px-4 py-3 font-mono text-xs leading-relaxed md:text-sm"
      >
        <code>{children}</code>
      </pre>
      <span className="sr-only" aria-live="polite">
        {copied ? "Snippet copied to clipboard" : ""}
      </span>
    </div>
  );
}
