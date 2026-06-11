import type OpenAI from "openai";
import { env } from "../env.js";
import { getOpenAiClient } from "../synthesis/openai-client.js";
import { computeOpenAiCost } from "../synthesis/cost.js";
import { recordCogs } from "../observability/cogs-ledger.js";
import { withCache } from "../cache/wrapper.js";
import { cacheKey } from "../cache/keys.js";
import { detectNameMention } from "./llm-mention.js";
import {
  aggregateAiVisibility,
  PROMPT_SET_VERSION,
  renderProbePrompt,
  type AiVisibility,
  type LlmProbeRawRow,
} from "../scoring/ai-visibility.js";

// Wave 2.1 (discoverability roadmap) — LLM share-of-voice probe, the I/O
// half of the paid `aiVisibility` section. Runs the V5-calibrated probe
// matrix (the 10 pilot templates × 1-2 intents × replicates × models),
// detects target/competitor mentions per answer, and hands the raw rows to
// scoring/ai-visibility.ts for aggregation.
//
// Methodology source: V5 verdict in docs/research/2026-06-discoverability/
// verification-verdicts.md + the variance pilot (v5-probe-pilot.md,
// scripts/v5-probe-pilot.ts). Pilot-measured default shape: 10 prompts ×
// 2 replicates × 1 model per intent ≈ $0.02/report on gpt-5.4-mini. Hard cap
// MAX_TOTAL_CALLS = 60 calls per run, whatever the inputs ask for.
//
// Call layer: every model id routes through a ProbeChatClient adapter.
// Today the only provisioned key is OpenAI, so resolveProbeClient() maps
// every model to the OpenAI adapter; adding Anthropic/Gemini later means
// writing one new adapter + one routing branch — not rewriting the matrix,
// detection, caching, or aggregation. Cross-model spread is unmeasured (V5
// caveat), so multi-model results widen, not tighten, honesty requirements.
//
// Failure posture (never throws):
//   • flag off (LLM_PROBE_ENABLED, default false) → null
//   • no OpenAI client → null
//   • empty intents / empty app name → null (insufficient input; a probe
//     that cannot attribute mentions would fabricate a 0% SOV)
//   • a failed call is dropped, not fatal; but if >30% of planned calls
//     fail, the whole run returns null — partial SOV from a broken run is
//     dishonest, and the error envelope keeps it out of the cache so the
//     next request retries live.
//
// Caching: the AGGREGATED AiVisibility is cached for 7 days under
// (country, appId, intents, promptSet, models, ISO-week) — roadmap rule
// "cache by (appId, promptSet, week)". Reading the system clock for the
// week key happens HERE (I/O code), never in the pure scoring module. Cache
// hits get provenance rewritten "live" → "cached" by the wrapper. Raw
// answer text is never stored anywhere — only post-detection booleans.
//
// What this provider deliberately does NOT claim (A2 verdict): Sniffy is
// not the only LLM-visibility product — AppTweak AI Visibility (enterprise
// demo-gated) and LLM Pulse (subscription) exist. The differentiator is the
// per-request, agent-buyable pricing model. Never write "only LLM
// visibility tool" in copy, docs, or tool descriptions. The probe measures
// model recall with tools OFF; a retrieval-on split is future adapter work.

export interface LlmProbeInput {
  appId: string;
  appName: string;
  intents: readonly string[];
  competitors: ReadonlyArray<{ name: string }>;
  store: "ios" | "android";
  country: string;
}

export interface LlmProbeOptions {
  enabled?: boolean; // default env.LLM_PROBE_ENABLED
  replicates?: number; // default DEFAULT_REPLICATES, clamped by the call cap
  models?: readonly string[]; // default [env.OPENAI_MODEL]
}

const PROVIDER = "openai-probe";
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;
const TEMPLATE_COUNT = 10;
const MAX_INTENTS = 2;
const DEFAULT_REPLICATES = 2; // V5 verdict: 10 prompts × 2 replicates
const MAX_REPLICATES = 10;
const MAX_TOTAL_CALLS = 60;
const MAX_FAILURE_RATE = 0.3;
const CONCURRENCY = 8;

