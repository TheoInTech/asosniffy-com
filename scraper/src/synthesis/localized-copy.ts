import { z } from "zod";
import type OpenAI from "openai";
import { env } from "../env.js";
import { getOpenAiClient } from "./openai-client.js";
import { computeOpenAiCost, logOpenAiCost } from "./cost.js";
import { APPLE_CAPS } from "../scoring/index.js";
import type {
  LocalizationAnalysis,
  LocalizationRecommendedCopy,
  LocalizationStorefrontDetail,
} from "../scoring/localization.js";
import type { RecommendationItem } from "../schemas/index.js";

// OpenAI-driven translation for mismatched storefronts.
//
// Trigger: `localizationAnalysis.unlocalizedCount > 0` AND OpenAI is
// available (key set + cost circuit allows). When unavailable we still
// produce a value-visible output: each mismatched storefront gets
// `recommendedCopy = { source: "deferred", ... }` and the synthesis layer
// adds a single "Translate your listing for N storefronts" recommendation
// card to the report.
//
// One OpenAI call covers every mismatched storefront in the batch — the
// model returns a map keyed by ISO country code so we don't pay per locale.

const SHORT_DESCRIPTION_CAP = 240;

const SYSTEM_PROMPT = `You are a senior App Store Optimization translator producing paste-ready localized metadata for an indie founder's app listing.

Hard constraints:
- Apple character caps: title 30 chars, subtitle 30 chars, shortDescription 240 chars. Translations that overflow are useless — stay under the cap.
- The target language for each locale is fixed (ISO 639-3). Never carry English through into a non-English locale.
- Translate what's in the source. Do not invent features, claims, or numbers that aren't in the user's current title/subtitle/keywords.
- Brand names stay untranslated. Do not transliterate the app name unless the source already does (Tally stays Tally; カレンダー stays カレンダー).
- Punctuation: use locale-conventional punctuation (e.g., Japanese uses 「」 for emphasis sparingly; German doesn't use the em-dash separator).

Output:
- Return a JSON object keyed by ISO 3166-1 alpha-2 country code (uppercase). For each entry produce { title, subtitle, shortDescription } where each string is paste-ready translated copy in the target language.
- If a translation would lose meaning or overflow the cap, set that field to null rather than ship bad copy.`;

// Per-locale response. All three fields nullable so the model can opt out
// of a slot when overflow / ambiguity makes a clean translation impossible.
const LocaleCopy = z.object({
  title: z.string().nullable(),
  subtitle: z.string().nullable(),
  shortDescription: z.string().nullable(),
});

export interface SynthesizeLocalizedCopyInput {
  appName: string;
  currentTitle: string;
  currentSubtitle: string;
  primaryKeywords: readonly string[];
  // Target storefronts to translate for. Only the locales with `localized
  // === false` should be passed in — matched storefronts have no work.
  targets: readonly {
    country: string;
    expectedLanguages: readonly string[];
  }[];
  requestId: string;
  client?: OpenAI | null;
}

export type LocalizedCopyByCountry = Record<
  string,
  { title: string | null; subtitle: string | null; shortDescription: string | null }
>;

export async function synthesizeLocalizedCopy(
  input: SynthesizeLocalizedCopyInput,
): Promise<LocalizedCopyByCountry | null> {
  if (input.targets.length === 0) return {};

  const client = input.client ?? getOpenAiClient();
  if (!client) {
    logOpenAiCost({
      kind: "openai_cost",
      requestId: input.requestId,
      model: env.OPENAI_MODEL,
      outcome: "synth_fallback",
      modelInputTokens: 0,
      modelOutputTokens: 0,
      costUsd: 0,
      fallbackReason: "localization_missing_api_key",
    });
    return null;
  }

  const ResponseShape = z.object({
    locales: z.array(
      z.object({
        country: z.string(),
        copy: LocaleCopy,
      }),
    ),
  });
  const responseSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      locales: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            country: { type: "string" },
            copy: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: ["string", "null"] },
                subtitle: { type: ["string", "null"] },
                shortDescription: { type: ["string", "null"] },
              },
              required: ["title", "subtitle", "shortDescription"],
            },
          },
          required: ["country", "copy"],
        },
      },
    },
    required: ["locales"],
  } as const;

  const userPayload = {
    apple: {
      titleCap: APPLE_CAPS.title,
      subtitleCap: APPLE_CAPS.subtitle,
      shortDescriptionCap: SHORT_DESCRIPTION_CAP,
    },
    source: {
      appName: input.appName,
      currentTitle: input.currentTitle,
      currentSubtitle: input.currentSubtitle,
      primaryKeywords: [...input.primaryKeywords],
    },
    targets: input.targets.map((t) => ({
      country: t.country,
      expectedLanguages: [...t.expectedLanguages],
    })),
  };

  try {
    const completion = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "sniffy_localized_copy",
          strict: true,
          schema: responseSchema,
        },
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      logLocalizationFallback(input.requestId, completion.usage, "empty_response");
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      logLocalizationFallback(
        input.requestId,
        completion.usage,
        `json_parse_failed:${(err as Error).message}`,
      );
      return null;
    }

    const validated = ResponseShape.safeParse(parsed);
    if (!validated.success) {
      logLocalizationFallback(
        input.requestId,
        completion.usage,
        `schema_validation_failed:${validated.error.issues[0]?.path.join(".") ?? "unknown"}`,
      );
      return null;
    }

    const cost = computeOpenAiCost({
      model: env.OPENAI_MODEL,
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    });
    logOpenAiCost({
      kind: "openai_cost",
      requestId: input.requestId,
      model: env.OPENAI_MODEL,
      outcome: "synth_success",
      modelInputTokens: cost.inputTokens,
      modelOutputTokens: cost.outputTokens,
      costUsd: cost.costUsd,
      fallbackReason: "localization_success",
    });

    const out: LocalizedCopyByCountry = {};
    for (const entry of validated.data.locales) {
      const country = entry.country.toUpperCase();
      out[country] = {
        title: capOrNull(entry.copy.title, APPLE_CAPS.title),
        subtitle: capOrNull(entry.copy.subtitle, APPLE_CAPS.subtitle),
        shortDescription: capOrNull(
          entry.copy.shortDescription,
          SHORT_DESCRIPTION_CAP,
        ),
      };
    }
    return out;
  } catch (err) {
    logLocalizationFallback(
      input.requestId,
      undefined,
      `request_error:${(err as Error).message}`,
    );
    return null;
  }
}

