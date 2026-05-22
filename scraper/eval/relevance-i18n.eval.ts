/**
 * Phase 9 (Day 5) — i18n eval harness for the relevance gate.
 *
 * Gates a production rollout of RELEVANCE_GATE_ENABLED=true by measuring
 * how aggressively the gate rejects candidate keywords across non-English
 * locales. Embedding models exhibit systematic biases against under-
 * represented languages, niche jargon, and short brand-term keywords;
 * without this check, the first paying non-en-US customer could see a
 * report stripped of usable keyword recommendations — and the payment
 * is non-refundable on Morph Mainnet.
 *
 * Acceptance criteria (devsecops review):
 *   - ≤30% of currently-recommended keywords get rejected by the gate
 *     across all locales
 *   - ≤1 false-positive (gate rejected a clearly on-topic term) per
 *     10 rejections eyeballed
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... RUN_I18N_EVAL=1 pnpm -F scraper exec tsx \
 *     scraper/eval/relevance-i18n.eval.ts
 *
 * Fixtures live at scraper/fixtures/i18n/<locale>-sample-report.json
 * and must be authored with real category-relevant sample data — they
 * are NOT auto-generated. Each fixture is a partial DiagnosePaidResponse
 * with at least: app (name + primaryCategory + subtitle), keywordDiagnosis,
 * competitorTrail, and suggestedKeywords.
 *
 * If the fixtures don't exist yet (LOCALES_TODO list non-empty), the
 * harness prints a TODO and exits 0 — running the harness on a missing
 * locale is not an error, it's a known gap to close before flipping the
 * flag.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildTargetVectorText,
  cosineSimilarity,
  embedText,
  isRelevanceGateEnabled,
} from "../src/scoring/embeddings.js";
import {
  scoreCandidates,
  type CandidateKeyword,
  type CompetitorRef,
} from "../src/scoring/relevance.js";

interface I18nFixture {
  locale: string;
  app: {
    name: string;
    subtitle?: string;
    primaryCategory: string;
    description?: string;
  };
  primaryKeywords: string[];
  candidates: Array<{
    keyword: string;
    origin: "competitor" | "asa-rec" | "autocomplete" | "review";
    sourceCompetitor?: string;
  }>;
  competitorContexts?: CompetitorRef[];
}

const LOCALES = ["ko", "ja", "es", "ar"] as const;
const FIXTURES_DIR = path.resolve(__dirname, "..", "fixtures", "i18n");
const REJECTION_THRESHOLD = 0.3;

async function loadFixture(locale: string): Promise<I18nFixture | null> {
  const filepath = path.join(FIXTURES_DIR, `${locale}-sample-report.json`);
  try {
    const raw = await readFile(filepath, "utf8");
    return JSON.parse(raw) as I18nFixture;
  } catch {
    return null;
  }
}

interface LocaleResult {
  locale: string;
  totalCandidates: number;
  rejectedOffTopic: number;
  rejectedPct: number;
  rejections: Array<{ keyword: string; cosine: number; intent: number }>;
}

async function runLocale(fixture: I18nFixture): Promise<LocaleResult> {
  const targetText = buildTargetVectorText({
    appName: fixture.app.name,
    ...(fixture.app.subtitle !== undefined
      ? { subtitle: fixture.app.subtitle }
      : {}),
    ...(fixture.app.description !== undefined
      ? { description: fixture.app.description }
      : {}),
    primaryKeywords: fixture.primaryKeywords,
  });
  const target = await embedText(targetText);

  const cosineByKeyword = new Map<string, number>();
  for (const cand of fixture.candidates) {
    const norm = cand.keyword.toLowerCase().trim();
    if (cosineByKeyword.has(norm)) continue;
    try {
      const candVec = await embedText(norm);
      cosineByKeyword.set(
        norm,
        cosineSimilarity(target.vector, candVec.vector),
      );
    } catch {
      // skip on per-keyword failure
    }
  }

  const candidates: CandidateKeyword[] = fixture.candidates.map((c) => ({
    keyword: c.keyword,
    origin: c.origin,
    ...(c.sourceCompetitor !== undefined
      ? { sourceCompetitor: c.sourceCompetitor }
      : {}),
  }));

  const scored = scoreCandidates({
    candidates,
    appContext: {
      appName: fixture.app.name,
      primaryCategory: fixture.app.primaryCategory,
      userKeywords: fixture.primaryKeywords,
    },
    competitorContexts: fixture.competitorContexts ?? [],
    cosineByKeyword,
  });

  const offTopic = scored.filter((s) => s.relevanceLabel === "off-topic");
  const rejections = offTopic.map((s) => ({
    keyword: s.keyword,
    cosine: cosineByKeyword.get(s.keyword) ?? 0,
    intent: s.intentScore,
  }));

  return {
    locale: fixture.locale,
    totalCandidates: scored.length,
    rejectedOffTopic: offTopic.length,
    rejectedPct: scored.length > 0 ? offTopic.length / scored.length : 0,
    rejections,
  };
}

async function main(): Promise<void> {
  if (process.env.RUN_I18N_EVAL !== "1") {
    console.log(
      "[i18n-eval] Set RUN_I18N_EVAL=1 to run (requires OPENAI_API_KEY).",
    );
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("[i18n-eval] OPENAI_API_KEY required to run the eval.");
    process.exit(2);
  }
  console.log(
    `[i18n-eval] Gate flag currently: RELEVANCE_GATE_ENABLED=${isRelevanceGateEnabled()}`,
  );
  console.log(`[i18n-eval] Threshold: rejection rate must be ≤ ${REJECTION_THRESHOLD * 100}% per locale.`);

  const missingFixtures: string[] = [];
  const results: LocaleResult[] = [];
  for (const locale of LOCALES) {
    const fixture = await loadFixture(locale);
    if (!fixture) {
      missingFixtures.push(locale);
      continue;
    }
    const result = await runLocale(fixture);
    results.push(result);
    console.log(
      `[i18n-eval] ${result.locale}: ${result.rejectedOffTopic}/${result.totalCandidates} rejected (${(result.rejectedPct * 100).toFixed(1)}%)`,
    );
    if (result.rejections.length > 0) {
      console.log("  sample rejections:");
      for (const r of result.rejections.slice(0, 5)) {
        console.log(
          `    - "${r.keyword}" (cosine=${r.cosine.toFixed(3)}, intent=${r.intent.toFixed(2)})`,
        );
      }
    }
  }

  if (missingFixtures.length > 0) {
    console.log(
      `\n[i18n-eval] TODO — author fixtures at ${FIXTURES_DIR}/<locale>-sample-report.json for: ${missingFixtures.join(", ")}`,
    );
    console.log(
      "[i18n-eval] Skipping verdict — eval is informational until all locales have fixtures.",
    );
    return;
  }

  const overLimit = results.filter((r) => r.rejectedPct > REJECTION_THRESHOLD);
  if (overLimit.length > 0) {
    console.error(
      `\n[i18n-eval] FAIL — gate is over-rejecting in ${overLimit.map((r) => r.locale).join(", ")}. Do NOT flip RELEVANCE_GATE_ENABLED=true until tuned.`,
    );
    process.exit(1);
  }
  console.log(
    "\n[i18n-eval] PASS — every locale's rejection rate is within the threshold. Eyeball false-positives manually before flipping the flag.",
  );
}

void main().catch((err) => {
  console.error("[i18n-eval] crashed:", err);
  process.exit(2);
});
