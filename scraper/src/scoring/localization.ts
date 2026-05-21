import { franc } from "franc-min";
import type { AppRecord, AppleProviderError } from "../providers/apple/types.js";

// Multi-storefront localization gap analysis.
//
// Phase 5 surfaces the single biggest organic-install lever for indie
// founders: when an app ships the same English description across JP, DE,
// BR, KR storefronts, it leaves a 15–30% install lift on the table per
// industry analyses (AppTweak, App Radar). We can detect this with zero
// inference — two iTunes /lookup calls and a language detector.
//
// We do NOT recommend translation (that's the AI synthesis layer's job).
// We only report:
//   • titleVariants — distinct titles across queried storefronts
//   • per-storefront: description language, primary expected language,
//     `localized` boolean, `gapScore`
//   • overall `gapScore` averaged across storefronts
//
// gapScore convention:
//   100 = description matches storefront's primary language (no gap)
//   0   = description is in a language that does NOT match
//
// We deliberately don't try to score "title localization" — many
// successful apps keep the title untranslated (brand identity) and only
// translate description + subtitle. The recommendation engine can decide
// when to suggest title localization based on category.

// ISO 3166-1 alpha-2 → expected ISO 639-3 language(s) for the storefront's
// primary user audience. Multi-language storefronts (CH: de/fr/it) accept
// any of the listed codes as "localized."
const STOREFRONT_PRIMARY_LANG: Record<string, readonly string[]> = {
  US: ["eng"],
  GB: ["eng"],
  CA: ["eng", "fra"],
  AU: ["eng"],
  NZ: ["eng"],
  IE: ["eng"],
  IN: ["eng", "hin"],
  SG: ["eng"],
  PH: ["eng", "tgl"],
  ZA: ["eng"],

  JP: ["jpn"],
  KR: ["kor"],
  CN: ["zho", "cmn"],
  TW: ["zho", "cmn"],
  HK: ["zho", "yue"],

  DE: ["deu"],
  AT: ["deu"],
  CH: ["deu", "fra", "ita"],

  FR: ["fra"],
  BE: ["fra", "nld"],
  LU: ["fra", "deu"],

  ES: ["spa"],
  MX: ["spa"],
  AR: ["spa"],
  CL: ["spa"],
  CO: ["spa"],

  BR: ["por"],
  PT: ["por"],

  IT: ["ita"],
  NL: ["nld"],
  PL: ["pol"],
  RU: ["rus"],
  TR: ["tur"],
  SE: ["swe"],
  NO: ["nor", "nob"],
  DK: ["dan"],
  FI: ["fin"],
  GR: ["ell"],
  CZ: ["ces"],
  HU: ["hun"],
  RO: ["ron"],

  ID: ["ind"],
  TH: ["tha"],
  VN: ["vie"],
  MY: ["msa"],

  IL: ["heb"],
  SA: ["arb", "ara"],
  AE: ["arb", "ara"],
  EG: ["arb", "ara"],
};

export interface LocalizationRecommendedCopy {
  // Translated title (≤ 30 chars). Null when generation was skipped or
  // failed for this locale.
  title: string | null;
  // Translated subtitle (≤ 30 chars). Null when skipped/failed.
  subtitle: string | null;
  // Translated short description / promotional copy (≤ 240 chars). Null
  // when skipped/failed.
  shortDescription: string | null;
  // How the copy was produced. "openai" = LLM-generated translation;
  // "deferred" = OpenAI was unavailable (no key, cost-circuit, error),
  // so the UI should surface a "translate this listing" prompt instead.
  source: "openai" | "deferred";
}