// Stitch translation output into a fresh LocalizationAnalysis, mutating
// `recommendedCopy` on each mismatched storefront. Unmatched storefronts
// (localized === true) keep `recommendedCopy: null` since there's no work
// to do there. Mismatched storefronts get `source: "deferred"` when
// translation was unavailable so the UI can still surface value via the
// localization recommendation card.
export function stitchLocalizedCopy(
  analysis: LocalizationAnalysis,
  translations: LocalizedCopyByCountry | null,
): LocalizationAnalysis {
  if (analysis.unlocalizedCount === 0) return analysis;

  const updated: LocalizationStorefrontDetail[] = analysis.storefronts.map(
    (storefront) => {
      if (storefront.localized !== false) return storefront;
      const country = storefront.country.toUpperCase();
      const t = translations?.[country];
      const recommendedCopy: LocalizationRecommendedCopy = t
        ? {
            title: t.title,
            subtitle: t.subtitle,
            shortDescription: t.shortDescription,
            source: "openai",
          }
        : {
            title: null,
            subtitle: null,
            shortDescription: null,
            source: "deferred",
          };
      return { ...storefront, recommendedCopy };
    },
  );

  return {
    ...analysis,
    storefronts: updated,
  };
}

// Build the single "Translate your listing for N storefronts" recommendation
// card. Fires only when we actually deferred (no translation produced) for
// at least one storefront — the typical demo path when OPENAI_API_KEY is
// unset. When every mismatched storefront got translated copy via OpenAI,
// the value lands directly in `recommendedCopy` and no card is needed.
export function buildLocalizationRecommendation(
  analysis: LocalizationAnalysis | null,
  nextRank: number,
): RecommendationItem | null {
  if (!analysis) return null;
  const deferred = analysis.storefronts.filter(
    (s) => s.localized === false && s.recommendedCopy?.source === "deferred",
  );
  if (deferred.length === 0) return null;
  const list = deferred
    .map((s) => s.country)
    .slice(0, 6)
    .join(", ");
  return {
    rank: nextRank,
    action: `Translate your listing for ${deferred.length} storefront${deferred.length === 1 ? "" : "s"} (${list}).`,
    impact: "medium",
    effort: "medium",
    rationale: `Listings in non-matching languages typically lose 15–30% of organic installs in those regions. Translating title, subtitle, and short description in the affected locales is the highest-leverage single move.`,
  };
}

function capOrNull(value: string | null, cap: number): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length <= cap ? trimmed : trimmed.slice(0, cap);
}

function logLocalizationFallback(
  requestId: string,
  usage:
    | { prompt_tokens?: number; completion_tokens?: number }
    | null
    | undefined,
  reason: string,
): void {
  const cost = computeOpenAiCost({
    model: env.OPENAI_MODEL,
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
  });
  logOpenAiCost({
    kind: "openai_cost",
    requestId,
    model: env.OPENAI_MODEL,
    outcome: "synth_fallback",
    modelInputTokens: cost.inputTokens,
    modelOutputTokens: cost.outputTokens,
    costUsd: cost.costUsd,
    fallbackReason: `localization_${reason}`,
  });
}
