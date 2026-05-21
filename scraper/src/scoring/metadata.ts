import type { AppRecord } from "../providers/apple/types.js";
import type { DetectedApp, Provenance } from "../schemas/index.js";
import { classifyKeywordMatch } from "./keyword-match.js";

// Deterministic ASO metadata scorer.
//
// Weights from docs/04-scoring-and-synthesis.md §04.p1 + ASO orthodoxy:
//   title 35 / subtitle 30 / keywordsField 25 / description 10.
//
// Apple field caps (referenced by length checks below):
//   • title       30 chars
//   • subtitle    30 chars
//   • keywords    100 chars (developer-only field, not observable from the
//                 iTunes Search API — we score against the user's submitted
//                 keywords[] as a proxy)
//   • description 4000 chars (rarely indexed for ranking but still scanned by
//                 humans on the listing page)
//
// Each subscore returns {score, reasons[]} so the synthesis layer (04.p2 /
// 04.p3) can verbalize the deterministic findings without re-deriving them.

export const METADATA_WEIGHTS = {
  title: 0.35,
  subtitle: 0.3,
  keywordsField: 0.25,
  description: 0.1,
} as const;

export const APPLE_CAPS = {
  title: 30,
  subtitle: 30,
  keywordsField: 100,
  description: 4000,
} as const;

export interface MetadataSubscoreInternal {
  score: number;
  reasons: string[];
  // Subset of `reasons` flagged as "this is what dragged the score down."
  // The synthesis layer reads this when it needs to surface an honest
  // rationale (e.g., the subtitle-rewrite recommendation should never
  // quote a positive reason as its "why"). Empty when nothing about the
  // field was scored negatively — in that case the field is healthy and
  // no rewrite recommendation should fire.
  negativeReasons: string[];
}

// Internal helper — keeps the two-array bookkeeping local to each scorer.
// Always mirrors negative reasons into the `negativeReasons` set so the
// synthesis layer never has to re-parse prose to figure out polarity.
interface ReasonState {
  reasons: string[];
  negativeReasons: string[];
}

function recordReason(
  state: ReasonState,
  reason: string,
  polarity: "negative" | "positive" | "neutral",
): void {
  state.reasons.push(reason);
  if (polarity === "negative") state.negativeReasons.push(reason);
}

export interface MetadataScoringResult {
  overall: number;
  title: MetadataSubscoreInternal;
  subtitle: MetadataSubscoreInternal;
  keywordsField: MetadataSubscoreInternal;
  description: MetadataSubscoreInternal;
}

export interface ScoreMetadataInput {
  app: AppRecord | null;
  detectedApp: DetectedApp;
  keywords: readonly string[];
}

export function scoreMetadata(input: ScoreMetadataInput): MetadataScoringResult {
  const lowercased = input.keywords.map((k) => k.toLowerCase().trim()).filter(Boolean);
  const primaryKeyword = lowercased[0];

  // When we only have a fixture detectedApp (no AppRecord), score the bare
  // identity we have. We still produce a useful subscore — it's honest about
  // what we couldn't observe.
  const title = input.app?.name ?? input.detectedApp.name;
  const subtitle = input.app?.subtitle ?? "";
  const subtitleProvenance = input.app?.subtitleProvenance;
  const description = input.app?.description ?? "";

  return {
    title: scoreTitle(title, primaryKeyword, lowercased),
    subtitle: scoreSubtitle(subtitle, primaryKeyword, lowercased, subtitleProvenance),
    keywordsField: scoreKeywordsField(lowercased, title, subtitle),
    description: scoreDescription(description, lowercased),
    overall: 0, // populated below
  } as MetadataScoringResult & { overall: number };
}

// Compose overall after the subscores so the weight constants stay in one
// place. Exposed separately so tests can verify the math independently.
export function composeOverall(parts: {
  title: MetadataSubscoreInternal;
  subtitle: MetadataSubscoreInternal;
  keywordsField: MetadataSubscoreInternal;
  description: MetadataSubscoreInternal;
}): number {
  const raw =
    parts.title.score * METADATA_WEIGHTS.title +
    parts.subtitle.score * METADATA_WEIGHTS.subtitle +
    parts.keywordsField.score * METADATA_WEIGHTS.keywordsField +
    parts.description.score * METADATA_WEIGHTS.description;
  return Math.round(clamp(raw, 0, 100));
}

