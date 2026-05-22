import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clampReportToContract } from "../../src/lib/clamp-report.js";
import { DiagnosePaidResponse } from "../../src/schemas/diagnose.js";

// The sanitizer is the safety net at scraper/src/routes/diagnose.ts that
// clamps response numeric fields back into schema range AFTER x402 settlement,
// so a paying user on Morph mainnet never sees a 400 from upstream scoring
// drift. These tests exercise it directly so the producer fix and the
// boundary defense are independently verifiable.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(
  __dirname,
  "../../fixtures/sample-report.json",
);

function loadFixture(): DiagnosePaidResponse {
  const raw = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  return DiagnosePaidResponse.parse(raw);
}

interface CapturedLog {
  path: string;
  original: number;
  clamped: number;
}

function captureLogs(): {
  log: (e: { path: string; original: number; clamped: number }) => void;
  events: CapturedLog[];
} {
  const events: CapturedLog[] = [];
  return {
    log: (e) =>
      events.push({ path: e.path, original: e.original, clamped: e.clamped }),
    events,
  };
}

describe("clampReportToContract", () => {
  it("is a no-op on a schema-valid report (no clamps, no logs)", () => {
    const report = loadFixture();
    const { log, events } = captureLogs();
    const out = clampReportToContract(report, {
      requestId: "req_test",
      log,
    });
    expect(events).toEqual([]);
    expect(DiagnosePaidResponse.parse(out)).toBeTruthy();
    expect(out.keywordDiagnosis).toEqual(report.keywordDiagnosis);
    expect(out.metadataScore).toEqual(report.metadataScore);
  });

  it("clamps minDifficulty: 0 up to 1 (the production bug)", () => {
    const report = loadFixture();
    // Forcibly poison the fixture to simulate a producer drift.
    const poisoned: DiagnosePaidResponse = {
      ...report,
      keywordDiagnosis: report.keywordDiagnosis.map((row, i) =>
        i === 0 ? { ...row, minDifficulty: 0 } : row,
      ),
    };
    const { log, events } = captureLogs();
    const out = clampReportToContract(poisoned, {
      requestId: "req_test",
      log,
    });
    expect(out.keywordDiagnosis[0]!.minDifficulty).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0]!.path).toBe("keywordDiagnosis.0.minDifficulty");
    expect(events[0]!.original).toBe(0);
    expect(events[0]!.clamped).toBe(1);
    // The clamped report must now parse cleanly through the strict schema.
    expect(() => DiagnosePaidResponse.parse(out)).not.toThrow();
  });

  it("clamps difficulty: 0 up to 1 and difficulty: 150 down to 100", () => {
    const report = loadFixture();
    const poisoned: DiagnosePaidResponse = {
      ...report,
      keywordDiagnosis: [
        { ...report.keywordDiagnosis[0]!, difficulty: 0 },
        { ...report.keywordDiagnosis[1]!, difficulty: 150 },
      ],
    };
    const { log, events } = captureLogs();
    const out = clampReportToContract(poisoned, {
      requestId: "req_test",
      log,
    });
    expect(out.keywordDiagnosis[0]!.difficulty).toBe(1);
    expect(out.keywordDiagnosis[1]!.difficulty).toBe(100);
    expect(events.map((e) => e.path).sort()).toEqual([
      "keywordDiagnosis.0.difficulty",
      "keywordDiagnosis.1.difficulty",
    ]);
  });

  it("preserves null for nullable fields (difficulty: null, minDifficulty: null)", () => {
    const report = loadFixture();
    const withNulls: DiagnosePaidResponse = {
      ...report,
      keywordDiagnosis: report.keywordDiagnosis.map((row) => ({
        ...row,
        difficulty: null,
        minDifficulty: null,
        difficultyIsFallback: true,
      })),
    };
    const { log, events } = captureLogs();
    const out = clampReportToContract(withNulls, {
      requestId: "req_test",
      log,
    });
    for (const row of out.keywordDiagnosis) {
      expect(row.difficulty).toBeNull();
      expect(row.minDifficulty).toBeNull();
    }
    expect(events).toEqual([]);
  });

  it("clamps intentScore: 1.5 down to 1 and intentScore: -0.1 up to 0", () => {
    const report = loadFixture();
    const poisoned: DiagnosePaidResponse = {
      ...report,
      keywordDiagnosis: [
        { ...report.keywordDiagnosis[0]!, intentScore: 1.5 },
        { ...report.keywordDiagnosis[1]!, intentScore: -0.1 },
      ],
    };
    const { log, events } = captureLogs();
    const out = clampReportToContract(poisoned, {
      requestId: "req_test",
      log,
    });
    expect(out.keywordDiagnosis[0]!.intentScore).toBe(1);
    expect(out.keywordDiagnosis[1]!.intentScore).toBe(0);
    expect(events).toHaveLength(2);
  });

  it("clamps metadataScore subscore drift (e.g., subtitle.score: 110 → 100)", () => {
    const report = loadFixture();
    const poisoned: DiagnosePaidResponse = {
      ...report,
      metadataScore: {
        ...report.metadataScore,
        subtitle: { ...report.metadataScore.subtitle, score: 110 },
      },
    };
    const { log, events } = captureLogs();
    const out = clampReportToContract(poisoned, {
      requestId: "req_test",
      log,
    });
    expect(out.metadataScore.subtitle.score).toBe(100);
    expect(events).toHaveLength(1);
    expect(events[0]!.path).toBe("metadataScore.subtitle.score");
  });

  it("handles non-finite values defensively (NaN → range.min)", () => {
    const report = loadFixture();
    const poisoned: DiagnosePaidResponse = {
      ...report,
      keywordDiagnosis: [
        { ...report.keywordDiagnosis[0]!, minDifficulty: Number.NaN },
      ],
    };
    const { log, events } = captureLogs();
    const out = clampReportToContract(poisoned, {
      requestId: "req_test",
      log,
    });
    // minDifficulty range floor is 1.
    expect(out.keywordDiagnosis[0]!.minDifficulty).toBe(1);
    expect(events).toHaveLength(1);
    expect(Number.isNaN(events[0]!.original)).toBe(true);
    expect(events[0]!.clamped).toBe(1);
  });

  it("emits an ISO timestamp + requestId + 'report_field_clamped' event on every clamp", () => {
    const report = loadFixture();
    const poisoned: DiagnosePaidResponse = {
      ...report,
      keywordDiagnosis: [
        { ...report.keywordDiagnosis[0]!, minDifficulty: 0 },
      ],
    };
    let captured: {
      ts: string;
      level: string;
      event: string;
      requestId: string;
    } | null = null;
    clampReportToContract(poisoned, {
      requestId: "req_obs_123",
      log: (e) => {
        captured = e as never;
      },
    });
    expect(captured).not.toBeNull();
    const c = captured!;
    expect(c.level).toBe("warn");
    expect(c.event).toBe("report_field_clamped");
    expect(c.requestId).toBe("req_obs_123");
    expect(c.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
