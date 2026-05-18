import {
  SCHEMA_VERSION,
  type AppIdentifier,
  type CompetitorTrailItem,
  type CountryCode,
  type DataProvenance,
  type DiagnosePaidResponse,
  type KeywordDiagnosisItem,
  type MetadataScore,
  type RequestId,
  type SniffId,
  type Store,
} from "../schemas/index.js";
import type { AppRecord } from "../providers/apple/types.js";
import {
  getFullReportData,
  type CompetitorCandidate,
  type ReportData,
} from "../data/report-data.js";
import {
  analyzeCompetitors,
  diagnoseKeywords,
  scoreMetadataFull,
  type CompetitorAnalysis,
  type KeywordDiagnosis,
  type MetadataScoringResult,
} from "../scoring/index.js";
import {
  buildCompetitorNotes,
  buildKeywordRecommendation,
  buildMetadataNotes,
  synthesizeReportOpenAi,
  type SynthesisInput,
  type SynthesisOutput,
} from "../synthesis/index.js";

// Phase 04: the orchestrator owns the full pipeline.
//   1) Phase 03 data layer (live → cached → fixture)
//   2) Deterministic scoring (metadata + keyword diagnosis + competitors)
//   3) AI synthesis with template fallback (summary, recommendations,
//      readyToPaste)
//   4) Assembly into the schema-defined ReportPayload with honest provenance.
//
// Everything synthesized (AI or template) gets `provenance: 'inferred'` on
// the `recommendations` slot of dataProvenance.

export type ReportPayload = Omit<
  DiagnosePaidResponse,
  "requestId" | "sniffId" | "receipt"
>;

export interface GenerateReportInput {
  requestId: RequestId;
  sniffId: SniffId;
  store: Store;
  app: AppIdentifier;
  country: CountryCode;
  keywords: readonly string[];
}

export async function generateReport(
  input: GenerateReportInput,
): Promise<ReportPayload> {
  const data = await getFullReportData({
    store: input.store,
    app: input.app,
    country: input.country,
    keywords: input.keywords,
  });

  // ---------- Scoring (deterministic) ----------
  const metadataScoring = scoreMetadataFull({
    app: data.detect.appRecord,
    detectedApp: data.detectedApp,
    keywords: input.keywords,
  });

  const keywordScoring = diagnoseKeywords({
    keywords: input.keywords,
    ranks: data.keywordRanks,
    app: data.detect.appRecord,
  });

  const candidateRecords = buildCandidateRecordsMap(data.competitors);
  const competitorScoring = analyzeCompetitors({
    target: data.detect.appRecord,
    targetKeywords: input.keywords,
    candidates: data.competitors,
    candidateRecords,
  });

  // ---------- Synthesis (AI with template fallback) ----------
  const synthesisInput: SynthesisInput = {
    scoring: {
      metadata: metadataScoring,
      keywords: keywordScoring,
      competitors: competitorScoring,
    },
    context: {
      detectedApp: data.detectedApp,
      appRecord: data.detect.appRecord,
      keywords: input.keywords,
    },
  };

  const synthesis = await synthesizeReportOpenAi(synthesisInput, {
    requestId: input.requestId,
  });

  // ---------- Assembly ----------
  return {
    reportVersion: SCHEMA_VERSION,
    dataProvenance: assembleProvenance(data.dataProvenance),
    summary: synthesis.summary,
    keywordDiagnosis: assembleKeywordDiagnosis(keywordScoring),
    competitorTrail: assembleCompetitorTrail(competitorScoring),
    metadataScore: assembleMetadataScore(metadataScoring),
    recommendations: synthesis.recommendations,
    readyToPaste: synthesis.readyToPaste,
  };
}

function buildCandidateRecordsMap(
  candidates: readonly CompetitorCandidate[],
): Map<string, AppRecord> {
  const map = new Map<string, AppRecord>();
  for (const c of candidates) {
    if (c.record) map.set(c.appId, c.record);
  }
  return map;
}

function assembleProvenance(base: DataProvenance): DataProvenance {
  // Phase 04: synthesis runs unconditionally (AI succeeds OR template
  // fallback fires), so the recommendations slot is always 'inferred'.
  return {
    ...base,
    recommendations: "inferred",
  };
}

function assembleKeywordDiagnosis(
  scoring: readonly KeywordDiagnosis[],
): KeywordDiagnosisItem[] {
  return scoring.map((d) => ({
    keyword: d.keyword,
    rankBucket: d.rankBucket,
    intentScore: d.intentScore,
    confidence: d.confidence,
    provenance: d.provenance,
    recommendation: buildKeywordRecommendation(d),
  }));
}

function assembleCompetitorTrail(
  scoring: readonly CompetitorAnalysis[],
): CompetitorTrailItem[] {
  return scoring.map((c) => ({
    appId: c.appId,
    name: c.name,
    overlapKeywords: c.overlapKeywords,
    notes: buildCompetitorNotes(c),
    provenance: c.provenance,
  }));
}

function assembleMetadataScore(
  scoring: MetadataScoringResult,
): MetadataScore {
  const notes = buildMetadataNotes(scoring);
  return {
    overall: scoring.overall,
    title: { score: scoring.title.score, notes: notes.title },
    subtitle: { score: scoring.subtitle.score, notes: notes.subtitle },
    keywords: { score: scoring.keywordsField.score, notes: notes.keywordsField },
    // Schema field name preserved for SDK compatibility; populated with
    // description-density score per Phase 04 decision.
    screenshots: { score: scoring.description.score, notes: notes.description },
  };
}

// Re-export ReportData for downstream tests/utilities.
export type { ReportData };
export type { SynthesisOutput };
