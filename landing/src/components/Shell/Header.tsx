import Link from "next/link";
import { HackathonBadge } from "./HackathonBadge";
import { Wordmark } from "./Wordmark";
import { WalletConnect } from "../WalletConnect";

export function Header() {
  return (
    <header className="border-b-2 border-sniffy-ink bg-sniffy-paper/95 backdrop-blur supports-[backdrop-filter]:bg-sniffy-paper/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-none focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-sniffy-paper"
            aria-label="Sniffy — home"
          >
            <Wordmark />
          </Link>
          <HackathonBadge className="hidden sm:inline-flex" />
        </div>
        <nav className="flex flex-wrap items-center justify-end gap-2 text-xs uppercase tracking-[0.16em]">
          <Link
            href="/trail"
            className="inline-flex items-center gap-1.5 border-2 border-sniffy-ink bg-sniffy-paper px-3 py-1.5 font-semibold text-sniffy-ink transition-transform hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-ink-tab-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-sniffy-paper motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0"
          >
            <span aria-hidden className="hidden sm:inline">🔍</span> The Trail
          </Link>
          <Link
            href="/docs/mcp-setup"
            className="inline-flex items-center gap-1.5 border-2 border-sniffy-ink bg-sniffy-paper px-3 py-1.5 font-semibold text-sniffy-ink transition-transform hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-ink-tab-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-sniffy-paper motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0"
          >
            Setup MCP
          </Link>
          <Link
            href="/docs/fund-agent"
            className="inline-flex items-center gap-1.5 border-2 border-sniffy-ink bg-sniffy-paper px-3 py-1.5 font-semibold text-sniffy-ink transition-transform hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-ink-tab-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-sniffy-paper motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0"
          >
            Fund Agent
          </Link>
          <Link
            href="/sample"
            className="inline-flex items-center gap-1.5 border-2 border-sniffy-ink bg-sniffy-paper px-3 py-1.5 font-semibold text-sniffy-ink transition-transform hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-ink-tab-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-sniffy-paper motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0"
          >
            See sample report
          </Link>
          <WalletConnect className="hidden md:inline-flex" />
        </nav>
      </div>
    </header>
  );
}