// Vendor-neutral call adapter. One implementation per provider key; the
// matrix below only ever sees this shape.
interface ProbeChatClient {
  complete(
    model: string,
    prompt: string,
  ): Promise<{ text: string; inputTokens: number; outputTokens: number }>;
}

function openAiProbeAdapter(client: OpenAI): ProbeChatClient {
  return {
    async complete(model, prompt) {
      const completion = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
      });
      const text = completion.choices[0]?.message?.content ?? "";
      if (text.length === 0) throw new Error("empty_response");
      return {
        text,
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
      };
    },
  };
}

// Model → adapter routing. Today every model routes to OpenAI (the only
// provisioned key); an Anthropic/Gemini adapter slots in as a new branch
// keyed on the model id prefix.
function resolveProbeClient(_model: string): ProbeChatClient | null {
  const openai = getOpenAiClient();
  if (openai === null) return null;
  return openAiProbeAdapter(openai);
}

export async function runLlmProbe(
  input: LlmProbeInput,
  opts?: { enabled?: boolean; replicates?: number; models?: readonly string[] },
): Promise<AiVisibility | null> {
  const enabled = opts?.enabled ?? env.LLM_PROBE_ENABLED;
  if (!enabled) return null;

  // Insufficient-input gates — before any client, cache, or network work.
  const appName = input.appName.trim();
  if (appName.length === 0) return null;
  const intents = dedupeStrings(input.intents).slice(0, MAX_INTENTS);
  if (intents.length === 0) return null;

  const models = dedupeStrings(opts?.models ?? [env.OPENAI_MODEL]);
  if (models.length === 0) return null;
  if (models.some((m) => resolveProbeClient(m) === null)) return null;

  // Call-cap arithmetic: drop trailing models first, then clamp replicates
  // so the matrix never exceeds MAX_TOTAL_CALLS. With intents ≤ 2 the floor
  // (1 model × 1 replicate × 20 calls) always fits.
  while (models.length > 1 && TEMPLATE_COUNT * intents.length * models.length > MAX_TOTAL_CALLS) {
    models.pop();
  }
  const requested = clampInt(opts?.replicates ?? DEFAULT_REPLICATES, 1, MAX_REPLICATES);
  const replicates = Math.max(
    1,
    Math.min(
      requested,
      Math.floor(MAX_TOTAL_CALLS / (TEMPLATE_COUNT * intents.length * models.length)),
    ),
  );

  const competitorNames = dedupeCompetitorNames(input.competitors, appName);

  try {
    const result = await withCache<AiVisibility | { error: string }>(
      () => runProbeMatrix({ input, appName, intents, competitorNames, replicates, models }),
      {
        key: cacheKey({
          namespace: "llm:probe",
          country: input.country.toUpperCase(),
          appId: input.appId,
          extra: {
            intents: [...intents].map((i) => i.toLowerCase()).sort().join("|"),
            promptSet: PROMPT_SET_VERSION,
            models: models.join(","),
            week: isoWeekString(new Date()),
          },
        }),
        ttlSeconds: SEVEN_DAYS_SECONDS,
        namespace: "llm:probe",
        audit: { provider: PROVIDER, endpoint: "/chat/completions" },
        // Quarantine malformed cached payloads (schema drift, manual edits).
        validate: (v) =>
          typeof v === "object" &&
          v !== null &&
          (v as AiVisibility).promptSetVersion === PROMPT_SET_VERSION &&
          typeof (v as AiVisibility).targetSov === "number",
      },
    );
    if (typeof result === "object" && result !== null && "error" in result) return null;
    return result;
  } catch {
    // Cache-layer failure (Redis hiccup, JSON drift) — the paid report
    // degrades to a missing section, never a thrown 500.
    return null;
  }
}

interface ProbeMatrixArgs {
  input: LlmProbeInput;
  appName: string;
  intents: readonly string[];
  competitorNames: readonly string[];
  replicates: number;
  models: readonly string[];
}

