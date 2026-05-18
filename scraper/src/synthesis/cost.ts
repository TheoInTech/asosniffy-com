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
