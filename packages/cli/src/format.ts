import chalk from "chalk";
import type {
  DiagnosePaidResponse,
  Provenance,
  QuoteResponse,
  ReadyToPasteField,
  ReadyToPasteSource,
  SampleResponse,
} from "@sniffy/sdk";
import { getExplorerUrl } from "./explorer.js";

// Sniffy brand palette (see landing/ tailwind config).
const PRIMARY = chalk.hex("#FFD60A").bold; // signal yellow
const ACCENT = chalk.hex("#38B6FF").bold;  // bright teal
const MUTED = chalk.dim;

const PROVENANCE_ICON: Record<Provenance, string> = {
  live: "●",
  cached: "◐",
  degraded: "◌",
  fixture: "○",
  inferred: "◇",
};

function provLabel(p: Provenance): string {
  return `${PROVENANCE_ICON[p]} ${p}`;
}

function header(label: string): string {
  return PRIMARY(`\n${label}`);
}

function row(left: string, right: string): string {
  const pad = left.padEnd(28, " ");
  return `  ${pad}${right}`;
}

function table(
  rows: Array<{
    keyword: string;
    rank: string;
    intent?: number;
    difficulty?: number | null;
    prov: Provenance;
    note?: string;
  }>,
): string {
  const lines: string[] = [];
  lines.push(
    `  ${ACCENT("keyword".padEnd(24))} ${ACCENT("rank".padEnd(10))} ${ACCENT("diff".padEnd(6))} ${ACCENT("intent".padEnd(8))} ${ACCENT("provenance")}`,
  );
  for (const r of rows) {
    const intent = r.intent !== undefined ? r.intent.toFixed(2) : "—";
    const diff =
      r.difficulty !== undefined && r.difficulty !== null ? String(r.difficulty) : "—";
    lines.push(
      `  ${r.keyword.padEnd(24)} ${r.rank.padEnd(10)} ${diff.padEnd(6)} ${intent.padEnd(8)} ${provLabel(r.prov)}`,
    );
    if (r.note !== undefined && r.note.length > 0) {
      lines.push(MUTED(`    └─ ${r.note}`));
    }
  }
  return lines.join("\n");
}

const SOURCE_ICON: Record<ReadyToPasteSource, string> = {
  ai: "●",
  deterministic: "◐",
  "template-fallback": "◇",
};

function sourceLabel(s: ReadyToPasteSource): string {
  return `${SOURCE_ICON[s]} ${s}`;
}

function pushReadyToPasteField(
  lines: string[],
  label: string,
  field: ReadyToPasteField,
): void {
  const counter = `(${field.charCount}/${field.charLimit})`;
  if (field.recommended === null) {
    lines.push(row(label, `${MUTED("[NO CHANGE]")} ${MUTED(counter)}`));
    if (field.current.length > 0) {
      lines.push(MUTED(`    current     ${field.current}`));
    }
    return;
  }
  lines.push(row(label, `${field.recommended} ${MUTED(counter)}`));
  if (field.changeReason !== null) {
    lines.push(MUTED(`    why         ${field.changeReason}`));
  }
  if (field.current.length > 0) {
    lines.push(MUTED(`    current     ${field.current}`));
  }
}

function recommendations(items: DiagnosePaidResponse["recommendations"]): string {
  return items
    .map((r) => {
      const tag = `${r.impact}/${r.effort}`;
      return `  ${PRIMARY(`#${r.rank}`)} ${r.action}   ${MUTED(`(${tag})`)}\n    ${MUTED(r.rationale)}`;
    })
    .join("\n");
}

function receiptBlock(
  receipt: DiagnosePaidResponse["receipt"],
): string {
  const lines: string[] = [header("Receipt")];
  lines.push(row("network", receipt.network));
  lines.push(row("amount", `${receipt.amount} (${receipt.asset.slice(0, 10)}…)`));
  lines.push(row("transaction", receipt.transactionHash));
  lines.push(row("settledAt", receipt.settledAt));
  lines.push(row("facilitator", `${receipt.facilitatorMode} via ${receipt.facilitator}`));
  const explorer = getExplorerUrl(receipt.network, receipt.transactionHash);
  if (explorer !== null) {
    lines.push(row("explorer", ACCENT(explorer)));
  }
  return lines.join("\n");
}

function dataProvenanceBlock(
  prov: DiagnosePaidResponse["dataProvenance"],
): string {
  const lines: string[] = [header("Data provenance")];
  lines.push(row("appMetadata", provLabel(prov.appMetadata)));
  lines.push(row("keywordRank", provLabel(prov.keywordRank)));
  lines.push(row("competitors", provLabel(prov.competitors)));
  lines.push(row("recommendations", provLabel(prov.recommendations)));
  return lines.join("\n");
}

