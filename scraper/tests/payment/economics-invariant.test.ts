import { describe, expect, it } from "vitest";
import { computePricing } from "../../src/payment/pricing.js";
import {
  ALL_FEATURES,
  MARGIN_COGS_FRACTION,
  enabledFeaturesFrom,
  projectedCogsCentsFor,
  resolvePaidFeatures,
  type PremiumFeature,
} from "../../src/payment/cogs.js";
import type { Addons, DiagnoseTier } from "../../src/schemas/index.js";

// The crown-jewel guarantee: for EVERY (tier × add-on combination), the
// projected worst-case COGS never exceeds 30% of the price the buyer pays.
// This is the structural fix for the inversion the user hit ($0.18 COGS on a
// $0.04 call) — if this test ever fails, a pricing change has reopened the
// hole. x402 is pay-first, so this must hold at quote/402 time, before the
// report runs.

const TIERS: DiagnoseTier[] = ["quick", "standard", "expert"];

// All 8 subsets of the three à-la-carte add-ons.
function addonCombos(): (Addons | undefined)[] {
  const keys: (keyof Addons)[] = ["aiVisibility", "creativeVision", "localizationCopy"];
  const combos: (Addons | undefined)[] = [undefined];
  for (let mask = 0; mask < 8; mask++) {
    const a: Addons = {};
    keys.forEach((k, i) => {
      if (mask & (1 << i)) a[k] = true;
    });
    combos.push(a);
  }
  return combos;
}

function priceCents(estimatedTotal: string): number {
  const [d, f = ""] = estimatedTotal.split(".");
  return Number(d) * 100 + Number((f + "00").slice(0, 2));
}

describe("cost-aware pricing invariant — COGS ≤ 30% of price, always", () => {
  // Everything enabled so add-ons actually resolve and get priced.
  const enabled = enabledFeaturesFrom({
    llmProbeEnabled: true,
    localizationEnabled: true,
    visionEnabled: true,
  });

  for (const tier of TIERS) {
    for (const addons of addonCombos()) {
      const label = `${tier} + ${addons ? JSON.stringify(addons) : "no add-ons"}`;
      it(`holds for ${label} (1 keyword)`, () => {
        const pricing = computePricing({
          keywords: ["habit tracker"],
          countries: ["US"],
          tier,
          ...(addons ? { addons } : {}),
          enabledFeatures: enabled,
        });
        const paid = resolvePaidFeatures(tier, addons, enabled);
        const cogs = projectedCogsCentsFor(paid);
        const price = priceCents(pricing.estimatedTotal);
        expect(cogs).toBeLessThanOrEqual(MARGIN_COGS_FRACTION * price + 1e-9);
        // And revenue strictly exceeds COGS (positive margin) on every combo.
        expect(price).toBeGreaterThan(cogs);
      });
    }
  }

  it("a disabled feature is never priced and never resolved (price == run)", () => {
    const onlySynthesis = new Set<PremiumFeature>(["aiSynthesis"]); // everything else off
    const pricing = computePricing({
      keywords: ["k"],
      countries: ["US"],
      tier: "quick",
      addons: { creativeVision: true, aiVisibility: true },
      enabledFeatures: onlySynthesis,
    });
    // No premium line items appear for disabled features.
    expect(pricing.breakdown.some((b) => /vision|visibility|localized/.test(b.label))).toBe(false);
    expect(resolvePaidFeatures("quick", { creativeVision: true }, onlySynthesis).size).toBe(0);
  });

  it("the worst case (expert + every add-on, all enabled) still clears 30%", () => {
    const allAddons: Addons = { aiVisibility: true, creativeVision: true, localizationCopy: true };
    const pricing = computePricing({
      keywords: ["a", "b", "c", "d", "e"],
      countries: ["US"],
      tier: "expert",
      addons: allAddons,
      enabledFeatures: enabled,
    });
    const cogs = projectedCogsCentsFor(resolvePaidFeatures("expert", allAddons, enabled));
    // expert bundles all four already → add-ons resolve to no EXTRA features.
    expect(projectedCogsCentsFor(new Set(ALL_FEATURES))).toBe(cogs);
    expect(cogs).toBeLessThanOrEqual(MARGIN_COGS_FRACTION * priceCents(pricing.estimatedTotal));
  });
});
