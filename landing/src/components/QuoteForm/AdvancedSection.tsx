"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

interface Props {
  competitorIds: string[];
  onChange: (next: string[]) => void;
}

export function AdvancedSection({ competitorIds, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (competitorIds.includes(trimmed)) {
      setDraft("");
      return;
    }
    if (competitorIds.length >= 5) return;
    onChange([...competitorIds, trimmed]);
    setDraft("");
  };

  const remove = (id: string) => onChange(competitorIds.filter((c) => c !== id));

  return (
    <div className="border-t-2 border-dashed border-sniffy-rule pt-3">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="inline-flex items-center gap-1 font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink-mute hover:text-sniffy-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow"
        aria-expanded={open}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        Advanced — competitor IDs
      </button>
      {open ? (
        <div className="mt-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder="App Store ID or URL"
              className="flex-1 border-2 border-sniffy-ink bg-sniffy-paper px-3 py-1.5 font-mono text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow"
            />
            <button
              type="button"
              onClick={add}
              disabled={!draft.trim() || competitorIds.length >= 5}
              className="border-2 border-sniffy-ink bg-sniffy-paper-2 px-3 py-1.5 text-sm font-semibold uppercase tracking-[0.12em] text-sniffy-ink disabled:opacity-40"
            >
              Add
            </button>
          </div>
          {competitorIds.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {competitorIds.map((id) => (
                <li
                  key={id}
                  className="inline-flex items-center gap-1 border border-sniffy-ink bg-sniffy-paper-2 px-2 py-0.5 font-mono text-xs"
                >
                  {id}
                  <button
                    type="button"
                    onClick={() => remove(id)}
                    aria-label={`Remove ${id}`}
                    className="text-sniffy-ink-mute hover:text-sniffy-warn"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2 font-mono text-xs text-sniffy-ink-mute">
            Optional. Adds a deeper competitor trail to the paid report.
          </p>
        </div>
      ) : null}
    </div>
  );
}
