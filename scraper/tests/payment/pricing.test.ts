import { describe, expect, it } from "vitest";

import {
  buildSavingsNote,
  computePricing,
  getSniffPack,
  listSniffPackQuotes,
  quoteSniffPack,
  SNIFF_PACK_TIERS,
  TYPICAL_ASO_PRO_ANNUAL_USD,
  TYPICAL_ASO_PRO_MONTHLY_USD,
  TYPICAL_ASO_START_ANNUAL_USD,
  TYPICAL_ASO_START_MONTHLY_USD,
} from "../../src/payment/pricing.js";
import { Pricing, SavingsNote } from "../../src/schemas/index.js";

describe("computePricing", () => {
  it("matches the §2.1 typical-demo example (base + 2 keywords = $0.05)", () => {
    const pricing = computePricing({ keywords: ["habit tracker", "daily planner"] });
    expect(Pricing.safeParse(pricing).success).toBe(true);
    expect(pricing.currency).toBe("USDC");
    expect(pricing.network).toBe("morph-hoodi");
    expect(pricing.estimatedTotal).toBe("0.05");
    expect(pricing.breakdown).toEqual([
      { label: "base diagnosis", amount: "0.03" },
      { label: "2 keywords", amount: "0.02" },
    ]);
  });

  it("returns just the base when keywords array is empty", () => {
    const pricing = computePricing({ keywords: [] });
    expect(pricing.estimatedTotal).toBe("0.03");
    expect(pricing.breakdown).toEqual([{ label: "base diagnosis", amount: "0.03" }]);
  });

  it("charges $0.01 per additional country beyond the first", () => {
    const pricing = computePricing({
      keywords: ["a"],
      countries: ["US", "GB", "DE"],
    });
    // base 0.03 + 1 keyword 0.01 + 2 additional countries 0.02 = 0.06
    expect(pricing.estimatedTotal).toBe("0.06");
    const labels = pricing.breakdown.map((b) => b.label);
    expect(labels).toContain("2 additional countries");
  });

  it("does NOT charge when only the single default country is present", () => {
    const pricing = computePricing({ keywords: ["a"], countries: ["US"] });
    expect(pricing.estimatedTotal).toBe("0.04");
    expect(pricing.breakdown.map((b) => b.label)).not.toContain(
      "0 additional countries",
    );
  });

  it("adds $0.02 for competitor trail (shallow)", () => {
    const pricing = computePricing({
      keywords: ["a", "b"],
      competitorDepth: "shallow",
    });
    // 0.03 + 0.02 + 0.02 = 0.07
    expect(pricing.estimatedTotal).toBe("0.07");
    expect(
      pricing.breakdown.find((b) => b.label === "competitor trail (shallow)"),
    ).toEqual({ label: "competitor trail (shallow)", amount: "0.02" });
  });

  it("adds $0.05 for competitor trail (deep)", () => {
    const pricing = computePricing({
      keywords: ["a", "b"],
      competitorDepth: "deep",
    });
    // 0.03 + 0.02 + 0.05 = 0.10
    expect(pricing.estimatedTotal).toBe("0.10");
    expect(
      pricing.breakdown.find((b) => b.label === "competitor trail (deep)"),
    ).toEqual({ label: "competitor trail (deep)", amount: "0.05" });
  });

  it("keeps estimatedTotal byte-stable across many keyword counts (no float drift)", () => {
    const keywords = Array.from({ length: 7 }, (_, i) => `kw_${i}`);
    const pricing = computePricing({ keywords });
    // 0.03 + 0.07 = 0.10 (note: 0.1 + 0.2 = 0.30000...4 in float)
    expect(pricing.estimatedTotal).toBe("0.10");
  });

  it("accepts currency and network overrides for future mainnet use", () => {
    const pricing = computePricing({
      keywords: ["a"],
      currency: "USDC",
      network: "morph-mainnet",
    });
    expect(pricing.currency).toBe("USDC");
    expect(pricing.network).toBe("morph-mainnet");
  });

  it("defaults to empty discounts when refreshDiscount is not set", () => {
    const pricing = computePricing({ keywords: ["a"] });
    expect(pricing.discounts).toEqual([]);
  });

  it("applies a 50% refresh-sniff discount when refreshDiscount is true", () => {
    // base 0.03 + 5 keywords 0.05 = 0.08 gross. 50% off = 0.04 net.
    const pricing = computePricing({
      keywords: ["a", "b", "c", "d", "e"],
      refreshDiscount: true,
    });
    expect(pricing.estimatedTotal).toBe("0.04");
    expect(pricing.discounts).toEqual([
      {
        label: "refresh-sniff (50% off, within 30 days)",
        amount: "0.04",
      },
    ]);
    // Gross breakdown is unchanged — the discount is a separate line item so
    // consumers can show both numbers.
    const breakdownSum = pricing.breakdown.reduce(
      (acc, item) => acc + Math.round(parseFloat(item.amount) * 100),
      0,
    );
    expect(breakdownSum).toBe(8);
  });

  it("rounds the refresh discount down to integer cents (no float drift)", () => {
    // base 0.03 + 1 keyword 0.01 = 0.04 gross. Half = 2 cents. Net = 0.02.
    const pricing = computePricing({
      keywords: ["a"],
      refreshDiscount: true,
    });
    expect(pricing.estimatedTotal).toBe("0.02");
    expect(pricing.discounts[0]?.amount).toBe("0.02");
  });
});

