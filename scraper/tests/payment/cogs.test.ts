import { describe, expect, it } from "vitest";
import {
  PREMIUM_FEATURES,
  ALL_FEATURES,
  enabledFeaturesFrom,
  resolvePaidFeatures,
  projectedCogsCentsFor,
  featureLineItems,
  makeCogsGate,
  MARGIN_COGS_FRACTION,
  type PremiumFeature,
} from "../../src/payment/cogs.js";

const ALL_ON = new Set<PremiumFeature>(ALL_FEATURES);

describe("PREMIUM_FEATURES catalog", () => {
  it("every à-la-carte add-on price honors the COGS ≤ 30% margin floor", () => {
    // The structural guarantee: a feature sold as an add-on must price its
    // capped worst-case COGS at or under MARGIN_COGS_FRACTION of the line.
    for (const f of ALL_FEATURES) {
      const spec = PREMIUM_FEATURES[f];
      if (spec.addonPriceCents > 0) {
        expect(spec.projectedCogsCents).toBeLessThanOrEqual(
          MARGIN_COGS_FRACTION * spec.addonPriceCents + 1e-9,
        );
      }
    }
  });

  it("aiSynthesis is bundled-only (never an à-la-carte add-on)", () => {
    expect(PREMIUM_FEATURES.aiSynthesis.addonPriceCents).toBe(0);
    expect(PREMIUM_FEATURES.aiSynthesis.defaultTiers).toContain("standard");
    expect(PREMIUM_FEATURES.aiSynthesis.defaultTiers).toContain("expert");
    expect(PREMIUM_FEATURES.aiSynthesis.defaultTiers).not.toContain("quick");
  });
});

describe("resolvePaidFeatures (the single source of truth)", () => {
  it("quick bundles no premium features", () => {
    expect(resolvePaidFeatures("quick", undefined, ALL_ON).size).toBe(0);
  });

  it("standard bundles aiSynthesis + aiVisibility", () => {
    const r = resolvePaidFeatures("standard", undefined, ALL_ON);
    expect([...r].sort()).toEqual(["aiSynthesis", "aiVisibility"]);
  });

  it("expert bundles all four", () => {
    const r = resolvePaidFeatures("expert", undefined, ALL_ON);
    expect(r.size).toBe(4);
  });

  it("an add-on opts a cheaper tier into a premium feature", () => {
    const r = resolvePaidFeatures("quick", { creativeVision: true }, ALL_ON);
    expect(r.has("creativeVision")).toBe(true);
    expect(r.has("aiVisibility")).toBe(false);
  });

  it("intersects with the enabled set — a disabled feature is never resolved", () => {
    const enabled = new Set<PremiumFeature>(["aiSynthesis"]); // visibility off
    const r = resolvePaidFeatures("standard", { creativeVision: true }, enabled);
    expect([...r]).toEqual(["aiSynthesis"]); // visibility bundled but disabled; vision requested but disabled
  });
});

describe("projectedCogsCentsFor + the inversion guarantee", () => {
  // The price each tier charges for 1 keyword (base + 1¢), pre-discount.
  const priceCents = { quick: 5 + 1, standard: 20 + 1, expert: 100 + 1 };

  it("bundled COGS stays ≤ 30% of the tier price for every tier", () => {
    for (const tier of ["quick", "standard", "expert"] as const) {
      const cogs = projectedCogsCentsFor(
        resolvePaidFeatures(tier, undefined, ALL_ON),
      );
      expect(cogs).toBeLessThanOrEqual(MARGIN_COGS_FRACTION * priceCents[tier]);
    }
  });

  it("a standard caller adding vision is still covered (add-on funds its own COGS)", () => {
    const features = resolvePaidFeatures("standard", { creativeVision: true }, ALL_ON);
    const cogs = projectedCogsCentsFor(features);
    const price =
      20 + 1 + PREMIUM_FEATURES.creativeVision.addonPriceCents; // base + kw + vision line
    expect(cogs).toBeLessThanOrEqual(MARGIN_COGS_FRACTION * price);
  });
});

describe("featureLineItems", () => {
  it("emits a priced line ONLY for add-ons beyond the tier's bundle", () => {
    // standard already bundles aiVisibility → no line for it; vision is extra.
    const items = featureLineItems("standard", { aiVisibility: true, creativeVision: true }, ALL_ON);
    const labels = items.map((i) => i.label);
    expect(labels.some((l) => l.includes("visibility"))).toBe(false); // bundled, no line
    expect(labels.some((l) => l.includes("creative") || l.includes("vision"))).toBe(true);
    expect(items.every((i) => /^\d+\.\d{2}$/.test(i.amount))).toBe(true);
  });

  it("emits no line items when no add-ons beyond the bundle", () => {
    expect(featureLineItems("expert", undefined, ALL_ON)).toHaveLength(0);
  });
});

describe("enabledFeaturesFrom", () => {
  it("maps env flags to the enabled set; aiSynthesis is always enabled", () => {
    const enabled = enabledFeaturesFrom({
      llmProbeEnabled: false,
      localizationEnabled: true,
      visionEnabled: false,
    });
    expect(enabled.has("aiSynthesis")).toBe(true);
    expect(enabled.has("aiVisibility")).toBe(false);
    expect(enabled.has("localizationCopy")).toBe(true);
    expect(enabled.has("creativeVision")).toBe(false);
  });
});

describe("makeCogsGate", () => {
  it("denies a feature the price did not pay for (belt)", () => {
    const gate = makeCogsGate({
      paidFeatures: new Set<PremiumFeature>(["aiSynthesis"]),
      budgetCents: 100,
    });
    expect(gate.allow("aiVisibility")).toBe(false);
    expect(gate.allow("aiSynthesis")).toBe(true);
  });

  it("denies once the running reservation would exceed the budget (overrun brake)", () => {
    const gate = makeCogsGate({
      paidFeatures: new Set<PremiumFeature>(["aiSynthesis", "creativeVision"]),
      budgetCents: PREMIUM_FEATURES.aiSynthesis.projectedCogsCents, // only room for one
    });
    expect(gate.allow("aiSynthesis")).toBe(true); // reserves its projection
    expect(gate.allow("creativeVision")).toBe(false); // no headroom left
  });
});
