import {
  SCHEMA_VERSION,
  type AppIdentifier,
  type CompetitorTrailItem,
  type CountryCode,
  type DataProvenance,
  type DetectedApp,
  type DiagnosePaidResponse,
  type KeywordDiagnosisItem,
  type MetadataScore,
  type ReadyToPaste,
  type RecommendationItem,
  type RequestId,
  type SniffId,
  type Store,
} from "../schemas/index.js";
import { sampleReport } from "../data/fixtures.js";
import {
  getFullReportData,
  type KeywordRankDatum,
  type CompetitorCandidate,
  type ReportData,
} from "../data/report-data.js";

// Phase 03: ReportPayload now includes dataProvenance — the orchestrator is
// the source of truth for which provenance label each section earned. Phase
// 02 had this field hardcoded in the diagnose route.
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

// Fixture-overlay strategy still applies for the free-text fields (summary,
// recommendation prose, ready-to-paste copy) — Phase 04 replaces those with
// AI synthesis. Phase 03 wires up the structural fields (rankBucket,
// confidence, competitor IDs) to real provider data.
export async function generateReport(
  input: GenerateReportInput,
): Promise<ReportPayload> {
  const data = await getFullReportData({
    store: input.store,
    app: input.app,
    country: input.country,
    keywords: input.keywords,
  });

  const userKeywords = [...input.keywords];
  const firstKeyword = userKeywords[0] ?? "your keyword";

  return {
    reportVersion: SCHEMA_VERSION,
    dataProvenance: data.dataProvenance,
    summary: buildSummary(data.detectedApp, firstKeyword),
    keywordDiagnosis: buildKeywordDiagnosis(userKeywords, data.keywordRanks),
    competitorTrail: buildCompetitorTrail(
      data.detectedApp,
      data.competitors,
      userKeywords,
    ),
    metadataScore: overlayMetadataScore(data.detectedApp, firstKeyword),
    recommendations: overlayRecommendations(data.detectedApp, firstKeyword),
    readyToPaste: overlayReadyToPaste(data.detectedApp, userKeywords),
  };
}

function buildSummary(app: DetectedApp, firstKeyword: string): string {
  return `${app.name} ranks mid-pack for "${firstKeyword}" and is losing surface area to two competitors with tighter subtitles. The fastest unlock is a subtitle rewrite that pulls "${firstKeyword}" to the front; the keywords field has two filler slots worth reclaiming.`;
}

function buildKeywordDiagnosis(
  keywords: readonly string[],
  ranks: KeywordRankDatum[],
): KeywordDiagnosisItem[] {
  const fixture = sampleReport.keywordDiagnosis;
  if (keywords.length === 0) return [];

  return keywords.map((keyword, index) => {
    const template = fixture[index % fixture.length] as KeywordDiagnosisItem;
    const real = ranks[index];
    return {
      keyword,
      // Real rank + confidence + provenance when present; fixture otherwise.
      rankBucket: real?.rankBucket ?? template.rankBucket,
      intentScore: template.intentScore,
      confidence: real?.confidence ?? template.confidence,
      provenance: real?.provenance ?? "fixture",
      recommendation: rewriteKeywordRecommendation(
        template.recommendation,
        keyword,
      ),
    };
  });
}

function rewriteKeywordRecommendation(
  templateText: string,
  keyword: string,
): string {
  const replaced = templateText.replace(/['"][^'"]+['"]/, `"${keyword}"`);
  if (replaced === templateText) {
    return `Action for "${keyword}": ${templateText}`;
  }
  return replaced;
}

function buildCompetitorTrail(
  app: DetectedApp,
  competitors: CompetitorCandidate[],
  keywords: readonly string[],
): CompetitorTrailItem[] {
  if (competitors.length > 0) {
    const overlap = keywords.slice(0, 2);
    return competitors.slice(0, 2).map((competitor, index) => {
      const template =
        sampleReport.competitorTrail[index % sampleReport.competitorTrail.length]!;
      return {
        appId: competitor.appId,
        name: competitor.name,
        overlapKeywords: overlap.length > 0 ? [...overlap] : template.overlapKeywords,
        notes: template.notes
          .replace(/Pawprint Habits/g, app.name)
          .replace(/Streakly|RoutineLab/g, competitor.name),
        provenance: competitor.provenance,
      };
    });
  }

  // No live competitors — fall back to fixture overlay.
  const overlap = keywords.slice(0, 2);
  return sampleReport.competitorTrail.map((entry) => ({
    appId: entry.appId,
    name: entry.name,
    overlapKeywords: overlap.length > 0 ? [...overlap] : entry.overlapKeywords,
    notes: entry.notes.replace(/Pawprint Habits/g, app.name),
    provenance: "fixture",
  }));
}

function overlayMetadataScore(
  app: DetectedApp,
  firstKeyword: string,
): MetadataScore {
  const base = sampleReport.metadataScore;
  return {
    overall: base.overall,
    title: {
      score: base.title.score,
      notes: `${app.name}'s title has strong brand recall but doesn't carry a category keyword for "${firstKeyword}".`,
    },
    subtitle: {
      score: base.subtitle.score,
      notes: `Subtitle uses adjacent terms but leaves "${firstKeyword}" — the highest-intent term — on the table.`,
    },
    keywords: base.keywords,
    screenshots: base.screenshots,
  };
}

function overlayRecommendations(
  app: DetectedApp,
  firstKeyword: string,
): RecommendationItem[] {
  return sampleReport.recommendations.map((rec, index) => {
    if (index === 0) {
      return {
        rank: rec.rank,
        impact: rec.impact,
        effort: rec.effort,
        action: `Rewrite ${app.name}'s subtitle to lead with "${firstKeyword}".`,
        rationale: `"${firstKeyword}" is currently buried in the keywords field where it competes for surface area. Moving it to the subtitle is the cheapest rank-coverage win available.`,
      };
    }
    return {
      rank: rec.rank,
      impact: rec.impact,
      effort: rec.effort,
      action: rec.action.replace(/Pawprint Habits/g, app.name),
      rationale: rec.rationale.replace(/Pawprint Habits/g, app.name),
    };
  });
}

function overlayReadyToPaste(
  app: DetectedApp,
  keywords: readonly string[],
): ReadyToPaste {
  const firstKeyword = keywords[0] ?? "habit tracker";
  const keywordsField =
    keywords.length > 0
      ? keywords.join(",").toLowerCase()
      : sampleReport.readyToPaste.keywordsField;
  return {
    title: app.name,
    subtitle: `${capitalize(firstKeyword)} · Streaks & Routines`,
    keywordsField,
    shortDescription: `${app.name} is a focused ${firstKeyword} app that turns daily routines into streaks you actually want to keep.`,
  };
}

function capitalize(text: string): string {
  if (text.length === 0) return text;
  return text
    .split(" ")
    .map((word) => (word ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(" ");
}

// Re-export ReportData for downstream tests/utilities.
export type { ReportData };
