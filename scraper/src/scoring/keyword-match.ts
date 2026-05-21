// Keyword-match granularity classifier.
//
// Derived from semihcihan/App-Store-Optimization-CLI (MIT), pinned commit
// be885e2d74ec7af59b4efaf6042678ec7dc87f5c (see LICENSE-THIRD-PARTY.md).
// Original lives at `cli/shared/aso-keyword-match.ts` and is consumed by
// their difficulty formula; the same enum is reused here so our metadata
// scorer and the ported keyword-difficulty module agree on match weight.
//
// The six match kinds capture how an Apple listing surfaces a user-supplied
// keyword. Exact phrase placements outrank "same words in any order"
// because Apple's tokenizer weighs left-of-string contiguous matches.

export type KeywordMatchKind =
  | "titleExactPhrase"
  | "titleAllWords"
  | "subtitleExactPhrase"
  | "subtitleAllWords"
  | "combinedPhrase"
  | "none";

export interface ClassifyKeywordMatchInput {
  keyword: string;
  title: string;
  subtitle?: string;
}

// Match-score weight per kind. Exact-phrase > all-words > combined > none.
// Subtitle scores below title because Apple weighs the title field harder.
export function keywordMatchScore(kind: KeywordMatchKind): number {
  switch (kind) {
    case "titleExactPhrase":
      return 1;
    case "titleAllWords":
      return 0.8;
    case "subtitleExactPhrase":
      return 0.5;
    case "combinedPhrase":
      return 0.4;
    case "subtitleAllWords":
      return 0.4;
    case "none":
      return 0;
  }
}

export function classifyKeywordMatch(
  input: ClassifyKeywordMatchInput,
): KeywordMatchKind {
  const keyword = normalize(input.keyword);
  const title = normalize(input.title);
  const subtitle = normalize(input.subtitle ?? "");

  if (keyword.length === 0) return "none";

  const tokens = keyword.split(/\s+/).filter((t) => t.length > 0);

  // Single-token keywords collapse the "all-words" distinction. If the lone
  // token sits in the title, that's a title-exact-phrase match.
  if (tokens.length <= 1) {
    if (title.length > 0 && containsToken(title, keyword)) {
      return "titleExactPhrase";
    }
    if (subtitle.length > 0 && containsToken(subtitle, keyword)) {
      return "subtitleExactPhrase";
    }
    return "none";
  }

  // Multi-token keyword. Check exact phrase first, then "all words".
  if (title.length > 0 && containsPhrase(title, keyword)) {
    return "titleExactPhrase";
  }
  if (subtitle.length > 0 && containsPhrase(subtitle, keyword)) {
    return "subtitleExactPhrase";
  }

  const tokensInTitle = tokens.filter((t) => containsToken(title, t));
  const tokensInSubtitle = tokens.filter((t) => containsToken(subtitle, t));

  if (tokensInTitle.length === tokens.length) return "titleAllWords";
  if (tokensInSubtitle.length === tokens.length) return "subtitleAllWords";

  // Combined: all tokens land somewhere in {title ∪ subtitle}, just not in
  // either field alone. Useful when the title carries the brand-y prefix
  // and the subtitle finishes the phrase.
  const combinedHits = new Set([...tokensInTitle, ...tokensInSubtitle]);
  if (combinedHits.size === tokens.length) return "combinedPhrase";

  return "none";
}

function normalize(value: string): string {
  // Lowercase, then collapse every non-alphanumeric char (em-dash, colon,
  // hyphen, etc.) to a space so "Habit-Tracker: Routines" and
  // "AI Tracker — Build Habits" both reduce to canonical token streams.
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const REGEX_ESCAPE = /[.*+?^${}()|[\]\\]/g;

// Word-boundary match with a trailing 's' tolerated for English plurals.
// Matches "habit" inside "habits" and "ai" inside "ai-powered" (the hyphen
// becomes a space via normalize); does NOT match "ai" inside "captain"
// because there's no preceding word boundary.
function containsToken(haystack: string, needle: string): boolean {
  if (needle.length === 0) return false;
  const escaped = needle.replace(REGEX_ESCAPE, "\\$&");
  return new RegExp(`\\b${escaped}s?\\b`).test(haystack);
}

// For phrases ("habit tracker") we still allow a trailing plural ("habit
// trackers") so the exact-phrase classification survives Apple titles that
// pluralize the head noun.
function containsPhrase(haystack: string, phrase: string): boolean {
  return containsToken(haystack, phrase);
}
