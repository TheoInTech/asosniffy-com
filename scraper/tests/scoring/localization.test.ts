import { describe, expect, it } from "vitest";
import { scoreLocalization } from "../../src/scoring/localization.js";
import type { AppRecord, AppleProviderError } from "../../src/providers/apple/types.js";

function makeRecord(overrides: Partial<AppRecord>): AppRecord {
  return {
    id: "570060128",
    name: "Sample App",
    developer: "Sample Studio",
    primaryCategory: "Productivity",
    description: "",
    ratingsSummary: { average: 4.5, count: 1000 },
    screenshots: [],
    currentVersion: "1.0",
    provenance: "live",
    ...overrides,
  };
}

const EN_DESC =
  "This is the official habit tracking app that helps you build daily routines with streaks reminders and beautiful charts.";
const JP_DESC =
  "これは習慣追跡アプリです。毎日のルーチンを構築し、ストリークを維持し、美しいチャートで進捗を確認できます。";
const DE_DESC =
  "Dies ist die offizielle Gewohnheits-Tracker-App, mit der du tägliche Routinen aufbauen kannst.";
const PT_DESC =
  "Este é o aplicativo oficial de rastreamento de hábitos que ajuda você a construir rotinas diárias com sequências, lembretes e gráficos.";
const KO_DESC =
  "이것은 매일 습관을 추적하고 일상 루틴을 구축하고 스트릭을 유지할 수 있는 공식 습관 추적 앱입니다 차트도 있습니다.";

describe("scoreLocalization", () => {
  it("flags all-English app as having gaps in non-English storefronts", () => {
    const map = new Map<string, AppRecord | AppleProviderError>([
      ["US", makeRecord({ name: "Pawprint Habits", description: EN_DESC })],
      ["GB", makeRecord({ name: "Pawprint Habits", description: EN_DESC })],
      ["JP", makeRecord({ name: "Pawprint Habits", description: EN_DESC })],
      ["DE", makeRecord({ name: "Pawprint Habits", description: EN_DESC })],
    ]);
    const result = scoreLocalization({ storefronts: map });
    const us = result.storefronts.find((s) => s.country === "US")!;
    const jp = result.storefronts.find((s) => s.country === "JP")!;
    const de = result.storefronts.find((s) => s.country === "DE")!;

    expect(us.localized).toBe(true);
    expect(jp.localized).toBe(false);
    expect(de.localized).toBe(false);
    expect(result.unlocalizedCount).toBe(2);
    // 2 localized + 2 mismatch → mean gap score 50.
    expect(result.overallGapScore).toBe(50);
  });

  it("correctly identifies a fully-localized app", () => {
    const map = new Map<string, AppRecord | AppleProviderError>([
      ["US", makeRecord({ name: "Pawprint Habits", description: EN_DESC })],
      ["JP", makeRecord({ name: "Pawprint Habits", description: JP_DESC })],
      ["DE", makeRecord({ name: "Pawprint Habits", description: DE_DESC })],
      ["BR", makeRecord({ name: "Pawprint Habits", description: PT_DESC })],
      ["KR", makeRecord({ name: "Pawprint Habits", description: KO_DESC })],
    ]);
    const result = scoreLocalization({ storefronts: map });
    expect(result.unlocalizedCount).toBe(0);
    expect(result.overallGapScore).toBe(100);
  });

  it("returns null detection + neutral gapScore on short descriptions", () => {
    const map = new Map<string, AppRecord | AppleProviderError>([
      ["US", makeRecord({ description: "x" })],
    ]);
    const result = scoreLocalization({ storefronts: map });
    const us = result.storefronts[0]!;
    expect(us.descriptionLanguage).toBeNull();
    expect(us.localized).toBeNull();
    expect(us.gapScore).toBe(50);
    // No storefront with successful detection → overallGapScore null.
    expect(result.overallGapScore).toBeNull();
  });

  it("isolates per-storefront provider errors", () => {
    const map = new Map<string, AppRecord | AppleProviderError>([
      ["US", makeRecord({ description: EN_DESC })],
      ["JP", { error: "rate_limited" }],
    ]);
    const result = scoreLocalization({ storefronts: map });
    const jp = result.storefronts.find((s) => s.country === "JP")!;
    expect(jp.error).toBe("rate_limited");
    expect(jp.localized).toBeNull();
    // Errored storefronts skipped in the overall score.
    expect(result.overallGapScore).toBe(100);
  });

  it("collects distinct titleVariants", () => {
    const map = new Map<string, AppRecord | AppleProviderError>([
      ["US", makeRecord({ name: "Pawprint Habits", description: EN_DESC })],
      ["JP", makeRecord({ name: "Pawprint Habits", description: JP_DESC })],
      ["DE", makeRecord({ name: "Pawprint Gewohnheiten", description: DE_DESC })],
    ]);
    const result = scoreLocalization({ storefronts: map });
    expect(result.titleVariants).toHaveLength(2);
    expect(result.titleVariants).toContain("Pawprint Habits");
    expect(result.titleVariants).toContain("Pawprint Gewohnheiten");
  });

  it("uses sensible defaults for unknown storefronts", () => {
    const map = new Map<string, AppRecord | AppleProviderError>([
      ["ZZ", makeRecord({ description: EN_DESC })],
    ]);
    const result = scoreLocalization({ storefronts: map });
    // Unknown country defaults to expected English; gap is 100 when match.
    expect(result.storefronts[0]!.expectedLanguages).toEqual(["eng"]);
    expect(result.storefronts[0]!.localized).toBe(true);
  });
});
