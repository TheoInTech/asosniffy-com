import { beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import {
  funnelKey,
  funnelStageFor,
  recordFunnelStage,
} from "../../src/observability/funnel.js";
import {
  getCacheClient,
  resetCacheClientForTests,
  type CacheClient,
} from "../../src/cache/redis.js";
import { auditMiddleware } from "../../src/middleware/audit.js";
import { HttpError } from "../../src/errors.js";

describe("funnelStageFor", () => {
  it("maps the three funnel stages from (route, status)", () => {
    expect(funnelStageFor("POST /api/v1/aso/quote", 200)).toBe("quote_success");
    expect(funnelStageFor("POST /api/v1/aso/diagnose", 402)).toBe(
      "diagnose_402",
    );
    expect(funnelStageFor("POST /api/v1/aso/diagnose", 200)).toBe(
      "diagnose_paid",
    );
  });

  it("returns null for everything outside the funnel", () => {
    // /sample is free + judge-facing; not a funnel signal.
    expect(funnelStageFor("POST /api/v1/aso/sample", 200)).toBeNull();
    // Failed quote (rate limit, cost circuit) is not a funnel entry.
    expect(funnelStageFor("POST /api/v1/aso/quote", 429)).toBeNull();
    expect(funnelStageFor("POST /api/v1/aso/quote", 503)).toBeNull();
    // 401 on diagnose is a session bug, not a payment decision.
    expect(funnelStageFor("POST /api/v1/aso/diagnose", 401)).toBeNull();
    expect(funnelStageFor("POST /api/v1/aso/diagnose", 500)).toBeNull();
    expect(funnelStageFor("GET /api/v1/aso/history/abc", 200)).toBeNull();
  });
});

describe("funnelKey", () => {
  it("buckets by UTC day, stage, and surface", () => {
    expect(funnelKey("diagnose_402", "mcp", new Date("2026-06-10T23:59:00Z"))).toBe(
      "aso:funnel:2026-06-10:diagnose_402:mcp",
    );
  });
});

describe("recordFunnelStage", () => {
  beforeEach(() => {
    resetCacheClientForTests();
  });

  it("increments the day-bucketed counter and returns the new count", async () => {
    const first = await recordFunnelStage("quote_success", "cli");
    const second = await recordFunnelStage("quote_success", "cli");
    expect(first).toBe(1);
    expect(second).toBe(2);
    // Different surface gets its own counter.
    expect(await recordFunnelStage("quote_success", "anonymous")).toBe(1);
  });

  it("never throws when the cache backend fails", async () => {
    const broken = {
      incr: async () => {
        throw new Error("redis down");
      },
    } as unknown as CacheClient;
    await expect(
      recordFunnelStage("diagnose_paid", "sdk", broken),
    ).resolves.toBeNull();
  });
});

describe("audit middleware funnel wiring", () => {
  beforeEach(() => {
    resetCacheClientForTests();
  });

  function buildApp(handler: (c: any) => Response | Promise<Response>) {
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("requestId", "req_funnel_test");
      await next();
    });
    app.use("*", auditMiddleware);
    app.onError((err, c) => {
      if (err instanceof HttpError) {
        return c.json({ error: { code: err.code } }, err.status as 402);
      }
      return c.json({ error: { code: "internal" } }, 500);
    });
    app.post("/api/v1/aso/diagnose", handler);
    app.post("/api/v1/aso/quote", handler);
    return app;
  }

  it("records diagnose_402 when the handler throws a 402 HttpError", async () => {
    class FakePaymentRequired extends HttpError {
      readonly status = 402;
      readonly code = "payment_required" as const;
      constructor() {
        super("pay me");
      }
    }
    const app = buildApp(() => {
      throw new FakePaymentRequired();
    });
    const res = await app.request("/api/v1/aso/diagnose", { method: "POST" });
    expect(res.status).toBe(402);

    const cache = getCacheClient();
    const key = funnelKey("diagnose_402", "anonymous", new Date());
    // incr with the same key returns prior count + 1 → prior count was 1.
    expect(await cache.incr(key, 60)).toBe(2);
  });

  it("records quote_success with the attested client surface", async () => {
    const app = buildApp((c) => {
      // Simulate origin-attestation middleware having parsed the header.
      c.set("clientAttestation", {
        clientSurface: "mcp",
        raw: "@gosniffy/mcp",
      });
      return c.json({ ok: true });
    });
    const res = await app.request("/api/v1/aso/quote", { method: "POST" });
    expect(res.status).toBe(200);

    const cache = getCacheClient();
    const key = funnelKey("quote_success", "mcp", new Date());
    expect(await cache.incr(key, 60)).toBe(2);
  });

  it("does not record anything for non-funnel routes", async () => {
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("requestId", "req_x");
      await next();
    });
    app.use("*", auditMiddleware);
    app.post("/api/v1/aso/sample", (c) => c.json({ ok: true }));
    await app.request("/api/v1/aso/sample", { method: "POST" });

    const cache = getCacheClient();
    const key = funnelKey("quote_success", "anonymous", new Date());
    expect(await cache.incr(key, 60)).toBe(1);
  });
});
