import { describe, expect, it } from "vitest";
import { app } from "../../src/index.js";
import { SampleResponse } from "../../src/schemas/index.js";

describe("GET /api/v1/aso/sample", () => {
  it("returns the sample report tagged with sample:true", async () => {
    const res = await app.request("/api/v1/aso/sample");
    expect(res.status).toBe(200);

    const body = await res.json();
    const parsed = SampleResponse.parse(body);
    expect(parsed.sample).toBe(true);
    expect(parsed.dataProvenance).toEqual({
      appMetadata: "fixture",
      keywordRank: "fixture",
      competitors: "fixture",
      recommendations: "fixture",
    });
    expect(parsed.receipt).toBeDefined();
  });

  it("sets a 5-minute Cache-Control header", async () => {
    const res = await app.request("/api/v1/aso/sample");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
  });
});
