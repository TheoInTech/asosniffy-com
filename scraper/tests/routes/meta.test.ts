import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { metaRoute } from "../../src/routes/meta.js";
import { buildOpenApiDocument } from "../../src/openapi/document.js";

function buildApp() {
  const app = new Hono();
  app.route("/", metaRoute);
  return app;
}

describe("openapi document", () => {
  it("declares the three core endpoints", () => {
    const doc = buildOpenApiDocument();
    expect(doc.openapi).toMatch(/^3\./);
    expect(Object.keys(doc.paths)).toEqual(
      expect.arrayContaining([
        "/api/v1/aso/sample",
        "/api/v1/aso/quote",
        "/api/v1/aso/diagnose",
      ]),
    );
  });

  it("documents the x402 payment flow on /diagnose", () => {
    const doc = buildOpenApiDocument();
    const diagnose = doc.paths["/api/v1/aso/diagnose"]!.post!;
    // 402 is the judging-critical contract: machine-readable offer + header.
    expect(diagnose.responses["402"]).toBeDefined();
    expect(
      diagnose.responses["402"]!.headers!["PAYMENT-REQUIRED"],
    ).toBeDefined();
    expect(diagnose.responses["200"]!.headers!["PAYMENT-RESPONSE"]).toBeDefined();
    const sigParam = diagnose.parameters!.find(
      (p) => p.name === "PAYMENT-SIGNATURE",
    );
    expect(sigParam).toBeDefined();
    expect(sigParam!.in).toBe("header");
  });

  it("derives request/response schemas from the live Zod contract", () => {
    const doc = buildOpenApiDocument();
    const quote200 = doc.paths["/api/v1/aso/quote"]!.post!.responses["200"]!;
    const schema = quote200.content!["application/json"]!.schema as Record<
      string,
      unknown
    >;
    // Spot-check a deep contract field so schema generation can't silently
    // emit an empty object: shallowScan is the §22 load-bearing block.
    const props = schema["properties"] as Record<string, unknown>;
    expect(props["shallowScan"]).toBeDefined();
    expect(props["pricing"]).toBeDefined();
  });

  it("serves GET /openapi.json", async () => {
    const app = buildApp();
    const res = await app.request("/openapi.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as { info: { title: string } };
    expect(body.info.title).toContain("Sniffy");
  });
});

describe("llms.txt", () => {
  it("serves GET /llms.txt as plain text with the agent-buyable pitch", async () => {
    const app = buildApp();
    const res = await app.request("/llms.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const text = await res.text();
    expect(text).toContain("# Sniffy");
    expect(text).toContain("x402");
    expect(text).toContain("/api/v1/aso/diagnose");
    expect(text).toContain("openapi.json");
    // Price anchoring is the wedge: per-request price vs subscription floors.
    expect(text).toMatch(/\$0\.20/);
  });
});
