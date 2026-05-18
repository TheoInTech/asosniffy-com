#!/usr/bin/env tsx
// Doctor script — verifies the Morph network endpoints that Sniffy depends on
// at runtime. Run via `pnpm --filter @sniffy/landing doctor`.
//
// Checks performed (in order):
//   1. HEAD against bridge / faucet / explorer / facilitator URLs
//   2. JSON-RPC eth_chainId against each RPC, confirms the returned chain id
//   3. GET /x402/v2/supported, prints supported (scheme, network) pairs and
//      flags whether Morph Hoodi (eip155:2910) is in the list
//
// Exits 0 when everything green, 1 when any non-OPTIONAL check fails. Pass
// `--json` for machine-readable output (CI / future status badge).

import { MORPH_HOODI, MORPH_MAINNET, type MorphNetwork } from "../src/lib/morph-urls";

interface CheckResult {
  label: string;
  ok: boolean;
  detail: string;
  optional?: boolean;
}

const TIMEOUT_MS = 7_000;

function flag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await p;
  } finally {
    clearTimeout(timer);
  }
}

async function pingUrl(url: string, label: string, optional = false): Promise<CheckResult> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctl.signal });
    clearTimeout(timer);
    return {
      label,
      ok: res.ok || res.status === 405, // some sites 405 HEAD but accept GET
      detail: `${res.status} ${res.statusText} — ${url}`,
      optional,
    };
  } catch (err) {
    return {
      label,
      ok: false,
      detail: `${err instanceof Error ? err.message : String(err)} — ${url}`,
      optional,
    };
  }
}

async function checkChainId(network: MorphNetwork): Promise<CheckResult> {
  try {
    const res = await withTimeout(
      fetch(network.rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: [],
        }),
      }),
      TIMEOUT_MS,
    );
    const data = (await res.json()) as { result?: string };
    const got = data.result ? Number.parseInt(data.result, 16) : NaN;
    return {
      label: `${network.name} eth_chainId`,
      ok: got === network.chainId,
      detail:
        got === network.chainId
          ? `${got} (expected ${network.chainId}) — ${network.rpc}`
          : `got ${data.result ?? "n/a"} (expected 0x${network.chainId.toString(16)}) — ${network.rpc}`,
    };
  } catch (err) {
    return {
      label: `${network.name} eth_chainId`,
      ok: false,
      detail: `${err instanceof Error ? err.message : String(err)} — ${network.rpc}`,
    };
  }
}

interface FacilitatorSupported {
  kinds?: Array<{ x402Version?: number; scheme?: string; network?: string }>;
  extensions?: unknown[];
  signers?: Record<string, string[]>;
}

interface FacilitatorReport {
  result: CheckResult;
  body?: FacilitatorSupported;
  supportsHoodi?: boolean;
}

async function probeFacilitator(): Promise<FacilitatorReport> {
  const url = `${MORPH_HOODI.facilitator}/v2/supported`;
  try {
    const res = await withTimeout(fetch(url), TIMEOUT_MS);
    if (!res.ok) {
      return {
        result: {
          label: "Facilitator /v2/supported",
          ok: false,
          detail: `${res.status} ${res.statusText} — ${url}`,
        },
      };
    }
    const body = (await res.json()) as FacilitatorSupported;
    const supportsHoodi = Boolean(
      body.kinds?.some((k) => k.network === MORPH_HOODI.caip2),
    );
    return {
      result: {
        label: "Facilitator /v2/supported",
        ok: true,
        detail: `${url}`,
      },
      body,
      supportsHoodi,
    };
  } catch (err) {
    return {
      result: {
        label: "Facilitator /v2/supported",
        ok: false,
        detail: `${err instanceof Error ? err.message : String(err)} — ${url}`,
      },
    };
  }
}

function formatRow(result: CheckResult): string {
  const status = result.ok ? "\x1b[32m✓\x1b[0m" : result.optional ? "\x1b[33m·\x1b[0m" : "\x1b[31m✗\x1b[0m";
  return `${status} ${result.label.padEnd(36)} ${result.detail}`;
}

async function main() {
  const args = process.argv.slice(2);
  const jsonOut = flag(args, "json");

  if (!jsonOut) {
    process.stdout.write("\n→ Sniffy doctor — Morph network health\n\n");
  }

  const urlChecks: CheckResult[] = await Promise.all([
    pingUrl(MORPH_HOODI.bridge, "Hoodi bridge"),
    pingUrl(MORPH_HOODI.faucet ?? "", "Hoodi faucet", true),
    pingUrl(MORPH_HOODI.explorer, "Hoodi explorer"),
    pingUrl(MORPH_MAINNET.bridge, "Mainnet bridge", true),
    pingUrl(MORPH_MAINNET.explorer, "Mainnet explorer", true),
  ]);

  const chainChecks: CheckResult[] = await Promise.all([
    checkChainId(MORPH_HOODI),
    checkChainId(MORPH_MAINNET),
  ]);

  const facilitator = await probeFacilitator();

  const allChecks: CheckResult[] = [
    ...urlChecks,
    ...chainChecks,
    facilitator.result,
  ];

  const nonOptionalFails = allChecks.filter((r) => !r.ok && !r.optional);
  const exitCode = nonOptionalFails.length === 0 ? 0 : 1;

  if (jsonOut) {
    const payload = {
      ok: exitCode === 0,
      checks: allChecks,
      facilitator: facilitator.body,
      facilitatorSupportsHoodi: facilitator.supportsHoodi ?? false,
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    for (const row of allChecks) {
      process.stdout.write(`${formatRow(row)}\n`);
    }
    if (facilitator.body) {
      process.stdout.write("\nFacilitator kinds:\n");
      for (const k of facilitator.body.kinds ?? []) {
        process.stdout.write(`  - scheme=${k.scheme}  network=${k.network}\n`);
      }
      if (facilitator.supportsHoodi) {
        process.stdout.write("\n\x1b[32m✓ Hoodi (eip155:2910) is supported by the facilitator.\x1b[0m\n");
      } else {
        process.stdout.write(
          "\n\x1b[33m· Hoodi (eip155:2910) is NOT in the facilitator's supported list — scraper should fall back to fixture-receipt mode for Hoodi runs (PLAN §21).\x1b[0m\n",
        );
      }
    }
    process.stdout.write(
      exitCode === 0
        ? "\n\x1b[32mAll required checks passed.\x1b[0m\n"
        : `\n\x1b[31m${nonOptionalFails.length} required check(s) failed.\x1b[0m\n`,
    );
  }

  process.exit(exitCode);
}

main().catch((err) => {
  process.stderr.write(`doctor crashed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(2);
});
