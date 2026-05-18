"use client";

import { TOP_COUNTRIES } from "./validation";

interface Props {
  value: string;
  onChange: (next: string) => void;
}

export function CountrySelect({ value, onChange }: Props) {
  return (
    <div>
      <label
        htmlFor="country"
        className="mb-2 block font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink"
      >
        Country
      </label>
      <select
        id="country"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border-2 border-sniffy-ink bg-sniffy-paper px-3 py-2 font-mono text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow"
      >
        {TOP_COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} — {c.label}
          </option>
        ))}
      </select>
    </div>
  );
}
