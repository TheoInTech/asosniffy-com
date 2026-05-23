import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t-2 border-sniffy-ink">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-xs text-sniffy-ink-mute md:flex-row md:items-center md:justify-between md:px-6">
        <p className="font-display">
          <span className="text-sniffy-ink">Sniffy</span> · MIT-licensed · Built
          for the Morph x402 Agentic Payments track.
        </p>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 uppercase tracking-[0.16em]">
          <Link
            href="https://github.com/TheoInTech/asosniffy-com"
            className="hover:text-sniffy-ink focus:outline-none focus-visible:underline"
          >
            GitHub
          </Link>
          <Link
            href="/sample"
            className="hover:text-sniffy-ink focus:outline-none focus-visible:underline"
          >
            Sample report
          </Link>
          <Link
            href="/guides"
            className="hover:text-sniffy-ink focus:outline-none focus-visible:underline"
          >
            Guides
          </Link>
          <Link
            href="/privacy"
            className="hover:text-sniffy-ink focus:outline-none focus-visible:underline"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="hover:text-sniffy-ink focus:outline-none focus-visible:underline"
          >
            Terms
          </Link>
          <a
            href="https://morph.network"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-sniffy-ink focus:outline-none focus-visible:underline"
          >
            Morph network
          </a>
        </nav>
      </div>
    </footer>
  );
}
