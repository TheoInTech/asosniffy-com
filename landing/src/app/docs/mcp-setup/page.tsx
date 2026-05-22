import type { Metadata } from "next";
import Link from "next/link";
import { Shell } from "@/components/Shell";
import { TutorialStep } from "@/components/Docs/TutorialStep";
import { CodeBlock } from "@/components/Docs/CodeBlock";
import { Callout } from "@/components/Docs/Callout";

export const metadata: Metadata = {
  title: "Setup MCP — Sniffy",
  description:
    "Wire @gosniffy/mcp into Claude Desktop or Cursor so your agent can call sniffy_quote, sniffy_diagnose, and sniffy_sample over x402.",
};

const CLAUDE_DESKTOP_CONFIG = `{
  "mcpServers": {
    "sniffy": {
      "command": "npx",
      "args": ["-y", "@gosniffy/mcp"],
      "env": {
        "SNIFFY_PRIVATE_KEY": "0x...",
        "SNIFFY_BASE_URL": "https://api.sniffy.io"
      }
    }
  }
}`;

const CURSOR_CONFIG = `{
  "mcpServers": {
    "sniffy": {
      "command": "npx",
      "args": ["-y", "@gosniffy/mcp"],
      "env": {
        "SNIFFY_PRIVATE_KEY": "0x..."
      }
    }
  }
}`;

const FROM_SOURCE_CONFIG = `{
  "mcpServers": {
    "sniffy": {
      "command": "node",
      "args": ["/absolute/path/to/asosniffy-com/packages/mcp/dist/index.js"],
      "env": {
        "SNIFFY_PRIVATE_KEY": "0x..."
      }
    }
  }
}`;

const FROM_SOURCE_BUILD = `git clone https://github.com/TheoInTech/asosniffy-com
cd asosniffy-com
pnpm install
pnpm -F @gosniffy/mcp build`;

const VERIFY_PROMPT = `Use sniffy_sample to fetch a sample report.`;

