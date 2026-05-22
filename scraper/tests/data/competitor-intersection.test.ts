import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppRecord, AppleProviderError } from "../../src/providers/apple/types.js";

// We mock the iTunes search module so the intersection logic can be
// exercised deterministically. We also reset the cache module so each
// test starts clean (the cache is a long-lived in-memory map otherwise).
vi.mock("../../src/providers/apple/itunes.js", () => ({
  searchApps: vi.fn(),
}));

vi.mock("../../src/cache/wrapper.js", () => ({
  withCache: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

const { searchApps } = await import("../../src/providers/apple/itunes.js");
const searchAppsMock = vi.mocked(searchApps);

const { collectIosCompetitorsByIntersection } = await import(
  "../../src/data/competitor-intersection.js"
);

function record(id: string, name: string): AppRecord {
  return {
    id,
    name,
    developer: "Dev",
    primaryCategory: "Sports",
    subtitle: "",
    description: "",
    ratingsSummary: { average: 4.5, count: 100 },
    screenshots: [],
    currentVersion: "1.0",
    provenance: "live",
  };
}

beforeEach(() => {
  searchAppsMock.mockReset();
});

describe("collectIosCompetitorsByIntersection", () => {
  it("returns empty rows when given fewer than 2 keywords (no intersection possible)", async () => {
    const out = await collectIosCompetitorsByIntersection({
      keywords: ["pickleball"],
      country: "US",
      excludeAppId: "999",
    });
    expect(out.rows).toEqual([]);
    expect(out.errors).toEqual([]);
    expect(searchAppsMock).not.toHaveBeenCalled();
  });

  it("keeps apps appearing in at least 2 search result sets, drops singletons", async () => {
    searchAppsMock.mockImplementation(async ({ term }) => {
      if (term === "pickleball app") {
        return [record("100", "PickleScore"), record("101", "Only-Here-1"), record("102", "PickleStats")];
      }
      if (term === "tournament tracker") {
        return [record("100", "PickleScore"), record("103", "Only-Here-2"), record("102", "PickleStats")];
      }
      return [] as AppRecord[];
    });

    const out = await collectIosCompetitorsByIntersection({
      keywords: ["pickleball app", "tournament tracker"],
      country: "US",
      excludeAppId: "999",
    });

    const ids = out.rows.map((r) => r.appId);
    expect(ids).toContain("100");
    expect(ids).toContain("102");
    expect(ids).not.toContain("101");
    expect(ids).not.toContain("103");
  });

  it("excludes the target appId from the result set", async () => {
    searchAppsMock.mockImplementation(async () => [
      record("999", "TargetApp"),
      record("100", "OtherA"),
      record("101", "OtherB"),
    ]);
    const out = await collectIosCompetitorsByIntersection({
      keywords: ["pickleball", "court"],
      country: "US",
      excludeAppId: "999",
    });
    expect(out.rows.map((r) => r.appId)).not.toContain("999");
  });

  it("sorts by match count desc, then by best (lowest) rank asc", async () => {
    searchAppsMock.mockImplementation(async ({ term }) => {
      // App A (id=100) appears in all 3 keywords' results at various ranks.
      // App B (id=200) appears in 2 keywords' results at higher ranks.
      if (term === "k1") return [record("100", "A"), record("200", "B"), record("999", "Target")];
      if (term === "k2") return [record("200", "B"), record("100", "A"), record("999", "Target")];
      if (term === "k3") return [record("100", "A"), record("999", "Target"), record("300", "C")];
      return [];
    });
    const out = await collectIosCompetitorsByIntersection({
      keywords: ["k1", "k2", "k3"],
      country: "US",
      excludeAppId: "999",
    });
    // A is in all 3 result sets → highest match count → first.
    expect(out.rows[0]?.appId).toBe("100");
    // B is in 2 result sets → second (300 was only in 1, dropped).
    expect(out.rows[1]?.appId).toBe("200");
  });

  it("only counts the TOP 8 results per keyword toward the intersection (Phase A: raised from 3)", async () => {
    // App X is at position 9 (index 8) in both keyword searches. With the
    // top-8 cap it should NEVER be counted, so it must be absent from rows.
    // Phase A raised TOP_PER_KEYWORD 3 → 8 so the intersection has more
    // candidate apps to find ≥2-keyword matches in.
    searchAppsMock.mockImplementation(async () => [
      record("100", "A"),
      record("101", "B"),
      record("102", "C"),
      record("103", "D"),
      record("104", "E"),
      record("105", "F"),
      record("106", "G"),
      record("107", "H"),
      record("999X", "X"), // index 8 — past the top-8 cap
    ]);
    const out = await collectIosCompetitorsByIntersection({
      keywords: ["k1", "k2"],
      country: "US",
      excludeAppId: "ZZZ",
    });
    expect(out.rows.map((r) => r.appId)).not.toContain("999X");
  });

  it("surfaces per-keyword search failures as CoverageProviderError entries but keeps going", async () => {
    searchAppsMock.mockImplementation(async ({ term }) => {
      if (term === "good") {
        return [record("100", "A"), record("200", "B")];
      }
      const err: AppleProviderError = { error: "rate_limited" };
      return err;
    });
    const out = await collectIosCompetitorsByIntersection({
      keywords: ["good", "bad"],
      country: "US",
      excludeAppId: "999",
    });
    expect(out.errors.length).toBeGreaterThan(0);
    expect(out.errors[0]?.kind).toBe("rate_limited");
    // With only one keyword successfully producing results, nothing
    // can intersect at MIN_MATCHES=2, so rows stays empty.
    expect(out.rows).toEqual([]);
  });

  it("caps the final result set at 5 competitors", async () => {
    // Synthesize 10 apps all appearing in both searches' top-3 (only
    // top-3 are counted but the cap on the final output is 5).
    searchAppsMock.mockImplementation(async () => [
      record("a", "A"),
      record("b", "B"),
      record("c", "C"),
    ]);
    const out = await collectIosCompetitorsByIntersection({
      keywords: ["k1", "k2"],
      country: "US",
      excludeAppId: "ZZZ",
    });
    expect(out.rows.length).toBeLessThanOrEqual(5);
  });
});