// Re-export a single-call helper that builds the full result with overall
// populated. The two-step pattern above is only to keep the math testable.
export function scoreMetadataFull(input: ScoreMetadataInput): MetadataScoringResult {
  const partial = scoreMetadata(input);
  return {
    ...partial,
    overall: composeOverall(partial),
  };
}

function scoreTitle(
  title: string,
  primary: string | undefined,
  allKeywords: readonly string[],
): MetadataSubscoreInternal {
  const state: ReasonState = { reasons: [], negativeReasons: [] };
  const len = title.length;
  const normalizedTitle = title.toLowerCase();

  let score = 50;

  // Length usage of the 30-char cap. Apple titles that use 18–28 chars hit
  // the sweet spot — long enough to carry brand + a keyword, short enough to
  // not get truncated in search results.
  if (len === 0) {
    recordReason(state, "Title is empty — listing will fall back to bundle name.", "negative");
    score = 10;
  } else if (len > APPLE_CAPS.title) {
    recordReason(
      state,
      `Title is ${len} characters — Apple caps titles at ${APPLE_CAPS.title} and will truncate.`,
      "negative",
    );
    score -= 25;
  } else if (len < 8) {
    recordReason(
      state,
      `Title is only ${len} characters — under-using the 30-char budget.`,
      "negative",
    );
    score -= 10;
  } else if (len >= 18 && len <= 28) {
    recordReason(state, `Title length (${len} chars) is in the optimal 18–28 range.`, "positive");
    score += 10;
  } else {
    recordReason(state, `Title length (${len}/${APPLE_CAPS.title}) is acceptable.`, "neutral");
  }

  // Primary keyword presence in title — distinguish exact-phrase from
  // separated tokens. Exact phrase is materially better for Apple's
  // tokenizer; this lets the synthesis layer write copy like
  // "'habit tracker' is in your title as separate words — moving to an
  // exact phrase strengthens this keyword".
  if (primary && primary.length > 0) {
    const match = classifyKeywordMatch({ keyword: primary, title });
    if (match === "titleExactPhrase") {
      recordReason(state, `Title carries "${primary}" as an exact phrase.`, "positive");
      score += 25;
    } else if (match === "titleAllWords") {
      recordReason(
        state,
        `Title carries "${primary}" only as separated tokens — converting to an exact phrase is the cheapest single fix.`,
        "negative",
      );
      score += 10;
    } else {
      recordReason(
        state,
        `Title does not carry the primary keyword "${primary}" — biggest single rank lever.`,
        "negative",
      );
      score -= 15;
    }
  }

  // Any keyword presence at all.
  const otherKeywordsCovered = allKeywords
    .slice(1)
    .filter((k) => k.length > 0 && normalizedTitle.includes(k)).length;
  if (otherKeywordsCovered > 0) {
    recordReason(
      state,
      `Title also surfaces ${otherKeywordsCovered} secondary keyword${
        otherKeywordsCovered === 1 ? "" : "s"
      }.`,
      "positive",
    );
    score += 5 * Math.min(otherKeywordsCovered, 2);
  }

  // Keyword stuffing penalty: more than 2 user keywords inside a 30-char
  // title is almost always reading like spam.
  const totalCovered = allKeywords.filter(
    (k) => k.length > 0 && normalizedTitle.includes(k),
  ).length;
  if (totalCovered >= 3) {
    recordReason(
      state,
      "Title appears keyword-stuffed — Apple penalizes obvious stacking.",
      "negative",
    );
    score -= 10;
  }

  return {
    score: clamp(Math.round(score), 0, 100),
    reasons: state.reasons,
    negativeReasons: state.negativeReasons,
  };
}

