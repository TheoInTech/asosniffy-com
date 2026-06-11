import type { Provenance } from "../schemas/index.js";

// LLM share-of-voice aggregation — the PURE half of the Wave 2.1 aiVisibility
// section (discoverability roadmap 2.1). The provider
// (providers/llm-probe.ts) makes the calls and detects mentions; this module
// only turns already-detected raw rows into the report section. No I/O, no
// clock, no LLM.
//
// Where the numbers and rules come from:
//   • Prompt set "v5-10": the EXACT 10 intent templates from the V5 variance
//     pilot — scripts/v5-probe-pilot.ts, results in
//     docs/research/2026-06-discoverability/v5-probe-pilot.md (2026-06-10,
//     500 calls, gpt-5.4-mini). The V5 verdict
//     (docs/research/2026-06-discoverability/verification-verdicts.md) found
//     variance is PHRASING-dominated, so the ±pp calibration below is only
//     valid for this exact template set. Changing a template invalidates the
//     band — bump PROMPT_SET_VERSION if you do.
//   • Slot filling: the pilot distinguished noun-phrase (x) and verb-phrase
//     (verb) slots per app case. Product intents are user keywords, so BOTH
//     slots are filled with the intent verbatim; templates 4/5/8 read
//     slightly rough for noun keywords ("wants to habit tracker") — accepted
//     to keep the prompt bytes identical to the calibrated pilot set.
//     Template 1's device word follows the store (iPhone/Android), same
//     convention as providers/llm-mention.ts; the pilot ran iOS-only.
//   • sovBand derivation (basis "v5-pilot-2026-06"): the pilot's replicate
//     SD at n=10 prompts was ±11.4pp for the one mid-SOV app (Flighty, SOV
//     51%) and ±3.0–5.0pp for the four edge-SOV apps (Headspace, Duolingo,
//     Strava, Todoist) — we take the conservative edge value, ±5pp. A run
//     that averages R replicates is a mean of R approximately independent
//     single-replicate measurements, so the band scales by 1/√R (standard
//     error of the mean). Mid-SOV is 0.2 ≤ SOV ≤ 0.8, boundaries inclusive.
//
// What this module deliberately does NOT claim:
//   • The band is a CALIBRATION borrowed from a 5-app, single-model
//     (gpt-5.4-mini) pilot — not a per-run confidence interval, and the
//     cross-model spread is unmeasured (V5 "still to measure at build").
//   • SOV is a sample estimate of one model family's recommendation recall
//     with tools OFF — not population share, not retrieval-time visibility,
//     and store rank is NOT an input to it.
//   • No causal story for misses: a deterministic miss says "never named",
//     never WHY.
//   • Positioning copy (A2 verdict): the differentiator is per-request,
//     agent-buyable pricing — AppTweak AI Visibility (enterprise demo-gated)
//     and LLM Pulse (subscription) exist. Never claim capability uniqueness.
//
// Honesty gates: null when fewer than MIN_ROWS rows survive (a thin run is
// not a measurement), null when the target name is empty (mentions cannot be
// attributed), and a (template, intent) group needs at least 2 observations
// before a zero-mention result is called a "deterministic" miss.

export const PROMPT_SET_VERSION = "v5-10" as const;

export interface PromptSlots {
  intent: string;
  device: string; // "iPhone" | "Android" — template 1 only
}