describe("computePricing — tiered diagnose (Sprint B)", () => {
  it("uses the legacy $0.03 base when tier is omitted", () => {
    const pricing = computePricing({ keywords: ["a"] });
    expect(pricing.breakdown[0]).toEqual({
      label: "base diagnosis",
      amount: "0.03",
    });
    expect(pricing.estimatedTotal).toBe("0.04");
  });

  it("uses $0.05 base for quick tier", () => {
    const pricing = computePricing({ keywords: ["a", "b"], tier: "quick" });
    expect(pricing.breakdown[0]).toEqual({
      label: "base diagnosis (quick)",
      amount: "0.05",
    });
    // 0.05 + 2 keywords × 0.01 = 0.07
    expect(pricing.estimatedTotal).toBe("0.07");
  });

  it("uses $0.20 base for standard tier", () => {
    const pricing = computePricing({ keywords: ["a"], tier: "standard" });
    expect(pricing.breakdown[0]).toEqual({
      label: "base diagnosis (standard)",
      amount: "0.20",
    });
    // 0.20 + 1 keyword × 0.01 = 0.21
    expect(pricing.estimatedTotal).toBe("0.21");
  });

  it("uses $1.00 base for expert tier", () => {
    const pricing = computePricing({ keywords: ["a"], tier: "expert" });
    expect(pricing.breakdown[0]).toEqual({
      label: "base diagnosis (expert)",
      amount: "1.00",
    });
    // 1.00 + 1 keyword × 0.01 = 1.01
    expect(pricing.estimatedTotal).toBe("1.01");
  });

  it("layers add-ons on top of the tier base (expert + 5 keywords + deep competitor)", () => {
    const pricing = computePricing({
      keywords: ["a", "b", "c", "d", "e"],
      competitorDepth: "deep",
      tier: "expert",
    });
    // 1.00 + 5 keywords × 0.01 + competitor deep 0.05 = 1.10
    expect(pricing.estimatedTotal).toBe("1.10");
  });

  it("composes tier base with refresh-sniff discount (expert at 50% off)", () => {
    const pricing = computePricing({
      keywords: ["a", "b"],
      tier: "expert",
      refreshDiscount: true,
    });
    // Gross = 1.00 + 2 keywords × 0.01 = 1.02. 50% off = 0.51 net.
    expect(pricing.estimatedTotal).toBe("0.51");
    expect(pricing.discounts[0]?.amount).toBe("0.51");
  });
});

