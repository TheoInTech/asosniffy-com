import { describe, expect, it } from "vitest";
import { app } from "../../src/index.js";

describe("GET /health", () => {
  it("returns ok + schema version + network", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      schemaVersion: "2026-06-mvp-6",
      network: "eip155:2910",
    });
  });

  it("echoes X-Request-ID on every response", async () => {
    const res = await app.request("/health");
    expect(res.headers.get("X-Request-ID")).toMatch(/^req_/);
  });
});
