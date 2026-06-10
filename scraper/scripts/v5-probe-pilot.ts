#!/usr/bin/env node
// Wave 0.2 / V5 — LLM share-of-voice probe variance pilot.
//
// Question this answers (critique C3): is a small-N intent-prompt probe a
// stable, repeatable measurement of "does the model recommend this app", or
// noise? AppTweak uses 10,000+ prompts; Sniffy proposes 10-20 per report.
//
// Design: 5 well-known apps x 10 intent prompts x 10 replicates against the
// production synthesis model (OPENAI_MODEL). For each replicate r we compute
// SOV_r = fraction of the 10 prompts whose answer names the app. The spread
// of SOV across replicates is the noise floor at N=10 prompts; per-prompt
// mention rates show which prompt phrasings are deterministic vs unstable.
//
// Single-model variant: only OPENAI_API_KEY is provisioned locally. The
// multi-model spread (Haiku/Gemini) is a separate question from rerun
// variance and can ride the Wave 2.1 build.
//
// Usage:  npx tsx --env-file=.env scripts/v5-probe-pilot.ts [--replicates 10]
// Output: docs/research/2026-06-discoverability/v5-probe-pilot.{json,md}
// Cost:   ~500 calls on gpt-5.4-mini ≈ $0.5-0.8 (printed from real usage).

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import OpenAI from "openai";

const MODEL = process.env.OPENAI_MODEL ?? "gpt-5.4-mini";
const PRICE_IN_PER_M = 0.75; // gpt-5.4-mini, synthesis/cost.ts 2026-05
const PRICE_OUT_PER_M = 4.5;

interface AppCase {
  app: string;
  pattern: RegExp;
  x: string; // noun phrase: "meditation"
  verb: string; // verb phrase: "meditate daily"
}

const APPS: AppCase[] = [
  { app: "Headspace", pattern: /\bheadspace\b/i, x: "meditation", verb: "start meditating daily" },
  { app: "Duolingo", pattern: /\bduolingo\b/i, x: "learning Spanish", verb: "learn Spanish" },
  { app: "Strava", pattern: /\bstrava\b/i, x: "tracking my runs", verb: "track my running progress" },
  { app: "Todoist", pattern: /\btodoist\b/i, x: "managing a to-do list", verb: "organize my daily tasks" },
  { app: "Flighty", pattern: /\bflighty\b/i, x: "tracking flights", verb: "track my flights and delays" },
];

const PROMPT_TEMPLATES: Array<(c: AppCase) => string> = [
  (c) => `What's the best iPhone app for ${c.x}? Answer in 2-3 sentences.`,
  (c) => `Recommend a mobile app for ${c.x}. Answer in 2-3 sentences.`,
  (c) => `What are the top 3 apps for ${c.x}? One line each.`,
  (c) => `I'm a complete beginner who wants to ${c.verb}. Which app should I download? Answer briefly.`,
  (c) => `Which app do most people actually use to ${c.verb}? Answer in 2-3 sentences.`,
  (c) => `What's a good affordable app for ${c.x}? Answer in 2-3 sentences.`,
  (c) => `Best free app for ${c.x} in 2026? Answer briefly.`,
  (c) => `A friend asked me for an app to ${c.verb} — what should I tell them? Keep it short.`,
  (c) => `If you could only pick ONE app for ${c.x}, which would it be and why? Two sentences.`,
  (c) => `Which ${c.x} app has the best reputation among users? Answer in 2-3 sentences.`,
];

function parseReplicates(): number {
  const idx = process.argv.indexOf("--replicates");
  if (idx === -1) return 10;
  const n = Number(process.argv[idx + 1]);
  return Number.isInteger(n) && n >= 2 && n <= 20 ? n : 10;
}

interface CallResult {
  app: string;
  promptIdx: number;
  replicate: number;
  mentioned: boolean;
  firstMention: boolean; // app is the first app-like proper noun? approximated: appears in first 60 chars
  text: string;
}

