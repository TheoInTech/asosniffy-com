import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  searchAdsApps,
  _internal_extractApps_forTests,
} from "../../../src/providers/apple/search-ads-apps.js";
import { resetCacheClientForTests } from "../../../src/cache/redis.js";

beforeEach(() => {
  resetCacheClientForTests();
  delete process.env.APPLE_SEARCH_ADS_ENABLED;
});
afterEach(() => {
  resetCacheClientForTests();
});

describe("searchAdsApps — disabled kill-switch", () => {
  it("returns { kind: 'disabled' } when APPLE_SEARCH_ADS_ENABLED is unset/false", async () => {
    // env loads with ENABLED=false (tests/setup.ts default) — short-circuit.
    const result = await searchAdsApps({ query: "duolingo", country: "US" });
    expect(result).toEqual({ kind: "disabled" });
  });
});

// The live (enabled) path needs the env singleton re-loaded with ENABLED=true,
// which env.ts caches at import — see the sibling popularity test for the same
// deferral. The enabled verification path is exercised end-to-end via a local
// /quote dry-run. Here we lock the response-parser contract against Apple's
// confirmed /search/apps envelope.

describe("extractApps — parser tolerance over /search/apps envelope", () => {
  it("parses the canonical Apple envelope", () => {
    const apps = _internal_extractApps_forTests({
      data: [
        {
          adamId: 570060128,
          appName: "Duolingo: Language Lessons",
          developerName: "Duolingo",
          countryOrRegionCodes: ["US", "GB", "JP"],
        },
      ],
      pagination: { totalResults: 1 },
      error: null,
    });
    expect(apps).toEqual([
      {
        adamId: 570060128,
        appName: "Duolingo: Language Lessons",
        developerName: "Duolingo",
        countryOrRegionCodes: ["US", "GB", "JP"],
      },
    ]);
  });

  it("parses multiple apps", () => {
    const apps = _internal_extractApps_forTests({
      data: [
        { adamId: 1, appName: "A", developerName: "Dev A", countryOrRegionCodes: [] },
        { adamId: 2, appName: "B", developerName: "Dev B", countryOrRegionCodes: ["US"] },
      ],
    });
    expect(apps.map((a) => a.adamId)).toEqual([1, 2]);
  });

  it("coerces a string adamId to a number", () => {
    const apps = _internal_extractApps_forTests({
      data: [{ adamId: "427916203", appName: "Trip Trek", developerName: "X" }],
    });
    expect(apps[0]?.adamId).toBe(427916203);
  });

  it("skips rows missing adamId or appName", () => {
    const apps = _internal_extractApps_forTests({
      data: [
        { appName: "no id", developerName: "X" },
        { adamId: 5, developerName: "no name" },
        { adamId: 9, appName: "ok", developerName: "Y" },
      ],
    });
    expect(apps).toHaveLength(1);
    expect(apps[0]?.adamId).toBe(9);
  });

  it("defaults missing developerName to '' and missing codes to []", () => {
    const apps = _internal_extractApps_forTests({
      data: [{ adamId: 9, appName: "ok" }],
    });
    expect(apps[0]).toEqual({
      adamId: 9,
      appName: "ok",
      developerName: "",
      countryOrRegionCodes: [],
    });
  });

  it("filters non-string entries out of countryOrRegionCodes", () => {
    const apps = _internal_extractApps_forTests({
      data: [
        {
          adamId: 9,
          appName: "ok",
          developerName: "Y",
          countryOrRegionCodes: ["US", 42, null, "GB"],
        },
      ],
    });
    expect(apps[0]?.countryOrRegionCodes).toEqual(["US", "GB"]);
  });

  it("returns [] for empty / null / non-object / missing data", () => {
    expect(_internal_extractApps_forTests({ data: [] })).toEqual([]);
    expect(_internal_extractApps_forTests(null)).toEqual([]);
    expect(_internal_extractApps_forTests("nope")).toEqual([]);
    expect(_internal_extractApps_forTests({ pagination: {} })).toEqual([]);
    expect(_internal_extractApps_forTests({ data: "not-an-array" })).toEqual([]);
  });
});
