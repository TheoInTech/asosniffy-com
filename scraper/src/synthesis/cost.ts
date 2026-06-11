// OpenAI cost telemetry for the synthesis layer.
//
// Pricing is hardcoded for the models the synthesizer actually uses. We only
// support a small set; unknown models log with `costUsd: null` so the dashboard
// can still aggregate token usage.
//
// Reference: OpenAI pricing page (2026-05). Update if pricing changes.

interface PricePerMillion {
  inputPerMillion: number;
  outputPerMillion: number;
}

const MODEL_PRICING: Record<string, PricePerMillion> = {
  // Current marketed lineup — developers.openai.com/api/docs/models (2026-05).
  "gpt-5.5": { inputPerMillion: 5.0, outputPerMillion: 30.0 },
  "gpt-5.4": { inputPerMillion: 2.5, outputPerMillion: 15.0 },
  "gpt-5.4-mini": { inputPerMillion: 0.75, outputPerMillion: 4.5 },
  // Legacy — still callable via API; kept here so OPENAI_MODEL= overrides
  // produce accurate cost telemetry instead of costUsd: null.
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  "gpt-4.1-mini": { inputPerMillion: 0.4, outputPerMillion: 1.6 },
};

export interface CostInput {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface CostBreakdown {
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

export function computeOpenAiCost(input: CostInput): CostBreakdown {
  const price = MODEL_PRICING[input.model];
  if (!price) {
    return {
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      costUsd: null,
    };
  }
  const costUsd =
    (input.inputTokens / 1_000_000) * price.inputPerMillion +
    (input.outputTokens / 1_000_000) * price.outputPerMillion;
  return {
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    costUsd: round6(costUsd),
  };
}

// Conservative upper bound on input tokens per LOW-detail, downscaled image
// for the current cheap vision models (gpt-5.4-mini-class). The env caps
// (VISION_IMAGE_DETAIL=low, VISION_MAX_IMAGE_PX) pin images into this regime
// so per-image cost is bounded and flat. VERIFY against the chosen
// VISION_MODEL's published image-token rule before flipping
// VISION_CREATIVE_ENABLED — this is the number the creativeVision projected
// COGS (payment/cogs.ts) is sized against.
export const VISION_LOW_DETAIL_TOKENS_PER_IMAGE = 500;

// Cost of one capped creative-vision pass. The image cap (≤8 via env) × the
// per-image token bound is what makes the projected COGS honest — the direct
// structural fix for the $0.18 measurement (uncapped ~25 full-detail images
// on a full-tier model).
export function computeVisionCost(input: {
  model: string;
  imageCount: number;
  promptTokens: number;
  outputTokens: number;
}): CostBreakdown {
  const imageTokens = input.imageCount * VISION_LOW_DETAIL_TOKENS_PER_IMAGE;
  return computeOpenAiCost({
    model: input.model,
    inputTokens: input.promptTokens + imageTokens,
    outputTokens: input.outputTokens,
  });
}

export interface CostLogPayload {
  kind: "openai_cost";
  requestId: string;
  model: string;
  outcome: "synth_success" | "synth_fallback";
  modelInputTokens: number;
  modelOutputTokens: number;
  costUsd: number | null;
  fallbackReason?: string;
}

export function logOpenAiCost(payload: CostLogPayload): void {
  // Structured single-line JSON for Railway log drain. Tests intercept this
  // by spying on console.log.
  console.log(JSON.stringify(payload));
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