// Verbatim template text from scripts/v5-probe-pilot.ts PROMPT_TEMPLATES,
// with x/verb both mapped to `intent` (see header) and the device word
// parameterized in template 1.
export const PROBE_PROMPT_TEMPLATES: ReadonlyArray<(slots: PromptSlots) => string> = [
  ({ intent, device }) => `What's the best ${device} app for ${intent}? Answer in 2-3 sentences.`,
  ({ intent }) => `Recommend a mobile app for ${intent}. Answer in 2-3 sentences.`,
  ({ intent }) => `What are the top 3 apps for ${intent}? One line each.`,
  ({ intent }) => `I'm a complete beginner who wants to ${intent}. Which app should I download? Answer briefly.`,
  ({ intent }) => `Which app do most people actually use to ${intent}? Answer in 2-3 sentences.`,
  ({ intent }) => `What's a good affordable app for ${intent}? Answer in 2-3 sentences.`,
  ({ intent }) => `Best free app for ${intent} in 2026? Answer briefly.`,
  ({ intent }) => `A friend asked me for an app to ${intent} — what should I tell them? Keep it short.`,
  ({ intent }) => `If you could only pick ONE app for ${intent}, which would it be and why? Two sentences.`,
  ({ intent }) => `Which ${intent} app has the best reputation among users? Answer in 2-3 sentences.`,
];

export function renderProbePrompt(
  templateIdx: number,
  intent: string,
  store: "ios" | "android",
): string {
  const template = PROBE_PROMPT_TEMPLATES[templateIdx];
  if (!template) throw new RangeError(`templateIdx ${templateIdx} outside v5-10 prompt set`);
  return template({ intent, device: store === "ios" ? "iPhone" : "Android" });
}

// One successful probe call, post-detection. Deliberately carries NO answer
// text (response weight + privacy): detection happens in the provider, only
// the booleans/names survive.
export interface LlmProbeRawRow {
  templateIdx: number;
  intent: string;
  replicate: number;
  model: string;
  mentionedTarget: boolean;
  mentionedCompetitors: string[];
}

export interface ShareOfVoiceEntry {
  name: string;
  isTarget: boolean;
  mentions: number;
  mentionRate: number; // mentions / totalCalls, 0..1
}

export interface PromptTableEntry {
  templateIdx: number;
  intent: string;
  prompt: string; // template text with the intent filled
  mentionRate: number; // target mention rate within this (template, intent)
}

export interface DeterministicMiss {
  templateIdx: number;
  intent: string;
  prompt: string;
}

export interface AiVisibility {
  targetSov: number; // 0..1
  sovBand: { plusMinusPp: number; basis: typeof SOV_BAND_BASIS };
  shareOfVoice: ShareOfVoiceEntry[];
  promptTable: PromptTableEntry[];
  deterministicMisses: DeterministicMiss[];
  modelsUsed: string[];
  promptSetVersion: typeof PROMPT_SET_VERSION;
  totalCalls: number; // successful, aggregated calls (= rows.length)
  failedCalls: number; // dropped calls, reported for transparency
  provenance: Provenance; // "live"; the cache wrapper rewrites to "cached"
}

export interface AggregateAiVisibilityOptions {
  targetName: string;
  competitors: readonly string[];
  replicates: number; // ACTUAL replicates run (post-clamp), for the band
  store?: "ios" | "android"; // device word for rendered prompts; default ios
  failedCalls?: number; // dropped-call count from the provider; default 0
}

const MIN_ROWS = 10;
const MIN_GROUP_ROWS_FOR_DETERMINISTIC = 2;
const MID_SOV_LOW = 0.2;
const MID_SOV_HIGH = 0.8;
// v5-probe-pilot.md: Flighty (SOV 51%) replicate SD at n=10 prompts.
const MID_SOV_SINGLE_REPLICATE_PP = 11.4;
// v5-probe-pilot.md: max SD among the four edge-SOV apps (±3.0–5.0pp).
const EDGE_SOV_SINGLE_REPLICATE_PP = 5.0;
const SOV_BAND_BASIS = "v5-pilot-2026-06" as const;

