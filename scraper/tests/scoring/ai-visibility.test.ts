import { describe, expect, it } from "vitest";
import {
  aggregateAiVisibility,
  PROBE_PROMPT_TEMPLATES,
  PROMPT_SET_VERSION,
  renderProbePrompt,
  type LlmProbeRawRow,
} from "../../src/scoring/ai-visibility.js";

const MODEL = "gpt-5.4-mini";

function row(
  templateIdx: number,
  intent: string,
  replicate: number,
  mentionedTarget: boolean,
  mentionedCompetitors: string[] = [],
  model = MODEL,
): LlmProbeRawRow {
  return { templateIdx, intent, replicate, model, mentionedTarget, mentionedCompetitors };
}

// Synthetic-but-hand-computed 20-row run: 1 intent x 10 templates x 2
// replicates, single model. Target mentioned 13/20 (targetSov 0.65 — inside
// the V5 mid-SOV band). Competitor "HabitKit" 16/20 (0.8), "Productive"
// 4/20 (0.2). Templates 6, 8, 9 never mention the target (deterministic
// misses); template 5 mentions it in 1 of 2 replicates (0.5).
const INTENT = "habit tracker";
const TARGET_PLAN: ReadonlyArray<readonly [boolean, boolean]> = [
  [true, true], // t0
  [true, true], // t1
  [true, true], // t2
  [true, true], // t3
  [true, true], // t4
  [true, false], // t5
  [false, false], // t6 — deterministic miss
  [true, true], // t7
  [false, false], // t8 — deterministic miss
  [false, false], // t9 — deterministic miss
];

function handComputedRows(): LlmProbeRawRow[] {
  const rows: LlmProbeRawRow[] = [];
  for (let t = 0; t < 10; t++) {
    for (let r = 0; r < 2; r++) {
      const competitors: string[] = [];
      // HabitKit in every row except templates 6 and 9 (4 rows out) -> 16/20.
      if (t !== 6 && t !== 9) competitors.push("HabitKit");
      // Productive only in templates 0 and 1 (both replicates) -> 4/20.
      if (t === 0 || t === 1) competitors.push("Productive");
      rows.push(row(t, INTENT, r, TARGET_PLAN[t]![r]!, competitors));
    }
  }
  return rows;
}

const OPTS = {
  targetName: "Streaks",
  competitors: ["HabitKit", "Productive"] as readonly string[],
  replicates: 2,
};

describe("prompt set v5-10", () => {
  it("ships exactly the 10 pilot templates", () => {
    expect(PROBE_PROMPT_TEMPLATES).toHaveLength(10);
    expect(PROMPT_SET_VERSION).toBe("v5-10");
  });

  it("renders the pilot template text verbatim with the intent filled", () => {
    expect(renderProbePrompt(0, "habit tracker", "ios")).toBe(
      "What's the best iPhone app for habit tracker? Answer in 2-3 sentences.",
    );
    expect(renderProbePrompt(6, "habit tracker", "ios")).toBe(
      "Best free app for habit tracker in 2026? Answer briefly.",
    );
    expect(renderProbePrompt(9, "habit tracker", "ios")).toBe(
      "Which habit tracker app has the best reputation among users? Answer in 2-3 sentences.",
    );
  });

  it("swaps the device word for android (template 1 only)", () => {
    expect(renderProbePrompt(0, "habit tracker", "android")).toBe(
      "What's the best Android app for habit tracker? Answer in 2-3 sentences.",
    );
    // The other templates are device-neutral and identical across stores.
    expect(renderProbePrompt(2, "habit tracker", "android")).toBe(
      renderProbePrompt(2, "habit tracker", "ios"),
    );
  });
});