export default function McpSetupPage() {
  return (
    <Shell>
      <section className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-10">
        <header className="mb-6">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-sniffy-warn">
            tutorial · agentic distribution
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-sniffy-ink md:text-3xl">
            Setup MCP
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-sniffy-ink-mute">
            Plug <span className="font-mono">@gosniffy/mcp</span> into Claude
            Desktop or Cursor and your agent gets three new tools:{" "}
            <span className="font-mono">sniffy_sample</span>,{" "}
            <span className="font-mono">sniffy_quote</span>, and{" "}
            <span className="font-mono">sniffy_diagnose</span>. The first two
            are free. The third settles over x402 on Morph — that&apos;s the part
            that turns your agent into a paying customer of the App Store
            intelligence API.
          </p>
        </header>

        <div className="space-y-8">
          <TutorialStep n={1} title="Prereqs">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <span className="font-mono">Node.js 20+</span> on your PATH.
                Check with <span className="font-mono">node -v</span>.
              </li>
              <li>
                A host that speaks MCP — Claude Desktop, Cursor, or any other
                client following{" "}
                <Link
                  href="https://modelcontextprotocol.io"
                  className="underline decoration-sniffy-ink underline-offset-2 hover:text-sniffy-warn"
                  target="_blank"
                  rel="noreferrer"
                >
                  the MCP spec
                </Link>
                .
              </li>
              <li>
                A funded EOA on Morph — only needed for{" "}
                <span className="font-mono">sniffy_diagnose</span>. See{" "}
                <Link
                  href="/docs/fund-agent"
                  className="underline decoration-sniffy-ink underline-offset-2 hover:text-sniffy-warn"
                >
                  Fund your AI agent
                </Link>
                .
              </li>
            </ul>
          </TutorialStep>

          <TutorialStep n={2} title="Pick an install path">
            <p>
              <span className="font-mono">@gosniffy/mcp</span> is staged for
              publish via Changesets. Until the package lands on npm, run it
              from source.
            </p>
            <p className="mt-3 font-semibold text-sniffy-ink">
              A. From npm (recommended once published)
            </p>
            <CodeBlock language="bash">{`npx -y @gosniffy/mcp`}</CodeBlock>
            <p className="mt-3 font-semibold text-sniffy-ink">
              B. From source (works today)
            </p>
            <CodeBlock language="bash">{FROM_SOURCE_BUILD}</CodeBlock>
            <p className="text-sniffy-ink-mute">
              Note the absolute path to{" "}
              <span className="font-mono">
                packages/mcp/dist/index.js
              </span>{" "}
              — you&apos;ll point your host config at it in the next step.
            </p>
          </TutorialStep>

          <TutorialStep n={3} title="Wire it into Claude Desktop">
            <p>Edit your host config file:</p>
            <ul className="list-disc space-y-1 pl-5 font-mono text-xs">
              <li>
                macOS:{" "}
                <span className="text-sniffy-ink">
                  ~/Library/Application
                  Support/Claude/claude_desktop_config.json
                </span>
              </li>
              <li>
                Windows:{" "}
                <span className="text-sniffy-ink">
                  %APPDATA%\Claude\claude_desktop_config.json
                </span>
              </li>
              <li>
                Linux:{" "}
                <span className="text-sniffy-ink">
                  ~/.config/Claude/claude_desktop_config.json
                </span>
              </li>
            </ul>
            <p className="mt-2">Add the Sniffy server under mcpServers:</p>
            <CodeBlock language="json">{CLAUDE_DESKTOP_CONFIG}</CodeBlock>
            <p className="text-sniffy-ink-mute">
              Or if you&apos;re running from source, swap the{" "}
              <span className="font-mono">command</span>/
              <span className="font-mono">args</span> for the absolute path
              from step 2:
            </p>
            <CodeBlock language="json">{FROM_SOURCE_CONFIG}</CodeBlock>
          </TutorialStep>

          <TutorialStep n={4} title="Or wire it into Cursor">
            <p>
              Drop the same shape into{" "}
              <span className="font-mono">.cursor/mcp.json</span> at the root
              of any workspace where you want Sniffy available:
            </p>
            <CodeBlock language="json">{CURSOR_CONFIG}</CodeBlock>
            <p className="text-sniffy-ink-mute">
              <span className="font-mono">SNIFFY_BASE_URL</span> is optional —
              defaults to <span className="font-mono">https://api.sniffy.io</span>.
              Override it for staging or self-hosted scrapers.
            </p>
          </TutorialStep>

          <TutorialStep n={5} title="Restart and verify">
            <p>
              Fully quit and relaunch the host app so it re-reads the config.
              Then ask your agent:
            </p>
            <CodeBlock>{VERIFY_PROMPT}</CodeBlock>
            <p>
              You should see a JSON-shaped fixture report come back. No
              wallet, no payment — that&apos;s{" "}
              <span className="font-mono">sniffy_sample</span> doing its job.
            </p>
            <Callout tone="info" title="Missing key?">
              <p>
                Forgetting <span className="font-mono">SNIFFY_PRIVATE_KEY</span>{" "}
                doesn&apos;t crash the server.{" "}
                <span className="font-mono">sniffy_sample</span> and{" "}
                <span className="font-mono">sniffy_quote</span> still work;{" "}
                <span className="font-mono">sniffy_diagnose</span> returns a
                structured <span className="font-mono">payment_required</span>{" "}
                error your agent can read and recover from.
              </p>
            </Callout>
          </TutorialStep>

          <TutorialStep n={6} title="Tool catalog">
            <ul className="space-y-3">
              <li>
                <span className="font-mono font-semibold text-sniffy-ink">
                  sniffy_sample
                </span>{" "}
                — free. Returns a fixture diagnosis with{" "}
                <span className="font-mono">provenance: &quot;fixture&quot;</span>.
                Use it to teach the agent the response shape.
              </li>
              <li>
                <span className="font-mono font-semibold text-sniffy-ink">
                  sniffy_quote
                </span>{" "}
                — free. Validates the app + keywords, returns a shallowScan
                preview and <span className="font-mono">pricing.estimatedTotal</span>{" "}
                — the exact amount{" "}
                <span className="font-mono">sniffy_diagnose</span> will charge.
              </li>
              <li>
                <span className="font-mono font-semibold text-sniffy-ink">
                  sniffy_diagnose
                </span>{" "}
                — paid. Auto-signs an EIP-3009 authorization with{" "}
                <span className="font-mono">SNIFFY_PRIVATE_KEY</span> and
                settles over x402. Returns the full diagnosis plus a receipt
                block (network, tx hash, settled-at).
              </li>
            </ul>
            <Callout tone="warn" title="Testnet hygiene">
              <p>
                <span className="font-mono">SNIFFY_PRIVATE_KEY</span> lives
                plain-text in your host config. Generate a fresh testnet wallet
                for this — never paste a mainnet key that holds anything you
                can&apos;t afford to lose. The{" "}
                <Link
                  href="/docs/fund-agent"
                  className="underline decoration-sniffy-warn underline-offset-2 hover:text-sniffy-ink"
                >
                  Fund your AI agent
                </Link>{" "}
                guide walks the generation + funding flow end-to-end.
              </p>
            </Callout>
          </TutorialStep>

          <Callout tone="info" title="Alternative: Vercel Skills">
            <p>
              Prefer the Vercel Skills install model? Sniffy ships a{" "}
              <span className="font-mono">SKILL.md</span> at the repo root.
              Install it with one command — same API, different surface:
            </p>
            <CodeBlock language="bash">{`npx skills add TheoInTech/asosniffy-com`}</CodeBlock>
          </Callout>
        </div>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t-2 border-sniffy-rule pt-5">
          <Link
            href="/docs/fund-agent"
            className="inline-flex items-center gap-1.5 border-2 border-sniffy-ink bg-sniffy-yellow px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink shadow-ink-tab-sm transition-transform hover:-translate-x-[2px] hover:-translate-y-[2px] focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-sniffy-paper motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0"
          >
            Next: fund your AI agent →
          </Link>
          <Link
            href="/"
            className="font-mono text-xs uppercase tracking-[0.18em] text-sniffy-ink-mute underline-offset-2 hover:underline"
          >
            ← back to demo
          </Link>
        </footer>
      </section>
    </Shell>
  );
}
