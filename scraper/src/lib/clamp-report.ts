// Response-boundary sanitizer for DiagnosePaidResponse.
//
// Why this exists: the diagnose route accepts x402 payment on Morph Mainnet
// (non-refundable) and only THEN runs DiagnosePaidResponse.parse(...) on the
// assembled report. If any producer drifts past a `.min()/.max()` constraint
// in the schema, the paying user gets a 400 — the worst possible outcome for
// an x402 paywalled API. The producer is the right place to fix any specific
// drift; this sanitizer is the safety net that turns "future drift" into a
// structured warn log instead of a paying-user-facing 400.
//
// The list of fields is intentionally explicit (not derived from the Zod
// schema). Adding a new constrained field is a deliberate code change so the
// sanitizer can never silently mask a contract widening.

import type { DiagnosePaidResponse } from "../schemas/diagnose.js";

interface ClampLogEvent {
  ts: string;
  level: "warn";
  event: "report_field_clamped";
  requestId: string;
  path: string;
  original: number;
  clamped: number;
}

export interface ClampContext {
  requestId: string;
  log?: (event: ClampLogEvent) => void;
}

interface Range {
  min: number;
  max: number;
  int?: boolean;
}

// Sanitize every constrained numeric field in the paid response, returning a
// (possibly mutated) report whose numeric fields satisfy the schema. Emits
// one structured warn-log per clamp via ctx.log.
//
// The mutation is in-place on copies of the affected branches so callers can
// pass an immutable report without surprise; null-passthrough is preserved.
export function clampReportToContract(
  report: DiagnosePaidResponse,
  ctx: ClampContext,
): DiagnosePaidResponse {
  const log = ctx.log ?? defaultLog;
  const out: DiagnosePaidResponse = { ...report };

  // keywordDiagnosis[]
  out.keywordDiagnosis = report.keywordDiagnosis.map((row, i) => {
    const base = `keywordDiagnosis.${i}`;
    return {
      ...row,
      intentScore: clampNum(row.intentScore, INTENT_RANGE, `${base}.intentScore`, ctx, log),
      popularityScore: clampNullableInt(
        row.popularityScore,
        POPULARITY_RANGE,
        `${base}.popularityScore`,
        ctx,
        log,
      ),
      difficulty: clampNullableInt(
        row.difficulty,
        DIFFICULTY_RANGE,
        `${base}.difficulty`,
        ctx,
        log,
      ),
      minDifficulty: clampNullableInt(
        row.minDifficulty,
        DIFFICULTY_RANGE,
        `${base}.minDifficulty`,
        ctx,
        log,
      ),
      // Wave 1 — chance/kei share the difficulty contract range (1..100 int).
      chance: clampNullableInt(row.chance, DIFFICULTY_RANGE, `${base}.chance`, ctx, log),
      kei: clampNullableInt(row.kei, DIFFICULTY_RANGE, `${base}.kei`, ctx, log),
    };
  });

  // metadataScore: overall + 6 subscores
  out.metadataScore = {
    ...report.metadataScore,
    overall: clampNum(
      report.metadataScore.overall,
      SCORE_RANGE,
      "metadataScore.overall",
      ctx,
      log,
    ),
    title: clampSubscore(report.metadataScore.title, "metadataScore.title", ctx, log),
    subtitle: clampSubscore(report.metadataScore.subtitle, "metadataScore.subtitle", ctx, log),
    keywords: clampSubscore(report.metadataScore.keywords, "metadataScore.keywords", ctx, log),
    screenshots: clampSubscore(
      report.metadataScore.screenshots,
      "metadataScore.screenshots",
      ctx,
      log,
    ),
    ratingsAndReviews: clampSubscore(
      report.metadataScore.ratingsAndReviews,
      "metadataScore.ratingsAndReviews",
      ctx,
      log,
    ),
    keywordRankings: clampSubscore(
      report.metadataScore.keywordRankings,
      "metadataScore.keywordRankings",
      ctx,
      log,
    ),
  };

  // localizationAnalysis (nullable)
  if (report.localizationAnalysis) {
    const la = report.localizationAnalysis;
    out.localizationAnalysis = {
      ...la,
      storefronts: la.storefronts.map((sf, i) => ({
        ...sf,
        gapScore: clampInt(
          sf.gapScore,
          GAP_RANGE,
          `localizationAnalysis.storefronts.${i}.gapScore`,
          ctx,
          log,
        ),
      })),
      overallGapScore: clampNullableInt(
        la.overallGapScore,
        GAP_RANGE,
        "localizationAnalysis.overallGapScore",
        ctx,
        log,
      ),
    };
  }

  return out;
}

const INTENT_RANGE: Range = { min: 0, max: 1 };
const POPULARITY_RANGE: Range = { min: 0, max: 100, int: true };
const DIFFICULTY_RANGE: Range = { min: 1, max: 100, int: true };
const SCORE_RANGE: Range = { min: 0, max: 100 };
const GAP_RANGE: Range = { min: 0, max: 100, int: true };

function clampNum(
  value: number,
  range: Range,
  path: string,
  ctx: ClampContext,
  log: (event: ClampLogEvent) => void,
): number {
  if (!Number.isFinite(value)) {
    // Non-finite (NaN/Infinity) can't be left in a paid response; clamp to min.
    log({
      ts: new Date().toISOString(),
      level: "warn",
      event: "report_field_clamped",
      requestId: ctx.requestId,
      path,
      original: value,
      clamped: range.min,
    });
    return range.min;
  }
  if (value >= range.min && value <= range.max) return value;
  const clamped = Math.max(range.min, Math.min(range.max, value));
  log({
    ts: new Date().toISOString(),
    level: "warn",
    event: "report_field_clamped",
    requestId: ctx.requestId,
    path,
    original: value,
    clamped,
  });
  return clamped;
}

function clampInt(
  value: number,
  range: Range,
  path: string,
  ctx: ClampContext,
  log: (event: ClampLogEvent) => void,
): number {
  const num = clampNum(value, range, path, ctx, log);
  return Math.round(num);
}

function clampNullableInt(
  value: number | null,
  range: Range,
  path: string,
  ctx: ClampContext,
  log: (event: ClampLogEvent) => void,
): number | null {
  if (value === null) return null;
  return clampInt(value, range, path, ctx, log);
}

function clampSubscore<T extends { score: number; notes: string }>(
  subscore: T,
  path: string,
  ctx: ClampContext,
  log: (event: ClampLogEvent) => void,
): T {
  const clamped = clampNum(subscore.score, SCORE_RANGE, `${path}.score`, ctx, log);
  if (clamped === subscore.score) return subscore;
  return { ...subscore, score: clamped };
}

function defaultLog(event: ClampLogEvent): void {
  process.stderr.write(`${JSON.stringify(event)}\n`);
}