describe("aggregateAiVisibility — SOV math (hand-computed)", () => {
  it("computes targetSov, per-app mention rates and ranking", () => {
    const out = aggregateAiVisibility(handComputedRows(), OPTS);
    expect(out).not.toBeNull();
    expect(out!.targetSov).toBeCloseTo(0.65, 6);
    expect(out!.totalCalls).toBe(20);
    expect(out!.failedCalls).toBe(0);
    expect(out!.promptSetVersion).toBe("v5-10");
    expect(out!.provenance).toBe("live");
    expect(out!.modelsUsed).toEqual([MODEL]);

    // Ranked descending by mentionRate: HabitKit 0.8 > Streaks 0.65 > Productive 0.2.
    expect(out!.shareOfVoice.map((s) => s.name)).toEqual([
      "HabitKit",
      "Streaks",
      "Productive",
    ]);
    expect(out!.shareOfVoice.map((s) => s.mentionRate)).toEqual([0.8, 0.65, 0.2]);
    expect(out!.shareOfVoice.map((s) => s.mentions)).toEqual([16, 13, 4]);
    expect(out!.shareOfVoice.map((s) => s.isTarget)).toEqual([false, true, false]);
  });

  it("breaks rate ties with the target first, then name ascending", () => {
    const rows: LlmProbeRawRow[] = [];
    for (let t = 0; t < 10; t++) {
      // Everyone mentioned in every answer -> all rates 1.0.
      rows.push(row(t, INTENT, 0, true, ["Zebra", "Alpha"]));
    }
    const out = aggregateAiVisibility(rows, {
      targetName: "Mid",
      competitors: ["Zebra", "Alpha"],
      replicates: 1,
    });
    expect(out!.shareOfVoice.map((s) => s.name)).toEqual(["Mid", "Alpha", "Zebra"]);
  });

  it("dedupes competitors case-insensitively and never lists the target twice", () => {
    const rows = handComputedRows();
    const out = aggregateAiVisibility(rows, {
      targetName: "Streaks",
      competitors: ["HabitKit", "habitkit", "Streaks", "", "Productive"],
      replicates: 2,
    });
    expect(out!.shareOfVoice).toHaveLength(3); // Streaks + HabitKit + Productive
  });
});

describe("aggregateAiVisibility — sovBand (V5 pilot calibration)", () => {
  function rowsWithSov(mentions: number, total = 20): LlmProbeRawRow[] {
    const rows: LlmProbeRawRow[] = [];
    for (let i = 0; i < total; i++) {
      rows.push(row(i % 10, INTENT, Math.floor(i / 10), i < mentions));
    }
    return rows;
  }

  it("uses ±11.4pp/√replicates inside mid-SOV (0.2..0.8)", () => {
    const out = aggregateAiVisibility(rowsWithSov(13), OPTS); // 0.65, replicates 2
    expect(out!.sovBand.plusMinusPp).toBeCloseTo(8.1, 6); // 11.4/√2 = 8.061 → 8.1
    expect(out!.sovBand.basis).toBe("v5-pilot-2026-06");
  });

  it("uses ±5pp/√replicates outside mid-SOV", () => {
    const high = aggregateAiVisibility(rowsWithSov(17), OPTS); // 0.85
    expect(high!.sovBand.plusMinusPp).toBeCloseTo(3.5, 6); // 5/√2 = 3.536 → 3.5
    const low = aggregateAiVisibility(rowsWithSov(2), OPTS); // 0.1
    expect(low!.sovBand.plusMinusPp).toBeCloseTo(3.5, 6);
  });

  it("treats the 0.2 and 0.8 boundaries as mid-SOV (inclusive)", () => {
    const atLow = aggregateAiVisibility(rowsWithSov(4), OPTS); // exactly 0.2
    expect(atLow!.sovBand.plusMinusPp).toBeCloseTo(8.1, 6);
    const atHigh = aggregateAiVisibility(rowsWithSov(16), OPTS); // exactly 0.8
    expect(atHigh!.sovBand.plusMinusPp).toBeCloseTo(8.1, 6);
  });

  it("scales with √replicates (single replicate = the raw pilot SD)", () => {
    const single = aggregateAiVisibility(rowsWithSov(13), { ...OPTS, replicates: 1 });
    expect(single!.sovBand.plusMinusPp).toBeCloseTo(11.4, 6);
    const quad = aggregateAiVisibility(rowsWithSov(13), { ...OPTS, replicates: 4 });
    expect(quad!.sovBand.plusMinusPp).toBeCloseTo(5.7, 6); // 11.4/2
  });
});

