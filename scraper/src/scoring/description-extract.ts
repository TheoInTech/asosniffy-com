import type { AppRecord } from "../providers/apple/types.js";

// Phase C — Description & "What's New" deep extraction.
//
// The App Store description and release notes are first-party copy the
// founder wrote AND that Apple reviewed — both high-authority signal we
// were previously using only as a substring corpus (Apple-dedup pass).
// This module mines them as a structured opportunity source alongside
// product-context (Phase B) and competitor-unique (Phase A) terms.
//
// Three buckets, each weighted into the synthesis opportunity pool:
//
//   featureTokens         (bullets + lines under "Features:"/"Highlights:")
//                         → weight 0.65 in synthesis (just below product-
//                         context featureTokens at 0.70; both are first-
//                         party but the marketing site is broader)
//
//   recentlyAddedTokens   (releaseNotes "Added X" / "Now supports Y" /
//                         "Introducing Z" patterns)
//                         → weight 0.55 in synthesis (recent signal — the
//                         feature is shipping NOW, but it's narrower than
//                         the full feature catalog)
//
//   topicalKeywords       (body-text frequency rank across description)
//                         → weight 0.50 (fallback signal — captures words
//                         the description leans on without a clearly
//                         structured marker)
//
// Deliberately deterministic and dependency-free. No NLP library, no
// regex tricks beyond what's portable across the bullet character zoo
// App Store descriptions actually use in the wild.

export interface DescriptionTokens {
  featureTokens: string[];
  recentlyAddedTokens: string[];
  topicalKeywords: string[];
}

const EMPTY: DescriptionTokens = {
  featureTokens: [],
  recentlyAddedTokens: [],
  topicalKeywords: [],
};

// Minimum description length below which we don't bother extracting —
// descriptions under 300 chars are usually placeholders and the bullet/
// frequency heuristics would produce noise.
const MIN_DESCRIPTION_CHARS = 300;

// Per-bucket result caps. Synthesis-side dedup against userKeywords +
// product-context tokens further trims; these caps just bound the
// extractor's own output volume.
const FEATURE_TOKEN_CAP = 25;
const RECENTLY_ADDED_TOKEN_CAP = 15;
const TOPICAL_KEYWORD_CAP = 25;

// Wide bullet-character matcher. App Store listings use:
//   • U+2022 BULLET (most common)
//   ‣ U+2023 TRIANGULAR BULLET
//   ● U+25CF BLACK CIRCLE
//   ▪ U+25AA BLACK SMALL SQUARE
//   ◦ U+25E6 WHITE BULLET
//   * U+002A ASTERISK
//   - U+002D HYPHEN-MINUS  (only when followed by space — avoids breaking hyphenated words)
//   – U+2013 EN DASH
//   — U+2014 EM DASH
//   ✓ U+2713 CHECK MARK
//   ⭐ U+2B50 STAR  (emoji-as-bullet, increasingly common)
//   🎯 U+1F3AF DIRECT HIT (same)
// Pattern: line starts (after optional whitespace) with one of those
// chars, then whitespace, then content. We capture the content.
const BULLET_LINE = /^[\s>]*(?:[•‣●▪◦*\-–—✓⭐🎯✨⚡️🔥💪]|(?:\d+[.)])|(?:[a-z][.)]))\s+(.+)$/gmu;

