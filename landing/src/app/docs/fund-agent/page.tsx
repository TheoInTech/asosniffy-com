import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Shell } from "@/components/Shell";
import { TutorialStep } from "@/components/Docs/TutorialStep";
import { CodeBlock } from "@/components/Docs/CodeBlock";
import { Callout } from "@/components/Docs/Callout";
import { getActiveMorphNetwork, MORPH_HOODI, MORPH_MAINNET } from "@/lib/morph-urls";

const BITGET_REFERRAL_URL =
  "https://www.bitget.com/en/referral/register?from=referral&clacCode=9TB6K2NK";

export const metadata: Metadata = {
  title: "Fund your AI agent — Sniffy",
  description:
    "Generate a fresh EOA, fund it on Morph, and inject SNIFFY_PRIVATE_KEY so your agent can pay Sniffy over x402.",
};

const GENERATE_EOA = `import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

console.log("address:    ", account.address);
console.log("privateKey: ", privateKey);  // testnet-only, never commit`;

const MCP_ENV = `{
  "mcpServers": {
    "sniffy": {
      "command": "npx",
      "args": ["-y", "@gosniffy/mcp"],
      "env": {
        "SNIFFY_PRIVATE_KEY": "0x...your fresh key..."
      }
    }
  }
}`;

const CLI_ENV = `export SNIFFY_PRIVATE_KEY=0x...your fresh key...
npx @gosniffy/cli diagnose --app 1234567890 --keywords "pickleball,tracker"`;

const SDK_ENV = `import { createSniffy } from "@gosniffy/sdk";
import { privateKeyToAccount } from "viem/accounts";

const sniffy = createSniffy({
  signer: privateKeyToAccount(process.env.SNIFFY_PRIVATE_KEY as \`0x\${string}\`),
});

const quote = await sniffy.quote({ store: "ios", app: "1234567890", country: "US", keywords: ["pickleball"] });
const report = await sniffy.diagnose({ ...quote.input, sniffId: quote.sniffId });`;

const HOODI_FLIP = `# scraper/.env
MORPH_NETWORK=eip155:2910

# landing/.env.local
NEXT_PUBLIC_MORPH_NETWORK=eip155:2910`;

