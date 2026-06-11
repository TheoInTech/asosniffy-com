import { AsyncLocalStorage } from "node:async_hooks";
import type { PremiumFeature } from "../payment/cogs.js";

// Per-request COGS ledger.
//
// Mirrors observability/audit.ts (same AsyncLocalStorage pattern Hono uses to
// thread context). Every LLM/vision call records its actual cost here without
// taking a ledger parameter; the audit middleware wraps each request in
// `withCogsLedger(...)` and emits one `cogs_ledger` line at the end so MARGIN
// (revenue − COGS) is observable per request in Railway logs — the data the
// business-model spreadsheet's margin alert never had a source for.
//
// This is the observability counterpart to payment/cogs.ts (which sets the
// PRICE and the projected budget). The ledger records what was ACTUALLY spent.

export type CogsSource = "live" | "cached";

export interface CogsEntry {
  feature: PremiumFeature;
  provider: string;
  model: string;
  costUsd: number; // 0 on a cache hit
  source: CogsSource;
  inputTokens?: number;
  outputTokens?: number;
  imageCount?: number;
}

export interface CogsLedger {
  requestId: string;
  route: string;
  entries: CogsEntry[];
  revenueCents?: number;
  budgetCents?: number;
}

const storage = new AsyncLocalStorage<CogsLedger>();

export function createCogsLedger(requestId: string, route: string): CogsLedger {
  return { requestId, route, entries: [] };
}

export async function withCogsLedger<T>(
  ledger: CogsLedger,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(ledger, fn);
}

export function getCurrentCogsLedger(): CogsLedger | undefined {
  return storage.getStore();
}

// Record one LLM/vision spend. No-ops outside a scope so call sites record
// unconditionally (mirrors recordInvocation in audit.ts).
export function recordCogs(entry: CogsEntry): void {
  const ledger = storage.getStore();
  if (!ledger) return;
  ledger.entries.push(entry);
}

// Convenience for the OpenAI call sites — they already compute a cost via
// computeOpenAiCost ({ inputTokens, outputTokens, costUsd }); this records it
// against the paid feature in one line next to the existing logOpenAiCost.
// A null costUsd (unknown model) records 0 — honest, and the cost log already
// surfaces the null for investigation.
export function recordOpenAiCogs(
  feature: PremiumFeature,
  model: string,
  cost: { inputTokens: number; outputTokens: number; costUsd: number | null },
): void {
  recordCogs({
    feature,
    provider: "openai",
    model,
    costUsd: cost.costUsd ?? 0,
    source: "live",
    inputTokens: cost.inputTokens,
    outputTokens: cost.outputTokens,
  });
}

// Revenue (the x402 amount the buyer paid) is known at the top of the route;
// the budget is the projected-COGS allocation. Both are stamped onto the
// ledger so the end-of-request summary can compute margin.
export function setRevenueCents(cents: number): void {
  const ledger = storage.getStore();
  if (ledger) ledger.revenueCents = cents;
}

export function setBudgetCents(cents: number): void {
  const ledger = storage.getStore();
  if (ledger) ledger.budgetCents = cents;
}

// Round a USD cost to whole cents (the billing unit). Sub-cent costs (e.g. a
// $0.004 synthesis call) round to the nearest cent; many cheap calls round to
// 0, which is honest — they cost a fraction of a cent.
function usdToCents(usd: number): number {
  return Math.round(usd * 100);
}

export interface CogsSummary {
  requestId: string;
  route: string;
  revenueCents: number | null;
  totalCogsCents: number;
  marginCents: number | null;
  marginPct: number | null;
  budgetCents: number | null;
  overBudget: boolean;
  byFeature: Partial<Record<PremiumFeature, number>>;
}

export function summarizeCogs(ledger: CogsLedger): CogsSummary {
  const byFeature: Partial<Record<PremiumFeature, number>> = {};
  let totalCogsCents = 0;
  for (const e of ledger.entries) {
    const cents = usdToCents(e.costUsd);
    totalCogsCents += cents;
    byFeature[e.feature] = (byFeature[e.feature] ?? 0) + cents;
  }
  const revenueCents = ledger.revenueCents ?? null;
  const marginCents = revenueCents === null ? null : revenueCents - totalCogsCents;
  const marginPct =
    revenueCents === null || revenueCents === 0
      ? revenueCents === 0
        ? 0
        : null
      : Math.round((marginCents! / revenueCents) * 100);
  const budgetCents = ledger.budgetCents ?? null;
  const overBudget = budgetCents !== null && totalCogsCents > budgetCents;
  return {
    requestId: ledger.requestId,
    route: ledger.route,
    revenueCents,
    totalCogsCents,
    marginCents,
    marginPct,
    budgetCents,
    overBudget,
    byFeature,
  };
}