function scoreSubtitle(
  subtitle: string,
  primary: string | undefined,
  allKeywords: readonly string[],
  subtitleProvenance: Provenance | undefined,
): MetadataSubscoreInternal {
  const state: ReasonState = { reasons: [], negativeReasons: [] };
  const len = subtitle.length;
  const normalized = subtitle.toLowerCase();

  if (len === 0) {
    // When the storefront-page provider successfully fetched the listing
    // and the subtitle was truly absent, claim "empty" honestly. When the
    // fetch failed (subtitleProvenance === "degraded") OR was never
    // attempted (undefined — legacy / fixture path), swap to a "source
    // unavailable" advisory so we don't tell apps with real subtitles that
    // they have none.
    const provenanceKnown =
      subtitleProvenance === "live" || subtitleProvenance === "cached";
    const emptyReason = provenanceKnown
      ? "Subtitle is empty — leaving the highest-leverage 30-char keyword slot unused."
      : "Subtitle source unavailable — re-scan in a few minutes to confirm.";
    // Empty-subtitle prose is the "drag" — surface as negative when we're
    // confident the subtitle really is empty. The degraded-provider variant
    // is neutral (we don't know enough to call it a problem).
    recordReason(state, emptyReason, provenanceKnown ? "negative" : "neutral");
    return {
      score: 25,
      reasons: state.reasons,
      negativeReasons: state.negativeReasons,
    };
  }

  let score = 55;

  if (len > APPLE_CAPS.subtitle) {
    recordReason(
      state,
      `Subtitle is ${len} characters — exceeds Apple's ${APPLE_CAPS.subtitle}-char cap and will truncate.`,
      "negative",
    );
    score -= 20;
  } else if (len >= 20 && len <= 28) {
    recordReason(
      state,
      `Subtitle length (${len} chars) is in the optimal 20–28 range.`,
      "positive",
    );
    score += 10;
  } else {
    recordReason(
      state,
      `Subtitle length (${len}/${APPLE_CAPS.subtitle}) leaves room to grow.`,
      "neutral",
    );
  }

  if (primary && primary.length > 0) {
    // Reuse the title-vs-keyword classifier on the subtitle text. The
    // classifier doesn't care about the field's identity — it only checks
    // for an exact-phrase token match vs separated all-words.
    const match = classifyKeywordMatch({ keyword: primary, title: subtitle });
    if (match === "titleExactPhrase") {
      const leadsWith = normalized.startsWith(primary);
      recordReason(
        state,
        leadsWith
          ? `Subtitle leads with "${primary}" as an exact phrase — strong placement.`
          : `Subtitle includes "${primary}" as an exact phrase but not at the front.`,
        "positive",
      );
      score += leadsWith ? 25 : 15;
    } else if (match === "titleAllWords") {
      recordReason(
        state,
        `Subtitle includes the tokens of "${primary}" but not as a phrase — convert to a contiguous phrase to gain rank weight.`,
        "negative",
      );
      score += 8;
    } else {
      recordReason(
        state,
        `Subtitle does not include the primary keyword "${primary}" — the cheapest fix available.`,
        "negative",
      );
      score -= 15;
    }
  }

  const otherKeywordsCovered = allKeywords
    .slice(1)
    .filter((k) => k.length > 0 && normalized.includes(k)).length;
  if (otherKeywordsCovered > 0) {
    recordReason(
      state,
      `Subtitle picks up ${otherKeywordsCovered} secondary keyword${
        otherKeywordsCovered === 1 ? "" : "s"
      }.`,
      "positive",
    );
    score += 5 * Math.min(otherKeywordsCovered, 2);
  }

  return {
    score: clamp(Math.round(score), 0, 100),
    reasons: state.reasons,
    negativeReasons: state.negativeReasons,
  };
}

