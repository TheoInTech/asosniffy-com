import type { SynthesisInput } from "../template.js";

// Prompt template for the full-report synthesis call.
//
// Kept under ~1500 tokens by passing scoring output as a compact JSON object
// (cheaper for the model than prose). The system message owns voice, rules,
// and Apple character caps; the user message owns the data.

const SYSTEM_PROMPT = `You are a senior App Store Optimization consultant writing the narrative sections of a Sniffy ASO diagnosis report for an indie founder.

Voice:
- Clean and professional. No emoji, no dog puns, no exclamation marks.
- Direct and actionable. Founders are time-constrained.
- Concrete: reference specific keywords, specific subscores, specific competitor names.
- Honest: only claim findings the structured scoring output supports. Never invent rank data, competitors, or numbers.

You must respect Apple App Store character caps in readyToPaste:
- title: 30 characters max
- subtitle: 30 characters max
- keywordsField: 100 characters max (comma-separated single tokens, no spaces, lowercase)
- shortDescription: 240 characters max

You must return JSON matching the schema. Do not include any commentary outside the JSON.

Output rules:
- summary: 2 to 4 sentences. Mention the app by name. Lead with the biggest leverage point.
- recommendations: 3 to 5 items, ranked 1..N by impact-then-effort. Use only impact and effort values from {"high","medium","low"}. Action is one sentence; rationale is one to two sentences referencing the scoring data.
- readyToPaste: must obey the caps above. Lead the subtitle with the highest-leverage keyword when possible.`;

export interface FullReportPromptInput extends SynthesisInput {
  // Token budget: we trim each free-text field below to a hard ceiling so a
  // pathological app description doesn't blow the prompt cost. The cap is
  // generous (1200 chars ~ 300 tokens for English) but bounded.
}

export function buildFullReportPrompt(input: FullReportPromptInput): {
  system: string;
  user: string;
} {
  // Compact context the model needs to ground its synthesis. We pass scoring
  // output as JSON because the model can read it cheaper than prose.
  const payload = {
    app: {
      name: input.context.detectedApp.name,
      developer: input.context.detectedApp.developer,
      currentTitle: input.context.appRecord?.name ?? input.context.detectedApp.name,
      currentSubtitle: input.context.appRecord?.subtitle ?? "",
      primaryCategory: input.context.appRecord?.primaryCategory ?? "",
      ratingsAverage: input.context.appRecord?.ratingsSummary.average ?? null,
      ratingsCount: input.context.appRecord?.ratingsSummary.count ?? null,
      descriptionExcerpt: truncate(input.context.appRecord?.description ?? "", 800),
    },
    inputKeywords: [...input.context.keywords],
    scoring: {
      overall: input.scoring.metadata.overall,
      title: input.scoring.metadata.title,
      subtitle: input.scoring.metadata.subtitle,
      keywordsField: input.scoring.metadata.keywordsField,
      description: input.scoring.metadata.description,
    },
    keywords: input.scoring.keywords.map((k) => ({
      keyword: k.keyword,
      rankBucket: k.rankBucket,
      intentScore: round2(k.intentScore),
      confidence: k.confidence,
      coverageInTitle: k.coverageInTitle,
      coverageInSubtitle: k.coverageInSubtitle,
      action: k.action,
    })),
    competitors: input.scoring.competitors.map((c) => ({
      name: c.name,
      overlapKeywords: c.overlapKeywords,
      uniqueToCompetitor: c.uniqueToCompetitor,
      overlapScore: round2(c.overlapScore),
    })),
  };

  const user = `Synthesize the report sections for this Sniffy ASO diagnosis.

DATA:
${JSON.stringify(payload, null, 2)}

Return JSON with keys: summary, recommendations, readyToPaste.`;

  return { system: SYSTEM_PROMPT, user };
}

// JSON schema published to OpenAI's response_format. Must satisfy structured-
// output strict mode: every field required, no additionalProperties.
export const FULL_REPORT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", minLength: 1 },
    recommendations: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          rank: { type: "integer", minimum: 1 },
          action: { type: "string", minLength: 1 },
          impact: { type: "string", enum: ["high", "medium", "low"] },
          effort: { type: "string", enum: ["high", "medium", "low"] },
          rationale: { type: "string", minLength: 1 },
        },
        required: ["rank", "action", "impact", "effort", "rationale"],
        additionalProperties: false,
      },
    },
    readyToPaste: {
      type: "object",
      properties: {
        title: { type: "string" },
        subtitle: { type: "string" },
        keywordsField: { type: "string" },
        shortDescription: { type: "string" },
      },
      required: ["title", "subtitle", "keywordsField", "shortDescription"],
      additionalProperties: false,
    },
  },
  required: ["summary", "recommendations", "readyToPaste"],
  additionalProperties: false,
} as const;

export const FULL_REPORT_SCHEMA_NAME = "sniffy_full_report_v1" as const;

function truncate(s: string, cap: number): string {
  return s.length <= cap ? s : `${s.slice(0, cap)}…`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