export function formatQuote(q: QuoteResponse): string {
  const lines: string[] = [];
  lines.push(PRIMARY(`Sniffy quote — sniffId ${q.sniffId}`));
  lines.push(MUTED(`requestId ${q.requestId}  ·  store ${q.store}  ·  country ${q.country}`));

  lines.push(header("Detected app"));
  lines.push(row("name", q.detectedApp.name));
  lines.push(row("developer", q.detectedApp.developer));
  lines.push(row("id", q.detectedApp.id));

  if (q.shallowScan !== undefined) {
    lines.push(header("Shallow scan (free preview)"));
    lines.push(row("title", q.shallowScan.title));
    if (q.shallowScan.subtitle !== undefined) {
      lines.push(row("subtitle", q.shallowScan.subtitle));
    }
    lines.push(row("category", q.shallowScan.primaryCategory));
    lines.push(
      row(
        "ratings",
        `${q.shallowScan.ratingsSummary.average.toFixed(1)}★ (${q.shallowScan.ratingsSummary.count.toLocaleString()})`,
      ),
    );
    const pk = q.shallowScan.previewKeyword;
    lines.push(
      row(
        "preview keyword",
        `${pk.keyword} → rank ${pk.rankBucket}   ${provLabel(pk.provenance)}  ${MUTED(`(${pk.confidence})`)}`,
      ),
    );
  }

  lines.push(header("Pricing"));
  lines.push(row("total", `${q.pricing.estimatedTotal} ${q.pricing.currency} on ${q.pricing.network}`));
  for (const b of q.pricing.breakdown) {
    lines.push(row(`  ${b.label}`, b.amount));
  }

  lines.push(MUTED(`\nNext: POST ${q.next.paidEndpoint}`));
  return lines.join("\n");
}

export function formatPaid(r: DiagnosePaidResponse): string {
  const lines: string[] = [];
  lines.push(PRIMARY(`Sniffy report — sniffId ${r.sniffId}`));
  lines.push(MUTED(`requestId ${r.requestId}  ·  version ${r.reportVersion ?? "—"}`));

  lines.push(header("Summary"));
  lines.push(`  ${r.summary}`);

  lines.push(dataProvenanceBlock(r.dataProvenance));

  lines.push(header("Keyword diagnosis"));
  lines.push(
    table(
      r.keywordDiagnosis.map((k) => ({
        keyword: k.keyword,
        rank: k.rankBucket,
        intent: k.intentScore,
        difficulty: k.difficultyIsFallback ? null : k.difficulty,
        prov: k.provenance,
        note: k.recommendation,
      })),
    ),
  );

  // Phase 6 — target-app momentum block (ratings-per-day + label).
  // Match `!= null` to handle both nullable and pre-schema-default fixtures.
  if (r.targetAppSignals != null && r.targetAppSignals.ratingsPerDay !== null) {
    lines.push(header("App momentum"));
    lines.push(
      row(
        "ratings/day",
        `${r.targetAppSignals.ratingsPerDay.toFixed(2)} (${r.targetAppSignals.momentumLabel ?? "—"})`,
      ),
    );
    if (r.targetAppSignals.daysSinceFirstRelease !== null) {
      lines.push(row("days live", String(r.targetAppSignals.daysSinceFirstRelease)));
    }
    if (r.targetAppSignals.daysSinceLastRelease !== null) {
      lines.push(
        row("days since update", String(r.targetAppSignals.daysSinceLastRelease)),
      );
    }
  }

  if (r.competitorTrail.length > 0) {
    lines.push(header("Competitor trail"));
    for (const c of r.competitorTrail) {
      lines.push(
        row(`${c.name} (${c.appId})`, `overlap: ${c.overlapKeywords.join(", ")}   ${provLabel(c.provenance)}`),
      );
      if (c.notes !== undefined && c.notes.length > 0) {
        lines.push(MUTED(`    └─ ${c.notes}`));
      }
    }
  }

  lines.push(header("Metadata score"));
  lines.push(row("overall", String(r.metadataScore.overall)));
  lines.push(row("title", `${r.metadataScore.title.score} — ${r.metadataScore.title.notes}`));
  lines.push(row("subtitle", `${r.metadataScore.subtitle.score} — ${r.metadataScore.subtitle.notes}`));
  lines.push(row("keywords", `${r.metadataScore.keywords.score} — ${r.metadataScore.keywords.notes}`));
  lines.push(row("screenshots", `${r.metadataScore.screenshots.score} — ${r.metadataScore.screenshots.notes}`));

  lines.push(header("Recommendations"));
  lines.push(recommendations(r.recommendations));

  if (r.readyToPaste !== undefined) {
    lines.push(header("Ready to paste"));
    lines.push(MUTED(`  source: ${sourceLabel(r.readyToPaste.source)}`));
    pushReadyToPasteField(lines, "title", r.readyToPaste.title);
    pushReadyToPasteField(lines, "subtitle", r.readyToPaste.subtitle);
    pushReadyToPasteField(lines, "keywords", r.readyToPaste.keywordsField);
    pushReadyToPasteField(lines, "short desc", r.readyToPaste.shortDescription);
  }

  lines.push(receiptBlock(r.receipt));
  return lines.join("\n");
}

export function formatSample(r: SampleResponse): string {
  const prefix = PRIMARY("Sniffy sample (fixture report — no payment required)") + "\n";
  return prefix + formatPaid(r);
}