describe("buildSavingsNote", () => {
  it("produces a SavingsNote with anonymous reference numbers", () => {
    const note = buildSavingsNote("0.05");
    expect(SavingsNote.safeParse(note).success).toBe(true);
    expect(note.estimatedSniffCost).toBe("0.05");
    expect(note.typicalSubscriptionMonthlyUSD).toBe(TYPICAL_ASO_START_MONTHLY_USD);
    expect(note.typicalSubscriptionAnnualUSD).toBe(TYPICAL_ASO_START_ANNUAL_USD);
    expect(note.message).toContain("$0.05 USDC");
    expect(note.message).toContain(`$${TYPICAL_ASO_START_MONTHLY_USD}/month`);
    expect(note.message).toContain("no subscription");
  });

  it("never names a specific competitor (anonymous voice)", () => {
    const note = buildSavingsNote("0.12");
    const lowerMessage = note.message.toLowerCase();
    expect(lowerMessage).not.toContain("asolytics");
    expect(lowerMessage).not.toContain("apptweak");
    expect(lowerMessage).not.toContain("mobile action");
    expect(lowerMessage).not.toContain("mobileaction");
    expect(lowerMessage).not.toContain("appfigures");
    expect(lowerMessage).not.toContain("sensor tower");
    expect(lowerMessage).not.toContain("sensortower");
  });

  it("exports both Start and Pro reference points", () => {
    expect(TYPICAL_ASO_START_MONTHLY_USD).toBe(59);
    expect(TYPICAL_ASO_START_ANNUAL_USD).toBe(589);
    expect(TYPICAL_ASO_PRO_MONTHLY_USD).toBe(199);
    expect(TYPICAL_ASO_PRO_ANNUAL_USD).toBe(1699);
  });
});

describe("Sniff Pack tiers (Sprint A scaffolding)", () => {
  it("exposes three pack tiers (10 / 50 / 250) with increasing discount", () => {
    expect(SNIFF_PACK_TIERS).toHaveLength(3);
    expect(SNIFF_PACK_TIERS.map((p) => p.credits)).toEqual([10, 50, 250]);
    // Discount should monotonically increase with pack size.
    const discounts = SNIFF_PACK_TIERS.map((p) => p.discountPercent);
    expect(discounts).toEqual([...discounts].sort((a, b) => a - b));
  });

  it("resolves a pack by id via getSniffPack", () => {
    const pack = getSniffPack("sniff-pack-50");
    expect(pack?.credits).toBe(50);
    expect(pack?.totalCents).toBe(1500n);
    expect(pack?.avgPerSniffCents).toBe(30n);
  });

  it("returns undefined for an unknown pack id", () => {
    // @ts-expect-error — invalid id by design; runtime guard returns undefined.
    expect(getSniffPack("sniff-pack-99")).toBeUndefined();
  });

  it("quoteSniffPack formats USD amounts as fixed-2-decimal strings", () => {
    const quote = quoteSniffPack("sniff-pack-10");
    expect(quote).toEqual({
      id: "sniff-pack-10",
      label: "Sniff Pack 10",
      credits: 10,
      totalAmount: "4.00",
      avgPerSniffAmount: "0.40",
      discountPercent: 20,
    });
  });

  it("listSniffPackQuotes returns all packs in order", () => {
    const list = listSniffPackQuotes();
    expect(list.map((p) => p.id)).toEqual([
      "sniff-pack-10",
      "sniff-pack-50",
      "sniff-pack-250",
    ]);
    expect(list[2]?.totalAmount).toBe("50.00");
  });

  it("largest pack ($50) is still cheaper than one month of typical Start tier ($59)", () => {
    const biggest = SNIFF_PACK_TIERS[SNIFF_PACK_TIERS.length - 1]!;
    const biggestUsd = Number(biggest.totalCents) / 100;
    expect(biggestUsd).toBeLessThan(TYPICAL_ASO_START_MONTHLY_USD);
  });
});
