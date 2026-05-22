import type { KeywordDiagnosis } from "./keyword-diagnosis.js";
import { classifyKeywordMatch } from "./keyword-match.js";

// Phase G — cross-field keyword distribution matrix.
//
// Given the user's listing across all metadata fields (title, subtitle,
// keywords field, description, promo text, Android short description),
// produce a per-keyword view of where it appears. Surfaced in the
// diagnose response so the UI can render a coverage matrix and the
// synthesis layer can author honest "next move" advice.
//
// We DON'T duplicate Apple's specific rules here — the existing Apple
// keyword-dedup recommendation card (Tier 1 B2) covers the
// title/subtitle ↔ keywords-field overlap. This module is the data
// source for that card and for future per-keyword recommendation
// surfaces.

export type KeywordPresence =
  | "exact" // exact phrase match (Apple's strongest signal)
  | "tokens" // all tokens present, not as a contiguous phrase
  | "duplicate" // present in keywords field AND a visible field (wasted budget)
  | "absent";

export interface KeywordDistributionLocations {
  title: KeywordPresence;
  subtitle: KeywordPresence;
  keywordsField: KeywordPresence;
  description: KeywordPresence;
  // Apple Promotional Text — write-only field today (not provider-observed),
  // so the matrix shows it as `absent` unless the user paste-back lands.
  promotionalText: KeywordPresence;
  // Android Short Description — same caveat (mapping fix is Tier 3).
  androidShortDescription: KeywordPresence;
}

export interface KeywordDistributionRow {
  keyword: string;
  locations: KeywordDistributionLocations;
  // Human-readable "next move" suggestions specific to this keyword's
  // current distribution. Empty when the placement is already optimal.
  moves: string[];
}

export interface ComputeKeywordDistributionInput {
  keywords: readonly string[];
  fields: {
    title: string;
    subtitle: string;
    keywordsField: readonly string[]; // user-submitted keywords (lowercase)
    description: string;
    promotionalText?: string;
    androidShortDescription?: string;
  };
  // Per-keyword `isAppSeeding` / `rankBucket` so we can write
  // lifecycle-respecting moves (won't say "promote to title" for a
  // seeding+not_found keyword).
  diagnosis?: readonly KeywordDiagnosis[];
}

export function computeKeywordDistribution(
  input: ComputeKeywordDistributionInput,
): KeywordDistributionRow[] {
  const keywordsFieldSet = new Set(
    input.fields.keywordsField.map((k) => k.toLowerCase().trim()).filter(Boolean),
  );
  const diagnosisByKw = new Map<string, KeywordDiagnosis>();
  for (const d of input.diagnosis ?? []) {
    diagnosisByKw.set(d.keyword.toLowerCase(), d);
  }

  return input.keywords
    .map((rawKeyword) => {
      const keyword = rawKeyword.trim();
      if (keyword.length === 0) return null;
      const lower = keyword.toLowerCase();

      const titlePresence = presenceIn(input.fields.title, keyword);
      const subtitlePresence = presenceIn(input.fields.subtitle, keyword);
      const descriptionPresence = presenceIn(input.fields.description, keyword);
      const promoPresence = presenceIn(input.fields.promotionalText ?? "", keyword);
      const androidShortPresence = presenceIn(
        input.fields.androidShortDescription ?? "",
        keyword,
      );

      // Keywords field is a flat token set, not free text. Compare against
      // the lowercased token bag. Mark as "duplicate" when also present in
      // title or subtitle (wasted budget per Apple's indexing rule).
      const inKwField = keywordsFieldSet.has(lower);
      const inVisible =
        titlePresence !== "absent" || subtitlePresence !== "absent";
      const keywordsFieldPresence: KeywordPresence = !inKwField
        ? "absent"
        : inVisible
          ? "duplicate"
          : "exact";

      const locations: KeywordDistributionLocations = {
        title: titlePresence,
        subtitle: subtitlePresence,
        keywordsField: keywordsFieldPresence,
        description: descriptionPresence,
        promotionalText: promoPresence,
        androidShortDescription: androidShortPresence,
      };

      const diagnosis = diagnosisByKw.get(lower);
      const moves = buildMoves({
        keyword,
        locations,
        diagnosis,
      });

      return { keyword, locations, moves };
    })
    .filter((row): row is KeywordDistributionRow => row !== null);
}

function presenceIn(text: string, keyword: string): KeywordPresence {
  if (!text || keyword.length === 0) return "absent";
  const match = classifyKeywordMatch({ keyword, title: text });
  if (match === "titleExactPhrase") return "exact";
  if (match === "titleAllWords") return "tokens";
  return "absent";
}

interface BuildMovesInput {
  keyword: string;
  locations: KeywordDistributionLocations;
  diagnosis?: KeywordDiagnosis;
}

function buildMoves(input: BuildMovesInput): string[] {
  const moves: string[] = [];
  const { locations, keyword, diagnosis } = input;

  // Drop from keywords field when it's already covered by title/subtitle.
  if (locations.keywordsField === "duplicate") {
    const where =
      locations.title !== "absent"
        ? "title"
        : locations.subtitle !== "absent"
          ? "subtitle"
          : "title/subtitle";
    moves.push(
      `Drop "${keyword}" from the keywords field — Apple already indexes it via the ${where}.`,
    );
  }

  // Promote to subtitle if completely uncovered AND not lifecycle-blocked.
  const lifecycleBlocked =
    diagnosis?.isAppSeeding === true && diagnosis?.rankBucket === "not_found";
  const completelyAbsent =
    locations.title === "absent" &&
    locations.subtitle === "absent" &&
    locations.promotionalText === "absent" &&
    locations.androidShortDescription === "absent";

  if (completelyAbsent && !lifecycleBlocked) {
    moves.push(
      `Add "${keyword}" to a visible field (subtitle, promo text, or Android short description) — currently appears only in the hidden keywords slot.`,
    );
  } else if (completelyAbsent && lifecycleBlocked) {
    moves.push(
      `Keep "${keyword}" in the keywords field — listing is still seeding; revisit promotion after ratings velocity grows.`,
    );
  }

  // Description density hint when keyword is uncovered there.
  if (locations.description === "absent") {
    moves.push(
      `Mention "${keyword}" in the description at least once — density signals on-topic copy to both stores.`,
    );
  }

  return moves;
}
