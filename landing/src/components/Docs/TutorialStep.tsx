import type { ReactNode } from "react";

export function TutorialStep({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="relative border-2 border-sniffy-ink bg-sniffy-paper p-5 shadow-ink-tab md:p-8">
      <div className="absolute -left-3 -top-3 inline-flex h-8 w-8 items-center justify-center border-2 border-sniffy-ink bg-sniffy-yellow font-display text-sm font-bold text-sniffy-ink shadow-ink-tab-sm">
        {n}
      </div>
      <h2 className="font-display text-lg font-bold text-sniffy-ink md:text-xl">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-sniffy-ink-2">
        {children}
      </div>
    </section>
  );
}