function scoreKeywordsField(
  keywords: readonly string[],
  title: string,
  subtitle: string,
): MetadataSubscoreInternal {
  // We can't observe the developer's App Store Connect keywords field. We
  // score the user-submitted keywords[] as a proxy — these are the keywords
  // the user actually cares about ranking for, which is what the keywords
  // field should be carrying.
  const state: ReasonState = { reasons: [], negativeReasons: [] };
  if (keywords.length === 0) {
    recordReason(
      state,
      "No keywords provided — can't infer keyword-field strategy.",
      "negative",
    );
    return {
      score: 30,
      reasons: state.reasons,
      negativeReasons: state.negativeReasons,
    };
  }

  let score = 55;

  // Length budget of the 100-char keywords field. Apple expects comma-joined
  // single tokens, no spaces, so estimate the byte cost as joined-by-commas.
  const joined = keywords.join(",");
  const budgetUsed = joined.length;
  if (budgetUsed > APPLE_CAPS.keywordsField) {
    recordReason(
      state,
      `Keyword set joined to ${budgetUsed} characters — exceeds the 100-char field cap.`,
      "negative",
    );
    score -= 15;
  } else if (budgetUsed < 30) {
    recordReason(
      state,
      `Keyword budget only ${budgetUsed}/100 chars used — room for more terms.`,
      "negative",
    );
    score -= 10;
  } else if (budgetUsed >= 60 && budgetUsed <= 95) {
    recordReason(state, `Keyword budget (${budgetUsed}/100) is well-utilized.`, "positive");
    score += 10;
  } else {
    recordReason(state, `Keyword budget (${budgetUsed}/100) is acceptable.`, "neutral");
  }

  // Diversity: keywords field should not duplicate words already in title +
  // subtitle (Apple indexes them once across all fields).
  const visibleWords = new Set(
    `${title} ${subtitle}`
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z0-9]/g, ""))
      .filter((w) => w.length > 2),
  );
  const dupes = keywords.filter((k) =>
    k.toLowerCase().split(/\s+/).every((token) => visibleWords.has(token)),
  );
  if (dupes.length > 0) {
    recordReason(
      state,
      `${dupes.length} keyword${dupes.length === 1 ? "" : "s"} duplicate${
        dupes.length === 1 ? "s" : ""
      } words already in the title/subtitle — wasted slots.`,
      "negative",
    );
    score -= 8 * Math.min(dupes.length, 3);
  } else {
    recordReason(
      state,
      "Keywords field is diverse — no overlap with title/subtitle.",
      "positive",
    );
    score += 5;
  }

  // Duplicates inside the keyword set itself.
  const unique = new Set(keywords.map((k) => k.toLowerCase().trim()));
  if (unique.size < keywords.length) {
    recordReason(state, "Duplicate keywords in the set — collapse them.", "negative");
    score -= 10;
  }

  return {
    score: clamp(Math.round(score), 0, 100),
    reasons: state.reasons,
    negativeReasons: state.negativeReasons,
  };
}

function scoreDescription(
  description: string,
  keywords: readonly string[],
): MetadataSubscoreInternal {
  // Note: this subscore lands in the `screenshots` schema field per Phase 04
  // decisions — the schema name is preserved for SDK compatibility but the
  // content is a description-density heuristic. Notes here therefore should
  // read as descriptive of the listing's *narrative*, not the screenshots.
  const state: ReasonState = { reasons: [], negativeReasons: [] };
  const len = description.length;
  const normalized = description.toLowerCase();

  if (len === 0) {
    recordReason(state, "Description is empty — listing reads thin to humans.", "negative");
    return {
      score: 30,
      reasons: state.reasons,
      negativeReasons: state.negativeReasons,
    };
  }

  let score = 60;

  if (len < 200) {
    recordReason(
      state,
      `Description is short (${len} chars) — under-using the listing page.`,
      "negative",
    );
    score -= 10;
  } else if (len >= 800 && len <= 3000) {
    recordReason(
      state,
      `Description length (${len} chars) is well-paced for skim-readers.`,
      "positive",
    );
    score += 5;
  } else if (len > APPLE_CAPS.description) {
    recordReason(
      state,
      `Description exceeds the ${APPLE_CAPS.description}-char cap.`,
      "negative",
    );
    score -= 5;
  }

  // Keyword coverage in description: not indexed for rank but signals that
  // the listing copy is on-topic with the user's targeting.
  const covered = keywords.filter((k) => k.length > 0 && normalized.includes(k));
  if (keywords.length > 0) {
    const ratio = covered.length / keywords.length;
    if (ratio >= 0.7) {
      recordReason(
        state,
        `Description covers ${covered.length}/${keywords.length} target keywords.`,
        "positive",
      );
      score += 8;
    } else if (ratio === 0) {
      recordReason(
        state,
        "Description mentions none of the target keywords.",
        "negative",
      );
      score -= 10;
    } else {
      recordReason(
        state,
        `Description covers ${covered.length}/${keywords.length} target keywords — could lean in.`,
        "negative",
      );
    }
  }

  // Call-to-action heuristic.
  const ctaPatterns = [
    "download",
    "try",
    "start",
    "join",
    "get started",
    "sign up",
    "free",
  ];
  if (ctaPatterns.some((p) => normalized.includes(p))) {
    recordReason(state, "Description includes a call-to-action verb.", "positive");
    score += 5;
  } else {
    recordReason(state, "Description lacks an obvious call-to-action.", "negative");
    score -= 5;
  }

  return {
    score: clamp(Math.round(score), 0, 100),
    reasons: state.reasons,
    negativeReasons: state.negativeReasons,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
