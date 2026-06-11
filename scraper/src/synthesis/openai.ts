import { z } from "zod";
import type OpenAI from "openai";
import {
  type ReadyToPaste,
  type ReadyToPasteField,
  RecommendationItem,
} from "../schemas/index.js";
import { APPLE_CAPS } from "../scoring/index.js";
import { env } from "../env.js";
import { recordOpenAiCogs } from "../observability/cogs-ledger.js";
import { getOpenAiClient } from "./openai-client.js";
import {
  buildFullReportPrompt,
  findOffPoolTokens,
  FULL_REPORT_RESPONSE_SCHEMA,
  FULL_REPORT_SCHEMA_NAME,
} from "./prompts/full-report.js";
import {
  computeOpenAiCost,
  logOpenAiCost,
} from "./cost.js";
import {
  applyNetValueGuard,
  buildNetValueContext,
  SHORT_DESCRIPTION_CAP,
  synthesizeReportTemplate,
  type SynthesisInput,
  type SynthesisOutput,
} from "./template.js";

// OpenAI synthesis with deterministic-template fallback.
//
// Fallback triggers (per Phase 04 decisions):
//   • OPENAI_API_KEY missing
//   • OpenAI request error (network / 4xx / 5xx / timeout)
//   • JSON parse failure on the response body
//   • Zod schema validation failure on the parsed response
//
// In every fallback case the function emits a cost-telemetry log with
// `outcome: "synth_fallback"` and the failure reason, then returns the
// template output. The function never throws.

export interface OpenAiSynthesisOptions {
  requestId: string;
  client?: OpenAI | null; // injection seam for tests
}

// Lean shape: the model only generates the novel text. The adapter fills in
// `current`, `charCount`, `charLimit`, and the top-level `source` from the
// scoring input — never trust the model with bookkeeping it can't validate.
const ReadyToPasteAiField = z.object({
  recommended: z.string().nullable(),
  changeReason: z.string().nullable(),
});

const OpenAiResponseShape = z.object({
  summary: z.string().min(1),
  recommendations: z.array(RecommendationItem).min(1).max(5),
  readyToPaste: z.object({
    title: ReadyToPasteAiField,
    subtitle: ReadyToPasteAiField,
    keywordsField: ReadyToPasteAiField,
    shortDescription: ReadyToPasteAiField,
  }),
});

type ReadyToPasteAiPayload = z.infer<
  typeof OpenAiResponseShape
>["readyToPaste"];

export async function synthesizeReportOpenAi(
  input: SynthesisInput,
  options: OpenAiSynthesisOptions,
): Promise<SynthesisOutput> {
  // Phase 1: refuse to spend OpenAI tokens generating concrete recommendations
  // when the underlying data is fixture or degraded. The template path
  // emits clearly-labeled sample-disclaimer copy in those cases — see
  // synthesizeReportTemplate.
  if (input.inputProvenance === "fixture" || input.inputProvenance === "degraded") {
    logOpenAiCost({
      kind: "openai_cost",
      requestId: options.requestId,
      model: env.OPENAI_MODEL,
      outcome: "synth_fallback",
      modelInputTokens: 0,
      modelOutputTokens: 0,
      costUsd: 0,
      fallbackReason: `input_provenance_${input.inputProvenance}`,
    });
    return synthesizeReportTemplate(input);
  }

  const client = options.client ?? getOpenAiClient();

  if (!client) {
    logOpenAiCost({
      kind: "openai_cost",
      requestId: options.requestId,
      model: env.OPENAI_MODEL,
      outcome: "synth_fallback",
      modelInputTokens: 0,
      modelOutputTokens: 0,
      costUsd: 0,
      fallbackReason: "missing_api_key",
    });
    return synthesizeReportTemplate(input);
  }

  const { system, user } = buildFullReportPrompt(input);

  try {
    const completion = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: FULL_REPORT_SCHEMA_NAME,
          strict: true,
          schema: FULL_REPORT_RESPONSE_SCHEMA,
        },
      },
    });

    const message = completion.choices[0]?.message;
    const content = message?.content;
    if (!content) {
      return fallbackWithTelemetry({
        input,
        requestId: options.requestId,
        usage: completion.usage,
        reason: "empty_response",
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      return fallbackWithTelemetry({
        input,
        requestId: options.requestId,
        usage: completion.usage,
        reason: `json_parse_failed:${(err as Error).message}`,
      });
    }

    const validated = OpenAiResponseShape.safeParse(parsed);
    if (!validated.success) {
      return fallbackWithTelemetry({
        input,
        requestId: options.requestId,
        usage: completion.usage,
        reason: `schema_validation_failed:${validated.error.issues[0]?.path.join(".") ?? "unknown"}`,
      });
    }

    // Phase 9 — Post-hoc relevance validator. If the gate populated a
    // candidate pool, every token in keywordsField.recommended must be
    // either a user-supplied input keyword or a relevance-gated pool
    // entry. Tokens outside both lists indicate the model invented or
    // promoted an off-topic term despite the prompt rule. Fall back to
    // the deterministic template so the paid /diagnose never ships
    // off-pool keywords. This is the suspenders to the prompt's belt.
    if (input.scoredCandidates && input.scoredCandidates.length > 0) {
      const pool = input.scoredCandidates
        .filter((c) => c.relevanceLabel !== "off-topic")
        .map((c) => c.keyword);
      const offPool = findOffPoolTokens({
        keywordsFieldRecommended: validated.data.readyToPaste.keywordsField.recommended,
        inputKeywords: input.context.keywords,
        relevantKeywordPool: pool,
      });
      if (offPool.size > 0) {
        return fallbackWithTelemetry({
          input,
          requestId: options.requestId,
          usage: completion.usage,
          reason: `off_pool_tokens:${Array.from(offPool).slice(0, 3).join(",")}`,
        });
      }
    }

    // Renumber rank to guarantee 1..N ascending — the model usually does, but
    // we don't want a downstream consumer to depend on the model getting it
    // right.
    const recommendations = validated.data.recommendations.map((rec, i) => ({
      ...rec,
      rank: i + 1,
    }));

    const inputTokens = completion.usage?.prompt_tokens ?? 0;
    const outputTokens = completion.usage?.completion_tokens ?? 0;
    const cost = computeOpenAiCost({
      model: env.OPENAI_MODEL,
      inputTokens,
      outputTokens,
    });
    logOpenAiCost({
      kind: "openai_cost",
      requestId: options.requestId,
      model: env.OPENAI_MODEL,
      outcome: "synth_success",
      modelInputTokens: cost.inputTokens,
      modelOutputTokens: cost.outputTokens,
      costUsd: cost.costUsd,
    });
    recordOpenAiCogs("aiSynthesis", env.OPENAI_MODEL, cost);

    return {
      summary: validated.data.summary,
      recommendations,
      readyToPaste: mergeAiReadyToPaste(input, validated.data.readyToPaste),
    };
  } catch (err) {
    return fallbackWithTelemetry({
      input,
      requestId: options.requestId,
      usage: undefined,
      reason: `request_error:${(err as Error).message}`,
    });
  }
}

