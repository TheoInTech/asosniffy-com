import { describe, expect, it } from "vitest";
import { cacheKey } from "../../src/cache/keys.js";
import { PROVIDER_VERSION, REPORT_VERSION } from "../../src/cache/versions.js";

describe("cacheKey", () => {
  it("includes the provider + report version in the prefix", () => {
    const key = cacheKey({ namespace: "apple:lookup", appId: "1" });
    expect(key.startsWith(`aso:${PROVIDER_VERSION}:${REPORT_VERSION}:apple:lookup:`)).toBe(true);
  });

  it("normalizes keyword order so set ['b','a'] equals ['a','b']", () => {
    const a = cacheKey({ namespace: "ns", keywords: ["b", "a"] });
    const b = cacheKey({ namespace: "ns", keywords: ["a", "b"] });
    expect(a).toBe(b);
  });

  it("lowercases and trims keywords before sorting", () => {
    const a = cacheKey({ namespace: "ns", keywords: ["Habit ", " tracker"] });
    const b = cacheKey({ namespace: "ns", keywords: ["habit", "tracker"] });
    expect(a).toBe(b);
  });

  it("emits a sha256-shortened key when the assembled key exceeds 250 chars", () => {
    const longKeywords = Array.from({ length: 50 }, (_, i) =>
      `super-long-keyword-token-${i.toString().padStart(4, "0")}`,
    );
    const key = cacheKey({
      namespace: "ns",
      store: "ios",
      country: "US",
      appId: "123456789",
      keywords: longKeywords,
    });
    expect(key.length).toBeLessThanOrEqual(250);
    expect(key.includes(":sha256:")).toBe(true);
  });

  it("orders extra entries alphabetically by key", () => {
    const a = cacheKey({
      namespace: "ns",
      extra: { zeta: "1", alpha: "2" },
    });
    const b = cacheKey({
      namespace: "ns",
      extra: { alpha: "2", zeta: "1" },
    });
    expect(a).toBe(b);
  });
});
