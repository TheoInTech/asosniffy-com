import { describe, expect, it } from "vitest";
import {
  createCogsLedger,
  withCogsLedger,
  getCurrentCogsLedger,
  recordCogs,
  setRevenueCents,
  setBudgetCents,
  summarizeCogs,
} from "../../src/observability/cogs-ledger.js";

describe("cogs ledger (AsyncLocalStorage)", () => {
  it("recordCogs no-ops outside a ledger scope", () => {
    expect(() =>
      recordCogs({ feature: "aiSynthesis", provider: "openai", model: "m", costUsd: 0.004, source: "live" }),
    ).not.toThrow();
    expect(getCurrentCogsLedger()).toBeUndefined();
  });

  it("accumulates entries inside the scope and exposes them on the ledger", async () => {
    const ledger = createCogsLedger("req_1", "POST /api/v1/aso/diagnose");
    await withCogsLedger(ledger, async () => {
      recordCogs({ feature: "aiSynthesis", provider: "openai", model: "m", costUsd: 0.004, source: "live" });
      recordCogs({ feature: "aiVisibility", provider: "openai-probe", model: "m", costUsd: 0.0066, source: "live" });
      expect(getCurrentCogsLedger()).toBe(ledger);
    });
    expect(ledger.entries).toHaveLength(2);
    expect(getCurrentCogsLedger()).toBeUndefined();
  });

  it("cached entries record costUsd 0 (or are summed as 0 cents)", async () => {
    const ledger = createCogsLedger("req_c", "x");
    await withCogsLedger(ledger, async () => {
      recordCogs({ feature: "aiVisibility", provider: "p", model: "m", costUsd: 0, source: "cached" });
    });
    expect(summarizeCogs(ledger).totalCogsCents).toBe(0);
  });

  it("summarizeCogs computes cents, margin, byFeature, and overBudget", async () => {
    const ledger = createCogsLedger("req_2", "POST /api/v1/aso/diagnose");
    await withCogsLedger(ledger, async () => {
      setRevenueCents(20);
      setBudgetCents(5);
      // $0.004 → 0.4¢ rounds to 0; use values that round to whole cents.
      recordCogs({ feature: "aiSynthesis", provider: "openai", model: "m", costUsd: 0.01, source: "live" });
      recordCogs({ feature: "aiVisibility", provider: "openai-probe", model: "m", costUsd: 0.02, source: "live" });
    });
    const s = summarizeCogs(ledger);
    expect(s.revenueCents).toBe(20);
    expect(s.totalCogsCents).toBe(3); // 1¢ + 2¢
    expect(s.marginCents).toBe(17);
    expect(s.marginPct).toBe(85);
    expect(s.budgetCents).toBe(5);
    expect(s.overBudget).toBe(false);
    expect(s.byFeature).toEqual({ aiSynthesis: 1, aiVisibility: 2 });
  });

  it("flags overBudget when actual COGS exceeds the reserved budget", async () => {
    const ledger = createCogsLedger("req_3", "x");
    await withCogsLedger(ledger, async () => {
      setRevenueCents(20);
      setBudgetCents(2);
      recordCogs({ feature: "creativeVision", provider: "vision", model: "m", costUsd: 0.07, source: "live" });
    });
    const s = summarizeCogs(ledger);
    expect(s.totalCogsCents).toBe(7);
    expect(s.overBudget).toBe(true);
  });

  it("marginPct is null when revenue is unknown", () => {
    const ledger = createCogsLedger("req_4", "x");
    expect(summarizeCogs(ledger).marginPct).toBeNull();
  });
});