export interface LocalizationStorefrontDetail {
  country: string;
  // Title as it appears in this storefront (iTunes returns localized trackName).
  title: string;
  // Primary genre name as iTunes reports it for this storefront. Some apps
  // localize this; many keep the canonical English value.
  primaryCategory: string;
  // Length of the description fetched for this storefront. Used by the
  // scorer to skip language detection on too-short text (false positives).
  descriptionLength: number;
  // Detected language of the description (ISO 639-3) or null when text was
  // too short or detection was inconclusive. Skipped entirely when the
  // storefront errored.
  descriptionLanguage: string | null;
  // ISO 639-3 codes the storefront expects.
  expectedLanguages: string[];
  // True when the detected language matches one of the expected codes.
  // False when detection succeeded but produced a mismatch. Null when
  // we couldn't run detection (short text, provider error, no description).
  localized: boolean | null;
  // 0..100. 100 = localized, 0 = mismatch, 50 = unknown/inconclusive.
  gapScore: number;
  // Provider-error info when the per-storefront lookup failed. Distinct
  // from a "successful lookup with a non-localized description" so the
  // UI can show "couldn't check JP" vs "JP listing is English".
  error: string | null;
  // Paste-ready translated copy for storefronts with a detected language
  // mismatch. Stitched in by the synthesis layer after a successful
  // OpenAI translation call. Null for matched storefronts (no work to
  // do) and for mismatched storefronts when translation was unavailable
  // — in the latter case the synthesis layer surfaces a "translate this
  // listing" recommendation card so the value-add is still visible.
  recommendedCopy: LocalizationRecommendedCopy | null;
}

export interface LocalizationAnalysis {
  storefronts: LocalizationStorefrontDetail[];
  // Distinct titles across queried storefronts. ≥2 distinct titles
  // signals that the developer is at least making per-storefront edits.
  titleVariants: string[];
  // Mean gapScore across storefronts that had a successful detection.
  // null when no storefront returned usable data.
  overallGapScore: number | null;
  // Number of storefronts with detection=mismatch. Useful for the
  // synthesizer's "this app needs N storefront translations" copy.
  unlocalizedCount: number;
  // The minimum description length we attempted detection on. Below this
  // we skip detection (high false-positive rate on franc).
  detectionMinChars: number;
}

const DETECTION_MIN_CHARS = 50;

export interface ScoreLocalizationInput {
  storefronts: ReadonlyMap<string, AppRecord | AppleProviderError>;
}

export function scoreLocalization(
  input: ScoreLocalizationInput,
): LocalizationAnalysis {
  const details: LocalizationStorefrontDetail[] = [];
  const titlesSeen = new Set<string>();

  for (const [country, result] of input.storefronts.entries()) {
    const upper = country.toUpperCase();
    const expectedLanguages = [
      ...(STOREFRONT_PRIMARY_LANG[upper] ?? ["eng"]),
    ];

    if ("error" in result) {
      details.push({
        country: upper,
        title: "",
        primaryCategory: "",
        descriptionLength: 0,
        descriptionLanguage: null,
        expectedLanguages,
        localized: null,
        gapScore: 50, // unknown — neutral
        error: result.error,
        recommendedCopy: null,
      });
      continue;
    }

    titlesSeen.add(result.name);
    const description = result.description ?? "";
    const detected = detectLanguageOrNull(description);
    const localized =
      detected === null ? null : expectedLanguages.includes(detected);
    const gapScore =
      localized === null ? 50 : localized ? 100 : 0;

    details.push({
      country: upper,
      title: result.name,
      primaryCategory: result.primaryCategory,
      descriptionLength: description.length,
      descriptionLanguage: detected,
      expectedLanguages,
      localized,
      gapScore,
      error: null,
      recommendedCopy: null,
    });
  }

  const scored = details.filter((d) => d.localized !== null);
  const overallGapScore =
    scored.length === 0
      ? null
      : Math.round(
          scored.reduce((acc, d) => acc + d.gapScore, 0) / scored.length,
        );
  const unlocalizedCount = details.filter((d) => d.localized === false).length;

  return {
    storefronts: details,
    titleVariants: Array.from(titlesSeen),
    overallGapScore,
    unlocalizedCount,
    detectionMinChars: DETECTION_MIN_CHARS,
  };
}

function detectLanguageOrNull(text: string): string | null {
  if (text.length < DETECTION_MIN_CHARS) return null;
  const lang = franc(text, { minLength: DETECTION_MIN_CHARS });
  // franc returns "und" (undetermined) when it can't make a confident call.
  if (lang === "und") return null;
  return lang;
}