export function aggregateAiVisibility(
  rows: readonly LlmProbeRawRow[],
  opts: AggregateAiVisibilityOptions,
): AiVisibility | null {
  const targetName = opts.targetName.trim();
  if (targetName.length === 0) return null;
  if (rows.length < MIN_ROWS) return null;

  const store = opts.store ?? "ios";
  const replicates = Math.max(1, opts.replicates);
  const totalCalls = rows.length;

  // --- Share of voice -----------------------------------------------------
  const competitorNames = dedupeCompetitors(opts.competitors, targetName);
  const targetMentions = rows.filter((r) => r.mentionedTarget).length;
  const targetSov = round4(targetMentions / totalCalls);

  const entries: ShareOfVoiceEntry[] = [
    {
      name: targetName,
      isTarget: true,
      mentions: targetMentions,
      mentionRate: targetSov,
    },
    ...competitorNames.map((name) => {
      const needle = name.toLowerCase();
      const mentions = rows.filter((r) =>
        r.mentionedCompetitors.some((c) => c.trim().toLowerCase() === needle),
      ).length;
      return {
        name,
        isTarget: false,
        mentions,
        mentionRate: round4(mentions / totalCalls),
      };
    }),
  ];
  entries.sort(
    (a, b) =>
      b.mentionRate - a.mentionRate ||
      Number(b.isTarget) - Number(a.isTarget) ||
      a.name.localeCompare(b.name),
  );

  // --- Prompt table + deterministic misses --------------------------------
  const groups = new Map<string, { templateIdx: number; intent: string; rows: LlmProbeRawRow[] }>();
  for (const row of rows) {
    const key = `${row.templateIdx} ${row.intent}`;
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else groups.set(key, { templateIdx: row.templateIdx, intent: row.intent, rows: [row] });
  }
  const sortedGroups = Array.from(groups.values()).sort(
    (a, b) => a.templateIdx - b.templateIdx || a.intent.localeCompare(b.intent),
  );

  const promptTable: PromptTableEntry[] = [];
  const deterministicMisses: DeterministicMiss[] = [];
  for (const group of sortedGroups) {
    const prompt = renderProbePrompt(group.templateIdx, group.intent, store);
    const mentioned = group.rows.filter((r) => r.mentionedTarget).length;
    promptTable.push({
      templateIdx: group.templateIdx,
      intent: group.intent,
      prompt,
      mentionRate: round4(mentioned / group.rows.length),
    });
    if (mentioned === 0 && group.rows.length >= MIN_GROUP_ROWS_FOR_DETERMINISTIC) {
      deterministicMisses.push({
        templateIdx: group.templateIdx,
        intent: group.intent,
        prompt,
      });
    }
  }

  return {
    targetSov,
    sovBand: sovBand(targetSov, replicates),
    shareOfVoice: entries,
    promptTable,
    deterministicMisses,
    modelsUsed: Array.from(new Set(rows.map((r) => r.model))).sort(),
    promptSetVersion: PROMPT_SET_VERSION,
    totalCalls,
    failedCalls: opts.failedCalls ?? 0,
    provenance: "live",
  };
}

// Band derivation (see header for the full sourcing): single-replicate noise
// from the V5 pilot — ±11.4pp at mid-SOV (where indie apps live), ±5pp at
// the edges (deterministic-prompt regime) — divided by √replicates because
// the shipped SOV is the mean of `replicates` independent single-replicate
// runs. Rounded to 0.1pp for stable JSON.
function sovBand(
  targetSov: number,
  replicates: number,
): { plusMinusPp: number; basis: typeof SOV_BAND_BASIS } {
  const single =
    targetSov >= MID_SOV_LOW && targetSov <= MID_SOV_HIGH
      ? MID_SOV_SINGLE_REPLICATE_PP
      : EDGE_SOV_SINGLE_REPLICATE_PP;
  return {
    plusMinusPp: round1(single / Math.sqrt(replicates)),
    basis: SOV_BAND_BASIS,
  };
}

function dedupeCompetitors(
  competitors: readonly string[],
  targetName: string,
): string[] {
  const target = targetName.toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of competitors) {
    const name = raw.trim();
    const key = name.toLowerCase();
    if (name.length === 0 || key === target || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
