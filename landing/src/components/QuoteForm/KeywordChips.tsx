"use client";

import { X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { KEYWORD_MAX, KEYWORD_MIN } from "./validation";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  error?: string;
}

export function KeywordChips({ value, onChange, error }: Props) {
  const [draft, setDraft] = useState("");

  const tryAdd = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (value.includes(trimmed)) {
      setDraft("");
      return;
    }
    if (value.length >= KEYWORD_MAX) return;
    onChange([...value, trimmed]);
    setDraft("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      tryAdd();
      return;
    }
    if (e.key === "Backspace" && draft.length === 0 && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const remove = (kw: string) => {
    onChange(value.filter((k) => k !== kw));
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label
          htmlFor="keyword-input"
          className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink"
        >
          Keywords
        </label>
        <span className="font-mono text-xs text-sniffy-ink-mute">
          {value.length}/{KEYWORD_MAX} · min {KEYWORD_MIN}
        </span>
      </div>
      <div
        className={cn(
          "flex min-h-[44px] flex-wrap items-center gap-1.5 border-2 border-sniffy-ink bg-sniffy-paper px-2 py-2",
          error ? "border-sniffy-warn" : "",
        )}
      >
        {value.map((kw) => (
          <span
            key={kw}
            className="inline-flex items-center gap-1 border-2 border-sniffy-ink bg-sniffy-yellow px-2 py-0.5 text-sm font-medium text-sniffy-ink"
          >
            {kw}
            <button
              type="button"
              aria-label={`Remove ${kw}`}
              onClick={() => remove(kw)}
              className="inline-flex h-4 w-4 items-center justify-center text-sniffy-ink hover:text-sniffy-warn focus:outline-none focus-visible:ring-1 focus-visible:ring-sniffy-ink"
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        ))}
        <input
          id="keyword-input"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={tryAdd}
          placeholder={value.length === 0 ? "fitness tracker, sleep coach…" : "Add another"}
          disabled={value.length >= KEYWORD_MAX}
          className="flex-1 min-w-[140px] bg-transparent text-sm placeholder:text-sniffy-ink-mute focus:outline-none disabled:cursor-not-allowed"
        />
      </div>
      {error ? (
        <p
          id="keyword-error"
          role="alert"
          className="mt-1 text-xs text-sniffy-warn"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
