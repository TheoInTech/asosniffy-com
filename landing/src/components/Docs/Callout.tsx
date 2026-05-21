import type { ReactNode } from "react";

type Tone = "warn" | "info" | "status";

const TONE_STYLES: Record<Tone, { container: string; tag: string; tagLabel: string }> = {
  warn: {
    container: "border-sniffy-warn bg-sniffy-warn/10",
    tag: "bg-sniffy-warn text-sniffy-paper",
    tagLabel: "Heads up",
  },
  info: {
    container: "border-sniffy-ink bg-sniffy-yellow/20",
    tag: "bg-sniffy-yellow text-sniffy-ink",
    tagLabel: "Note",
  },
  status: {
    container: "border-sniffy-ink bg-sniffy-teal/15",
    tag: "bg-sniffy-teal text-sniffy-ink",
    tagLabel: "Status",
  },
};

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
}) {
  const style = TONE_STYLES[tone];
  return (
    <aside
      className={`relative border-2 ${style.container} p-4 text-sm text-sniffy-ink-2`}
      role={tone === "warn" ? "alert" : "note"}
    >
      <span
        className={`absolute -top-2.5 left-3 inline-flex items-center border-2 border-sniffy-ink px-2 py-0.5 font-display text-[10px] font-semibold uppercase tracking-[0.2em] ${style.tag}`}
      >
        {title ?? style.tagLabel}
      </span>
      <div className="mt-2 space-y-2 leading-relaxed">{children}</div>
    </aside>
  );
}
