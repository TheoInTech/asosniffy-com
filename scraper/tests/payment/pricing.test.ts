import { describe, expect, it } from "vitest";

import { computePricing } from "../../src/payment/pricing.js";
import { Pricing } from "../../src/schemas/index.js";

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
});