interface FallbackArgs {
  input: SynthesisInput;
  requestId: string;
  usage:
    | { prompt_tokens?: number; completion_tokens?: number }
    | null
    | undefined;
  reason: string;
}

// Stitch AI-generated `recommended` + `changeReason` strings onto the
// server-controlled bookkeeping (`current`, `charCount`, `charLimit`).
// Also defensively coerces echo cases (`recommended` exactly matches `current`)
// to `recommended: null` — see PR notes: the model has been told not to
// echo, but we don't want to ship the bug if it ignores instructions.
function mergeAiReadyToPaste(
  input: SynthesisInput,
  ai: ReadyToPasteAiPayload,
): ReadyToPaste {
  const appRecord = input.context.appRecord;
  const currentTitle = appRecord?.name ?? input.context.detectedApp.name;
  const currentSubtitle = appRecord?.subtitle ?? "";
  const currentKeywordsField = input.context.keywords
    .map((k) => k.toLowerCase().trim())
    .filter((k) => k.length > 0)
    .join(",");

  // Phase 0 — Net-value guard. Wraps each merged field so the AI path can
  // never ship a regressive rewrite either (e.g., model proposes overwriting
  // a multi-token subtitle with a single generic verb). The guard is the
  // canonical safety net for the paid /diagnose, regardless of which engine
  // produced the candidate.
  const netValueCtx = buildNetValueContext(input);
  return {
    title: applyNetValueGuard(
      mergeAiField({
        current: currentTitle,
        ai: ai.title,
        charLimit: APPLE_CAPS.title,
      }),
      netValueCtx,
      "title",
    ),
    subtitle: applyNetValueGuard(
      mergeAiField({
        current: currentSubtitle,
        ai: ai.subtitle,
        charLimit: APPLE_CAPS.subtitle,
      }),
      netValueCtx,
      "subtitle",
    ),
    keywordsField: applyNetValueGuard(
      mergeAiField({
        current: currentKeywordsField,
        ai: ai.keywordsField,
        charLimit: APPLE_CAPS.keywordsField,
      }),
      netValueCtx,
      "keywords field",
      "shared-with-visible",
    ),
    shortDescription: applyNetValueGuard(
      mergeAiField({
        current: "",
        ai: ai.shortDescription,
        charLimit: SHORT_DESCRIPTION_CAP,
      }),
      netValueCtx,
      "short description",
    ),
    // Phase F: AI path doesn't generate the new platform-correct fields
    // yet — the response schema (OpenAiResponseShape) doesn't include
    // them. Set to null so the schema validator accepts the merged
    // output; a future iteration extends the prompt + response shape.
    promotionalText: null,
    androidShortDescription: null,
    source: "ai",
  };
}

function mergeAiField(args: {
  current: string;
  ai: { recommended: string | null; changeReason: string | null };
  charLimit: number;
}): ReadyToPasteField {
  let recommended = args.ai.recommended;
  let changeReason = args.ai.changeReason;
  if (
    recommended !== null &&
    recommended.toLowerCase() === args.current.toLowerCase()
  ) {
    recommended = null;
    changeReason = null;
  }
  if (recommended === null) {
    changeReason = null;
  }
  const text = recommended ?? args.current;
  return {
    current: args.current,
    recommended,
    changeReason,
    charCount: text.length,
    charLimit: args.charLimit,
  };
}

function fallbackWithTelemetry(args: FallbackArgs): SynthesisOutput {
  const inputTokens = args.usage?.prompt_tokens ?? 0;
  const outputTokens = args.usage?.completion_tokens ?? 0;
  const cost = computeOpenAiCost({
    model: env.OPENAI_MODEL,
    inputTokens,
    outputTokens,
  });
  logOpenAiCost({
    kind: "openai_cost",
    requestId: args.requestId,
    model: env.OPENAI_MODEL,
    outcome: "synth_fallback",
    modelInputTokens: cost.inputTokens,
    modelOutputTokens: cost.outputTokens,
    costUsd: cost.costUsd,
    fallbackReason: args.reason,
  });
  recordOpenAiCogs("aiSynthesis", env.OPENAI_MODEL, cost);
  return synthesizeReportTemplate(args.input);
}