// Section headers that introduce a feature block. Match case-insensitively;
// allow optional trailing punctuation (`:`, `-`, `—`).
const SECTION_HEADER = /^\s*(features?|key features?|highlights?|what'?s? (?:included|new)|what you get|main features?)[\s:.\-—]*$/i;

// "Added X", "Now supports Y", "Introducing Z", "New: X" — release-notes
// patterns that signal a recently-shipped feature. We capture the noun
// phrase up to sentence-ending punctuation or end-of-line.
const RECENTLY_ADDED_PATTERNS = [
  /\b(?:added|new(?: in this version)?|now (?:supports?|includes?|with))\s*[:-]?\s*([^.!?\n]{3,80})/gi,
  /\b(?:introducing|launching|fresh from the kitchen)\s*[:-]?\s*([^.!?\n]{3,80})/gi,
  /\bnew(?:\s+(?:in|to|for))\s+\d+[.\d]*[:.\s-]+([^.!?\n]{3,80})/gi,
];

// Stoplist mirrors what other extractors use; centralizing it would create
// an import cycle, so we keep a parallel copy. Drift is OK — different
// stoplists for different signal sources is fine (description has its own
// boilerplate). Keep it tight for now.
const TOPIC_STOPLIST: ReadonlySet<string> = new Set([
  "the", "and", "or", "of", "for", "in", "on", "to", "with", "by", "at",
  "is", "as", "an", "from", "this", "that", "these", "those",
  "we", "our", "your", "you", "us", "they", "their", "them",
  "it", "its", "be", "are", "was", "were", "been", "being",
  "have", "has", "had", "will", "can", "may", "should", "would", "could",
  "do", "does", "did", "done", "doing",
  "what", "which", "who", "when", "where", "why", "how",
  "app", "apps", "free", "trial", "pro", "premium", "lite", "best", "top",
  "new", "now", "today", "started", "getting", "great", "amazing", "awesome",
  "easy", "simple", "fast", "smart", "perfect", "powerful",
  "get", "use", "using", "make", "made", "help", "build", "built",
  "click", "learn", "more", "less", "much", "many", "any", "all", "some",
  // App Store specific boilerplate
  "download", "available", "version", "release", "update", "support",
  "users", "user", "version", "iphone", "ipad", "ios", "apple", "play",
  "store", "tap", "swipe", "press", "open", "close",
]);

export function extractDescriptionTokens(
  appRecord: AppRecord | null,
): DescriptionTokens {
  if (!appRecord) return EMPTY;
  const description = appRecord.description ?? "";
  const releaseNotes = appRecord.releaseNotes ?? "";

  // Description-length gate applies ONLY to description-derived buckets.
  // Release notes are extracted independently — they can be useful even
  // on apps with a thin or placeholder App Store description (a v2 launch
  // with a one-line description but a substantive "What's new" block).
  const descriptionUsable = description.length >= MIN_DESCRIPTION_CHARS;

  return {
    featureTokens: descriptionUsable ? extractFeatureTokens(description) : [],
    recentlyAddedTokens: extractRecentlyAddedTokens(releaseNotes),
    topicalKeywords: descriptionUsable
      ? extractTopicalKeywords(description)
      : [],
  };
}

// Two-source feature extraction:
//   1. Bullet lines anywhere in the description (BULLET_LINE).
//   2. Lines after a SECTION_HEADER, until a blank line or another header.
// Tokens are merged + frequency-ranked.
function extractFeatureTokens(description: string): string[] {
  const tokens = new Map<string, number>();

  // Pass 1: bullets.
  let match: RegExpExecArray | null;
  // Reset regex state (global flag).
  BULLET_LINE.lastIndex = 0;
  while ((match = BULLET_LINE.exec(description)) !== null) {
    const line = match[1]!;
    for (const w of tokenize(line)) {
      tokens.set(w, (tokens.get(w) ?? 0) + 1);
    }
  }

  // Pass 2: section-header-following lines.
  const lines = description.split("\n");
  let inSection = false;
  let linesAfterHeader = 0;
  const MAX_LINES_AFTER_HEADER = 15;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (SECTION_HEADER.test(line)) {
      inSection = true;
      linesAfterHeader = 0;
      continue;
    }
    if (!inSection) continue;
    if (line.length === 0) {
      // blank line ends the section
      inSection = false;
      continue;
    }
    linesAfterHeader += 1;
    if (linesAfterHeader > MAX_LINES_AFTER_HEADER) {
      inSection = false;
      continue;
    }
    // Heading-2× weight, mirrors product-context's editorial-intent boost
    // for headings: a section-flagged feature line is more curated than a
    // raw bullet appearing anywhere in the description.
    for (const w of tokenize(line)) {
      tokens.set(w, (tokens.get(w) ?? 0) + 2);
    }
  }

  return Array.from(tokens.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, FEATURE_TOKEN_CAP)
    .map(([t]) => t);
}

function extractRecentlyAddedTokens(releaseNotes: string): string[] {
  if (releaseNotes.length === 0) return [];
  const tokens = new Map<string, number>();
  for (const re of RECENTLY_ADDED_PATTERNS) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(releaseNotes)) !== null) {
      const phrase = match[1]!;
      for (const w of tokenize(phrase)) {
        tokens.set(w, (tokens.get(w) ?? 0) + 1);
      }
    }
  }
  return Array.from(tokens.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, RECENTLY_ADDED_TOKEN_CAP)
    .map(([t]) => t);
}

function extractTopicalKeywords(description: string): string[] {
  const freq = new Map<string, number>();
  for (const w of tokenize(description)) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return Array.from(freq.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOPICAL_KEYWORD_CAP)
    .map(([t]) => t);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter((t) => t.length >= 4 && !TOPIC_STOPLIST.has(t));
}
