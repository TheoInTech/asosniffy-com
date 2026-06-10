#!/usr/bin/env node
// Wave 0.4 — demand-funnel report (discoverability roadmap, critique C1).
//
// Reads the day-bucketed counters written by observability/funnel.ts and
// prints the quote → 402 → paid funnel by client surface, so we can answer
// "do agent buyers with funded wallets exist?" with numbers instead of vibes.
//
// Usage (against prod, with Upstash env set):
//   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... \
//     npx tsx scripts/funnel-report.ts [--days 14]
//
// Reads only known (stage, surface) combinations — no SCAN, so it's safe to
// run against the production Upstash instance at any time.

import { getCacheClient } from "../src/cache/redis.js";
import { funnelKey, type FunnelStage } from "../src/observability/funnel.js";

const STAGES: FunnelStage[] = ["quote_success", "diagnose_402", "diagnose_paid"];
const SURFACES = ["landing", "sdk", "cli", "mcp", "aso-knowledge", "anonymous"];

function parseDays(): number {
  const idx = process.argv.indexOf("--days");
  if (idx === -1) return 14;
  const n = Number(process.argv[idx + 1]);
  return Number.isInteger(n) && n > 0 && n <= 90 ? n : 14;
}

async function main(): Promise<void> {
  const cache = getCacheClient();
  if (cache.backend === "memory") {
    process.stderr.write(
      "warning: no Upstash env detected — reading the in-memory cache, which is empty in a fresh process.\n",
    );
  }

  const days = parseDays();
  const today = new Date();
  const totals: Record<FunnelStage, Record<string, number>> = {
    quote_success: {},
    diagnose_402: {},
    diagnose_paid: {},
  };
  const byDay: Array<{ day: string } & Record<string, number | string>> = [];

  for (let i = days - 1; i >= 0; i--) {
    const at = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    const day = at.toISOString().slice(0, 10);
    const row: { day: string } & Record<string, number | string> = { day };
    for (const stage of STAGES) {
      let stageTotal = 0;
      for (const surface of SURFACES) {
        const raw = await cache.get(funnelKey(stage, surface, at));
        const n = raw === null ? 0 : Number(raw) || 0;
        if (n > 0) {
          totals[stage][surface] = (totals[stage][surface] ?? 0) + n;
          stageTotal += n;
        }
      }
      row[stage] = stageTotal;
    }
    byDay.push(row);
  }

  console.log(`\nFunnel by day (last ${days} days):`);
  console.table(byDay);

  console.log("Totals by client surface:");
  console.table(
    SURFACES.map((surface) => ({
      surface,
      quote_success: totals.quote_success[surface] ?? 0,
      diagnose_402: totals.diagnose_402[surface] ?? 0,
      diagnose_paid: totals.diagnose_paid[surface] ?? 0,
    })).filter(
      (r) => r.quote_success + r.diagnose_402 + r.diagnose_paid > 0,
    ),
  );

  const sum = (s: FunnelStage) =>
    Object.values(totals[s]).reduce((a, b) => a + b, 0);
  const q = sum("quote_success");
  const f = sum("diagnose_402");
  const p = sum("diagnose_paid");
  const pct = (a: number, b: number) =>
    b === 0 ? "n/a" : `${((a / b) * 100).toFixed(1)}%`;
  console.log(
    `\nConversion: quote→402 ${pct(f, q)} (${f}/${q}) · 402→paid ${pct(p, f)} (${p}/${f}) · quote→paid ${pct(p, q)} (${p}/${q})\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
