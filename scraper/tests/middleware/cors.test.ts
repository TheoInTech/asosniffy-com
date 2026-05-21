import { describe, expect, it } from "vitest";
import { app } from "../../src/index.js";

const ALLOWED_ORIGIN = "http://localhost:3000";

function splitAllowList(headerValue: string | null): string[] {
  return (headerValue ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

describe("cors middleware — preflight", () => {
  it("permits X-Sniffy-Client on OPTIONS /api/v1/aso/quote", async () => {
    const res = await app.request("/api/v1/aso/quote", {
      method: "OPTIONS",
      headers: {
        Origin: ALLOWED_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-sniffy-client",
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED_ORIGIN);

    const allowed = splitAllowList(res.headers.get("Access-Control-Allow-Headers"));
    expect(allowed).toContain("x-sniffy-client");
    expect(allowed).toContain("content-type");
  });

  it("permits X-Sniffy-Client on OPTIONS /api/v1/aso/sample", async () => {
    const res = await app.request("/api/v1/aso/sample", {
      method: "OPTIONS",
      headers: {
        Origin: ALLOWED_ORIGIN,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "x-sniffy-client",
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED_ORIGIN);

    const allowed = splitAllowList(res.headers.get("Access-Control-Allow-Headers"));
    expect(allowed).toContain("x-sniffy-client");
  });

  it("permits Authorization on OPTIONS /api/v1/aso/wallet/sniffs", async () => {
    const res = await app.request("/api/v1/aso/wallet/sniffs", {
      method: "OPTIONS",
      headers: {
        Origin: ALLOWED_ORIGIN,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization,x-sniffy-client",
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ALLOWED_ORIGIN);

    const allowed = splitAllowList(res.headers.get("Access-Control-Allow-Headers"));
    expect(allowed).toContain("authorization");
    expect(allowed).toContain("x-sniffy-client");
  });

  it("rejects unknown origins (returns no Allow-Origin)", async () => {
    const res = await app.request("/api/v1/aso/quote", {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });

    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("cors middleware — response exposure", () => {
  it("exposes x402 response headers on GET /api/v1/aso/sample", async () => {
    const res = await app.request("/api/v1/aso/sample", {
      headers: { Origin: ALLOWED_ORIGIN },
    });

    expect(res.status).toBe(200);
    const exposed = splitAllowList(res.headers.get("Access-Control-Expose-Headers"));
    expect(exposed).toContain("payment-required");
    expect(exposed).toContain("payment-response");
    expect(exposed).toContain("x-request-id");
  });
});