async function runOne(
  client: OpenAI,
  c: AppCase,
  promptIdx: number,
  replicate: number,
  usage: { in: number; out: number },
): Promise<CallResult> {
  const prompt = PROMPT_TEMPLATES[promptIdx]!(c);
  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
  });
  usage.in += completion.usage?.prompt_tokens ?? 0;
  usage.out += completion.usage?.completion_tokens ?? 0;
  const text = completion.choices[0]?.message?.content ?? "";
  const mentioned = c.pattern.test(text);
  const matchIdx = text.search(c.pattern);
  return {
    app: c.app,
    promptIdx,
    replicate,
    mentioned,
    firstMention: mentioned && matchIdx >= 0 && matchIdx < 60,
    text,
  };
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function sd(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY not set — run with: npx tsx --env-file=.env scripts/v5-probe-pilot.ts");
    process.exit(1);
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const replicates = parseReplicates();
  const usage = { in: 0, out: 0 };

  const jobs: Array<{ c: AppCase; p: number; r: number }> = [];
  for (const c of APPS)
    for (let p = 0; p < PROMPT_TEMPLATES.length; p++)
      for (let r = 0; r < replicates; r++) jobs.push({ c, p, r });

  console.log(`V5 pilot: ${jobs.length} calls on ${MODEL} (${APPS.length} apps x ${PROMPT_TEMPLATES.length} prompts x ${replicates} replicates)`);

  const results: CallResult[] = [];
  const CONCURRENCY = 10;
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((j) => runOne(client, j.c, j.p, j.r, usage)),
    );
    for (const s of settled) {
      if (s.status === "fulfilled") results.push(s.value);
      else console.error("call failed:", String(s.reason).slice(0, 200));
    }
    if ((i / CONCURRENCY) % 5 === 0) {
      process.stdout.write(`  ${Math.min(i + CONCURRENCY, jobs.length)}/${jobs.length}\n`);
    }
  }

  const costUsd =
    (usage.in / 1e6) * PRICE_IN_PER_M + (usage.out / 1e6) * PRICE_OUT_PER_M;

  // Per-app: SOV per replicate, then mean/SD across replicates.
  const summary = APPS.map((c) => {
    const rows = results.filter((x) => x.app === c.app);
    const sovPerReplicate: number[] = [];
    for (let r = 0; r < replicates; r++) {
      const rep = rows.filter((x) => x.replicate === r);
      if (rep.length === 0) continue;
      sovPerReplicate.push(rep.filter((x) => x.mentioned).length / rep.length);
    }
    const perPrompt = PROMPT_TEMPLATES.map((_, p) => {
      const pr = rows.filter((x) => x.promptIdx === p);
      return pr.length === 0 ? null : pr.filter((x) => x.mentioned).length / pr.length;
    });
    return {
      app: c.app,
      sovMean: mean(sovPerReplicate),
      sovSd: sd(sovPerReplicate),
      perPromptMentionRate: perPrompt,
      stablePrompts: perPrompt.filter((v) => v !== null && (v === 0 || v === 1)).length,
      calls: rows.length,
    };
  });

  const here = dirname(fileURLToPath(import.meta.url));
  const outDir = resolve(here, "..", "..", "docs", "research", "2026-06-discoverability");
  writeFileSync(
    resolve(outDir, "v5-probe-pilot.json"),
    JSON.stringify({ model: MODEL, replicates, ranAt: new Date().toISOString(), usage, costUsd, summary, results: results.map(({ text, ...r }) => ({ ...r, textHead: text.slice(0, 120) })) }, null, 2),
  );

  const md = [
    `# V5 Pilot — LLM Probe Variance (single-model)`,
    ``,
    `Ran ${new Date().toISOString().slice(0, 10)} · model \`${MODEL}\` · ${results.length}/${jobs.length} calls OK · tokens ${usage.in} in / ${usage.out} out · **$${costUsd.toFixed(3)}**`,
    ``,
    `SOV_r = share of the 10 intent prompts whose answer names the app, per replicate r (n=${replicates}).`,
    ``,
    `| App | SOV mean | SOV SD (replicate noise) | deterministic prompts (0% or 100%) |`,
    `|---|---|---|---|`,
    ...summary.map((s) => `| ${s.app} | ${(s.sovMean * 100).toFixed(0)}% | ±${(s.sovSd * 100).toFixed(1)}pp | ${s.stablePrompts}/10 |`),
    ``,
    `Per-prompt mention rates (rows = apps, cols = prompt templates 1-10):`,
    ``,
    `| App | ${PROMPT_TEMPLATES.map((_, i) => `P${i + 1}`).join(" | ")} |`,
    `|---|${PROMPT_TEMPLATES.map(() => "---").join("|")}|`,
    ...summary.map(
      (s) => `| ${s.app} | ${s.perPromptMentionRate.map((v) => (v === null ? "—" : `${(v * 100).toFixed(0)}%`)).join(" | ")} |`,
    ),
    ``,
    `## Reading`,
    `- **SOV SD** is the noise floor of a 10-prompt probe: if SD is small (≲5pp), a 10-prompt single-shot probe is a stable product measurement; if large, Wave 2.1 must average across replicates or grow the prompt set.`,
    `- **Deterministic prompts** (always/never mention) measure how much of the signal is phrasing-stable; mid-rate prompts are where sampling noise lives.`,
    `- Single-model caveat: cross-model spread (Haiku/Gemini) is a separate axis, measured at Wave 2.1 build time.`,
  ].join("\n");
  writeFileSync(resolve(outDir, "v5-probe-pilot.md"), md);

  console.log(`\nDone. $${costUsd.toFixed(3)} spent. Results:`);
  for (const s of summary) {
    console.log(`  ${s.app}: SOV ${(s.sovMean * 100).toFixed(0)}% ± ${(s.sovSd * 100).toFixed(1)}pp, ${s.stablePrompts}/10 prompts deterministic`);
  }
  console.log(`Wrote v5-probe-pilot.{json,md} to docs/research/2026-06-discoverability/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