async function runProbeMatrix(args: ProbeMatrixArgs): Promise<AiVisibility | { error: string }> {
  const { input, appName, intents, competitorNames, replicates, models } = args;

  interface Job {
    templateIdx: number;
    intent: string;
    replicate: number;
    model: string;
  }
  const jobs: Job[] = [];
  for (const intent of intents) {
    for (let t = 0; t < TEMPLATE_COUNT; t++) {
      for (let r = 0; r < replicates; r++) {
        for (const model of models) jobs.push({ templateIdx: t, intent, replicate: r, model });
      }
    }
  }

  const usageByModel = new Map<string, { inputTokens: number; outputTokens: number }>();
  const rows: LlmProbeRawRow[] = [];
  let failed = 0;

  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(
      batch.map(async (job): Promise<LlmProbeRawRow | null> => {
        // Per-call try/catch: a failed call is dropped, not fatal.
        try {
          const client = resolveProbeClient(job.model);
          if (client === null) return null;
          const prompt = renderProbePrompt(job.templateIdx, job.intent, input.store);
          const { text, inputTokens, outputTokens } = await client.complete(job.model, prompt);
          const usage = usageByModel.get(job.model) ?? { inputTokens: 0, outputTokens: 0 };
          usage.inputTokens += inputTokens;
          usage.outputTokens += outputTokens;
          usageByModel.set(job.model, usage);
          // Detection only — the answer text is dropped here and never
          // stored or returned (response weight + privacy).
          return {
            templateIdx: job.templateIdx,
            intent: job.intent,
            replicate: job.replicate,
            model: job.model,
            mentionedTarget: detectNameMention(text, appName),
            mentionedCompetitors: competitorNames.filter((name) =>
              detectNameMention(text, name),
            ),
          };
        } catch {
          return null;
        }
      }),
    );
    for (const row of settled) {
      if (row !== null) rows.push(row);
      else failed += 1;
    }
  }

  logProbeCost({ input, intents, models, planned: jobs.length, failed, usageByModel });

  // >30% failures: partial SOV from a broken run is dishonest. The error
  // envelope also keeps the run out of the cache.
  if (failed > MAX_FAILURE_RATE * jobs.length) {
    return { error: `probe_failure_rate ${failed}/${jobs.length}` };
  }

  const visibility = aggregateAiVisibility(rows, {
    targetName: appName,
    competitors: competitorNames,
    replicates,
    store: input.store,
    failedCalls: failed,
  });
  // <10 surviving rows — too thin to aggregate honestly (also uncached).
  if (visibility === null) return { error: "insufficient_rows" };
  return visibility;
}

function logProbeCost(args: {
  input: LlmProbeInput;
  intents: readonly string[];
  models: readonly string[];
  planned: number;
  failed: number;
  usageByModel: ReadonlyMap<string, { inputTokens: number; outputTokens: number }>;
}): void {
  if (process.env.ENABLE_REQUEST_LOG === "false") return;
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd: number | null = null;
  for (const [model, usage] of args.usageByModel) {
    inputTokens += usage.inputTokens;
    outputTokens += usage.outputTokens;
    const cost = computeOpenAiCost({ model, ...usage });
    if (cost.costUsd !== null) costUsd = (costUsd ?? 0) + cost.costUsd;
  }
  process.stdout.write(
    `${JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      event: "llm_probe",
      appId: args.input.appId,
      country: args.input.country,
      intents: args.intents,
      models: args.models,
      totalCalls: args.planned - args.failed,
      failedCalls: args.failed,
      inputTokens,
      outputTokens,
      costUsd,
    })}\n`,
  );
  // Cost-aware pricing — record the probe spend against aiVisibility on the
  // per-request COGS ledger. Multiple models collapse to one entry (the probe
  // is one logical feature); the per-model split stays in the llm_probe log.
  recordCogs({
    feature: "aiVisibility",
    provider: "openai-probe",
    model: args.models.join("+"),
    costUsd: costUsd ?? 0,
    source: "live",
    inputTokens,
    outputTokens,
  });
}

// ISO-8601 week label ("2026-W24") for the cache key — the roadmap's weekly
// re-scan cadence (cited-source churn is 40-60%/month). Clock access lives
// here in the provider; the scoring module stays clock-free.
function isoWeekString(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7; // Mon=1..Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum); // nearest Thursday
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function dedupeStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    const key = value.toLowerCase();
    if (value.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function dedupeCompetitorNames(
  competitors: ReadonlyArray<{ name: string }>,
  appName: string,
): string[] {
  return dedupeStrings(competitors.map((c) => c.name)).filter(
    (name) => name.toLowerCase() !== appName.toLowerCase(),
  );
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