export default function FundAgentPage() {
  const active = getActiveMorphNetwork();
  const usingMainnet = active.caip2 === MORPH_MAINNET.caip2;

  return (
    <Shell>
      <section className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-10">
        <header className="mb-6">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-sniffy-warn">
            tutorial · paying agents
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-sniffy-ink md:text-3xl">
            Fund your AI agent
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-sniffy-ink-mute">
            Your agent calls <span className="font-mono">sniffy_diagnose</span>{" "}
            and Sniffy answers with HTTP 402 plus an x402 offer. The agent has
            to sign and pay — which means it needs its own externally-owned
            account (EOA) holding the payment token on Morph. Five minutes,
            no bridge gymnastics if you stay on Mainnet.
          </p>
        </header>

        <Callout tone="status" title="Active network">
          <p>
            This deploy is currently configured for{" "}
            <span className="font-mono font-semibold text-sniffy-ink">
              {active.name}
            </span>{" "}
            ({active.caip2}, chain ID {active.chainId}). Wallet signatures from
            your agent have to match — flip both{" "}
            <span className="font-mono">MORPH_NETWORK</span> and{" "}
            <span className="font-mono">NEXT_PUBLIC_MORPH_NETWORK</span> together,
            never just one.
          </p>
        </Callout>

        <div className="mt-8 space-y-8">
          <TutorialStep n={1} title="Why your agent needs a wallet">
            <p>
              <span className="font-mono">/api/v1/aso/diagnose</span> is an
              x402-paywalled endpoint. The first request comes back as HTTP{" "}
              <span className="font-mono">402 Payment Required</span> with the
              offer in the <span className="font-mono">PAYMENT-REQUIRED</span>{" "}
              header. The client (your agent, via the SDK / CLI / MCP) signs
              an EIP-3009 authorization, retries with{" "}
              <span className="font-mono">PAYMENT-SIGNATURE</span>, and
              receives the diagnosis plus a settled receipt.
            </p>
            <p>
              The signing wallet lives on your side. Sniffy never holds your
              key. Payment is on-chain and non-refundable, so the wallet
              should be a dedicated agent EOA — not your personal hot wallet.
            </p>
          </TutorialStep>

          <TutorialStep n={2} title="Generate a fresh EOA">
            <p>
              Spin up a brand-new private key with viem. Don&apos;t reuse a
              wallet you keep meaningful balances in.
            </p>
            <CodeBlock language="ts">{GENERATE_EOA}</CodeBlock>
            <Callout tone="warn" title="Don't commit the key">
              <p>
                Drop the printed value into a local secret store
                (1Password, op-cli, your host&apos;s keychain). Never commit{" "}
                <span className="font-mono">.env</span>, never paste it into a
                shared screen, and rotate it the moment you suspect leakage —
                the on-chain footprint is public.
              </p>
            </Callout>
          </TutorialStep>

          <TutorialStep n={3} title="Fund the EOA on Morph Mainnet">
            <p>
              Mainnet is the path that actually settles today. $0.50 of USDC
              on Morph covers dozens of diagnose calls.
            </p>

            <p className="mt-4 font-semibold text-sniffy-ink">
              Fastest path: buy USDC on Bitget
            </p>
            <p>
              Bitget lists Morph natively, so USDC withdrawals land directly
              on your agent&apos;s Morph Mainnet address — no L1↔L2 bridging
              required.
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Sign up or{" "}
                <Link
                  href={BITGET_REFERRAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono underline decoration-sniffy-ink underline-offset-2 hover:text-sniffy-warn"
                >
                  log in
                </Link>{" "}
                to Bitget.
              </li>
              <li>Buy USDC on the Bitget spot market.</li>
              <li>
                Withdraw → pick{" "}
                <span className="font-mono">Morph Mainnet</span> as the
                network → paste your agent EOA address → confirm. The
                withdrawal will show up on the{" "}
                <Link
                  href={MORPH_MAINNET.explorer}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono underline decoration-sniffy-ink underline-offset-2 hover:text-sniffy-warn"
                >
                  Morph explorer
                </Link>{" "}
                once it settles.
              </li>
            </ol>
            <a
              href={BITGET_REFERRAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 border-2 border-sniffy-ink bg-sniffy-paper px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink shadow-ink-tab-sm transition-transform hover:bg-sniffy-yellow hover:-translate-x-[2px] hover:-translate-y-[2px] focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-sniffy-paper motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0"
            >
              Get USDC on Bitget
              <ExternalLink size={12} aria-hidden />
            </a>

            <p className="mt-6 font-semibold text-sniffy-ink">
              Or bridge from L1
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Bridge:{" "}
                <Link
                  href={MORPH_MAINNET.bridge}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono underline decoration-sniffy-ink underline-offset-2 hover:text-sniffy-warn"
                >
                  {MORPH_MAINNET.bridge}
                </Link>
              </li>
              <li>
                Payment token: USDC (Bridged Standard) at{" "}
                <span className="font-mono">
                  0xCfb1186F4e93D60E60a8bDd997427D1F33bc372B
                </span>{" "}
                · 6 decimals
              </li>
              <li>
                Explorer:{" "}
                <Link
                  href={MORPH_MAINNET.explorer}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono underline decoration-sniffy-ink underline-offset-2 hover:text-sniffy-warn"
                >
                  {MORPH_MAINNET.explorer}
                </Link>
              </li>
            </ul>
            <p>
              You also need a tiny amount of ETH on Morph Mainnet for gas if
              the facilitator falls back to a user-signed settlement path —
              the official relayer normally sponsors gas, but having $0.10
              of ETH bridged is good hygiene.
            </p>

            <p className="mt-4 font-semibold text-sniffy-ink">
              How much per call?
            </p>
            <div className="overflow-x-auto border-2 border-sniffy-ink">
              <table className="w-full font-mono text-xs">
                <thead className="bg-sniffy-paper-2 text-left">
                  <tr>
                    <th className="border-b-2 border-sniffy-ink px-3 py-2">
                      Line item
                    </th>
                    <th className="border-b-2 border-sniffy-ink px-3 py-2">
                      USD
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border-b border-sniffy-rule px-3 py-2">
                      base diagnosis
                    </td>
                    <td className="border-b border-sniffy-rule px-3 py-2">
                      $0.03
                    </td>
                  </tr>
                  <tr>
                    <td className="border-b border-sniffy-rule px-3 py-2">
                      per keyword
                    </td>
                    <td className="border-b border-sniffy-rule px-3 py-2">
                      $0.01
                    </td>
                  </tr>
                  <tr>
                    <td className="border-b border-sniffy-rule px-3 py-2">
                      per additional country
                    </td>
                    <td className="border-b border-sniffy-rule px-3 py-2">
                      $0.01
                    </td>
                  </tr>
                  <tr>
                    <td className="border-b border-sniffy-rule px-3 py-2">
                      competitor trail (shallow)
                    </td>
                    <td className="border-b border-sniffy-rule px-3 py-2">
                      $0.02
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">competitor trail (deep)</td>
                    <td className="px-3 py-2">$0.05</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-sniffy-ink-mute">
              Five keywords + one country + shallow trail ≈ $0.10. Always
              quote the exact charge from{" "}
              <span className="font-mono">pricing.estimatedTotal</span>{" "}
              returned by <span className="font-mono">sniffy_quote</span> — the
              breakdown above is the source-of-truth recipe, not a fixed total.
            </p>
          </TutorialStep>

          <TutorialStep n={4} title="Inject the key into your agent">
            <p>The same key works across all three Sniffy surfaces.</p>

            <p className="mt-3 font-semibold text-sniffy-ink">MCP</p>
            <p>
              Add it to the host config you set up in the{" "}
              <Link
                href="/docs/mcp-setup"
                className="underline decoration-sniffy-ink underline-offset-2 hover:text-sniffy-warn"
              >
                Setup MCP
              </Link>{" "}
              guide:
            </p>
            <CodeBlock language="json">{MCP_ENV}</CodeBlock>

            <p className="mt-3 font-semibold text-sniffy-ink">CLI</p>
            <CodeBlock language="bash">{CLI_ENV}</CodeBlock>

            <p className="mt-3 font-semibold text-sniffy-ink">SDK</p>
            <CodeBlock language="ts">{SDK_ENV}</CodeBlock>
          </TutorialStep>

          <TutorialStep n={5} title="What your agent is actually signing">
            <p>
              The signature is an EIP-3009{" "}
              <span className="font-mono">transferWithAuthorization</span> —
              a one-time, off-chain authorization for a specific{" "}
              <span className="font-mono">(from, to, value, validAfter, validBefore, nonce)</span>{" "}
              tuple. It is <em>not</em> a generic ERC-20 approval.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <span className="font-mono">value</span> is in atomic token
                units (USDC: 6 decimals → <span className="font-mono">50000</span>{" "}
                = $0.05). The SDK does the unit math.
              </li>
              <li>
                <span className="font-mono">nonce</span> is a random 32-byte
                hex string — scopes the signature to a single call, prevents
                replay.
              </li>
              <li>
                The facilitator can&apos;t pull more than{" "}
                <span className="font-mono">value</span> with this signature.
                If you ever see a UI asking you to approve unlimited spend,
                you&apos;re on the wrong endpoint.
              </li>
            </ul>
          </TutorialStep>

          <TutorialStep n={6} title="Optional: use Hoodi testnet instead">
            <details className="group">
              <summary className="cursor-pointer font-display text-sm font-semibold uppercase tracking-[0.18em] text-sniffy-ink hover:text-sniffy-warn">
                Show the Hoodi flow
              </summary>
              <div className="mt-3 space-y-3">
                <p>
                  Hoodi is Morph&apos;s testnet (chain ID{" "}
                  <span className="font-mono">{MORPH_HOODI.chainId}</span>,{" "}
                  <span className="font-mono">{MORPH_HOODI.caip2}</span>).
                  Flip both env vars together:
                </p>
                <CodeBlock language="bash">{HOODI_FLIP}</CodeBlock>
                <p>
                  Then visit the Hoodi faucet for gas ETH:
                </p>
                <p className="font-mono text-xs">
                  <Link
                    href={MORPH_HOODI.faucet ?? "https://faucet-hoodi.morph.network"}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-sniffy-ink underline-offset-2 hover:text-sniffy-warn"
                  >
                    {MORPH_HOODI.faucet}
                  </Link>
                </p>
                <Callout tone="warn" title="Faucet caveat">
                  <p>
                    The faucet dispenses Hoodi gas ETH only — not the
                    payment token Sniffy charges. For testnet payment
                    balances, ping Morph dev support and request{" "}
                    <span className="font-mono">HoodiTestToken</span> (
                    <span className="font-mono">
                      0xEcF966Cc754BC411E1F1106fbb4e343b835E85E4
                    </span>
                    ) for your agent address.
                  </p>
                </Callout>
                <Callout tone="status" title="Provisional">
                  <p>
                    Morph&apos;s official x402 facilitator does not currently
                    list <span className="font-mono">eip155:2910</span> in{" "}
                    <span className="font-mono">/v2/supported</span>. Hoodi
                    receipts may carry{" "}
                    <span className="font-mono">
                      facilitatorMode: &quot;fixture-receipt&quot;
                    </span>{" "}
                    with a visible <span className="font-mono">0xsample…</span>{" "}
                    tx prefix. This is expected for now — Mainnet has the
                    working settlement contract at{" "}
                    <span className="font-mono">
                      0x154dd21f7386c4c49481c1fe568dad365cfc34e5
                    </span>
                    .
                  </p>
                </Callout>
              </div>
            </details>
            {!usingMainnet ? (
              <Callout tone="info" title="You're already on Hoodi">
                <p>
                  This deploy has{" "}
                  <span className="font-mono">NEXT_PUBLIC_MORPH_NETWORK</span>{" "}
                  set to <span className="font-mono">{active.caip2}</span> — the
                  Hoodi instructions above apply directly.
                </p>
              </Callout>
            ) : null}
          </TutorialStep>
        </div>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t-2 border-sniffy-rule pt-5">
          <Link
            href="/docs/mcp-setup"
            className="inline-flex items-center gap-1.5 border-2 border-sniffy-ink bg-sniffy-paper px-3 py-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-sniffy-ink shadow-ink-tab-sm transition-transform hover:-translate-x-[2px] hover:-translate-y-[2px] focus:outline-none focus-visible:ring-2 focus-visible:ring-sniffy-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-sniffy-paper motion-reduce:transition-none motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0"
          >
            ← back to MCP setup
          </Link>
          <Link
            href="/sample"
            className="font-mono text-xs uppercase tracking-[0.18em] text-sniffy-ink-mute underline-offset-2 hover:underline"
          >
            see sample report →
          </Link>
        </footer>
      </section>
    </Shell>
  );
}