describe("aggregateAiVisibility — prompt table and deterministic misses", () => {
  it("reports per-(template,intent) mention rates with the rendered prompt", () => {
    const out = aggregateAiVisibility(handComputedRows(), OPTS);
    expect(out!.promptTable).toHaveLength(10);
    const rates = out!.promptTable.map((p) => p.mentionRate);
    expect(rates).toEqual([1, 1, 1, 1, 1, 0.5, 0, 1, 0, 0]);
    expect(out!.promptTable[0]!.prompt).toBe(
      "What's the best iPhone app for habit tracker? Answer in 2-3 sentences.",
    );
    expect(out!.promptTable[6]!.prompt).toBe(
      "Best free app for habit tracker in 2026? Answer briefly.",
    );
  });

  it("flags template+intent combos the target never appeared in", () => {
    const out = aggregateAiVisibility(handComputedRows(), OPTS);
    expect(out!.deterministicMisses.map((m) => m.templateIdx)).toEqual([6, 8, 9]);
    expect(out!.deterministicMisses[0]!.intent).toBe(INTENT);
    expect(out!.deterministicMisses[0]!.prompt).toBe(
      "Best free app for habit tracker in 2026? Answer briefly.",
    );
  });

  it("does not call a single-observation group a deterministic miss", () => {
    // One extra intent with a single surviving row (its replicate failed):
    // n=1 with no mention is a sample, not a deterministic finding.
    const rows = [...handComputedRows(), row(0, "mood tracker", 0, false)];
    const out = aggregateAiVisibility(rows, { ...OPTS, failedCalls: 1 });
    expect(
      out!.deterministicMisses.some((m) => m.intent === "mood tracker"),
    ).toBe(false);
    // ...but it still shows up in the prompt table with its observed rate.
    expect(
      out!.promptTable.some((p) => p.intent === "mood tracker" && p.mentionRate === 0),
    ).toBe(true);
  });

  it("groups the prompt table by intent as well as template", () => {
    const rows = [
      ...handComputedRows(),
      ...handComputedRows().map((r) => ({ ...r, intent: "streak counter" })),
    ];
    const out = aggregateAiVisibility(rows, OPTS);
    expect(out!.promptTable).toHaveLength(20);
    expect(out!.totalCalls).toBe(40);
  });
});

describe("aggregateAiVisibility — honesty gates", () => {
  it("returns null when fewer than 10 rows survive", () => {
    const rows = handComputedRows().slice(0, 9);
    expect(aggregateAiVisibility(rows, OPTS)).toBeNull();
  });

  it("returns null on an empty target name (cannot attribute mentions)", () => {
    expect(
      aggregateAiVisibility(handComputedRows(), { ...OPTS, targetName: "  " }),
    ).toBeNull();
  });

  it("passes failedCalls through for transparency (default 0)", () => {
    const out = aggregateAiVisibility(handComputedRows(), { ...OPTS, failedCalls: 4 });
    expect(out!.failedCalls).toBe(4);
    expect(out!.totalCalls).toBe(20); // successful, aggregated calls only
  });

  it("reports the deduped, sorted model set", () => {
    const rows = handComputedRows().map((r, i) =>
      i % 2 === 0 ? r : { ...r, model: "a-future-model" },
    );
    const out = aggregateAiVisibility(rows, OPTS);
    expect(out!.modelsUsed).toEqual(["a-future-model", MODEL]);
  });
});
