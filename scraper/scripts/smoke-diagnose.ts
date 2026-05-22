// Phase A/B/C/D smoke test — calls the orchestrator directly so we can
// eyeball synthesis output against live iTunes data without going through
// the x402 / HTTP layer.
//
// Run:
//   pnpm --filter @sniffy/scraper exec tsx --env-file=.env scripts/smoke-diagnose.ts
//
// Env requirements (in scraper/.env):
//   PRODUCT_CONTEXT_ENABLED=true   (else Phase B is dormant)
//   OPENAI_API_KEY=<key>           (only for tier="standard"/"expert")
//
// Defaults to tier="quick" so the smoke skips OpenAI (faster + cheaper).
// Flip the TIER constant below to "standard" to also exercise the AI path.

import { nanoid } from "nanoid";
import { generateReportWithMeta } from "../src/orchestrator/index.js";
import type { RequestId, SniffId } from "../src/schemas/index.js";

const APP_NAME = process.env.SMOKE_APP ?? "Streaks";
const COUNTRY = (process.env.SMOKE_COUNTRY ?? "US").toUpperCase();
const KEYWORDS = (process.env.SMOKE_KEYWORDS ?? "habit tracker,streaks,daily routine")
  .split(",")
  .map((k) => k.trim())
  .filter((k) => k.length > 0);
const TIER = (process.env.SMOKE_TIER ?? "quick") as "quick" | "standard" | "expert";

function header(label: string): void {
  console.log("");
  console.log(`========== ${label} ==========`);
}

async function main(): Promise<void> {
  console.log(`Smoking ${APP_NAME} (${COUNTRY}) — tier=${TIER} — keywords=${KEYWORDS.join(", ")}`);
  console.log(`PRODUCT_CONTEXT_ENABLED=${process.env.PRODUCT_CONTEXT_ENABLED ?? "(unset)"}`);
  console.log(`BROWSERBASE_API_KEY=${process.env.BROWSERBASE_API_KEY ? "set" : "(unset)"}`);
  console.log("");

  const started = Date.now();
  const result = await generateReportWithMeta({
    requestId: `req_smoke_${nanoid(8)}` as RequestId,
    sniffId: `sniff_smoke_${nanoid(8)}` as SniffId,
    store: "ios",
    app: APP_NAME,
    country: COUNTRY as never, // CountryCode brand — runtime-validated upstream
    keywords: KEYWORDS,
    tier: TIER,
    allowFixtureFallback: false,
  });
  const elapsedMs = Date.now() - started;

  header("ENGINE TIMING");
  console.log(`elapsed: ${elapsedMs}ms`);

  header("DETECTED APP");
  console.log(`name:      ${result.detectedApp.name}`);
  console.log(`developer: ${result.detectedApp.developer}`);
  console.log(`id:        ${result.detectedApp.id}`);
  console.log(`iconUrl:   ${result.detectedApp.iconUrl ?? "(none)"}`);

  const payload = result.payload as Record<string, unknown>;

  header("PROVIDER ERRORS");
  if (result.providerErrors.length === 0) {
    console.log("(none)");
  } else {
    for (const err of result.providerErrors) {
      console.log(`- ${err.provider} (${err.kind}): ${err.message}`);
    }
  }

  header("DATA PROVENANCE");
  const dp = payload.dataProvenance as Record<string, string> | undefined;
  if (dp) {
    for (const [k, v] of Object.entries(dp)) {
      console.log(`  ${k.padEnd(20)} ${v}`);
    }
  }

  header("COMPETITORS (competitorTrail)");
  const competitors = (payload.competitorTrail as Array<Record<string, unknown>>) ?? [];
  console.log(`count: ${competitors.length}`);
  for (let i = 0; i < Math.min(competitors.length, 5); i++) {
    const c = competitors[i]!;
    console.log(
      `  #${i + 1} ${c.name} — tier:${c.tier ?? "?"} position:${c.searchPosition ?? "?"} — overlap:[${
        Array.isArray(c.overlapKeywords) ? c.overlapKeywords.join(", ") : ""
      }] unique:[${
        Array.isArray(c.uniqueToCompetitor) ? c.uniqueToCompetitor.join(", ") : ""
      }]`,
    );
  }
  if (competitors.length > 5) console.log(`  ... and ${competitors.length - 5} more`);

  header("READY TO PASTE");
  const rtp = payload.readyToPaste as Record<string, unknown>;
  console.log(`source: ${rtp.source}`);
  for (const fieldName of [
    "title",
    "subtitle",
    "keywordsField",
    "promotionalText",
    "androidShortDescription",
    "shortDescription",
  ]) {
    const f = rtp[fieldName] as
      | {
          current: string;
          recommended: string | null;
          changeReason: string | null;
          charCount: number;
          charLimit: number;
        }
      | null
      | undefined;
    if (!f) continue;
    console.log("");
    console.log(`  --- ${fieldName} (${f.charCount}/${f.charLimit}) ---`);
    console.log(`     current     : ${truncate(JSON.stringify(f.current), 100)}`);
    console.log(
      `     recommended : ${
        f.recommended === null ? "NO CHANGE" : truncate(JSON.stringify(f.recommended), 100)
      }`,
    );
    if (f.changeReason) {
      console.log(`     why         : ${truncate(f.changeReason, 200)}`);
    }
  }

  header("SUMMARY");
  console.log(payload.summary);

  header("RECOMMENDATIONS");
  const recs = (payload.recommendations as Array<Record<string, unknown>>) ?? [];
  for (const r of recs) {
    console.log(`  [${r.rank}] (impact:${r.impact} effort:${r.effort}) ${r.action}`);
    console.log(`       ${truncate(String(r.rationale), 200)}`);
  }

  header("SUGGESTED KEYWORDS");
  const sk = (payload.suggestedKeywords as Array<Record<string, unknown>>) ?? [];
  console.log(`count: ${sk.length}`);
  for (const s of sk.slice(0, 10)) {
    console.log(`  - ${s.keyword} (reason: ${s.reason})`);
  }
  if (sk.length > 10) console.log(`  ... and ${sk.length - 10} more`);

  header("DONE");
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

main().catch((err) => {
  console.error("");
  console.error("=== SMOKE FAILED ===");
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
