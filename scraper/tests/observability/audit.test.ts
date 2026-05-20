import { describe, expect, it } from "vitest";
import {
  createRequestAudit,
  getCurrentAudit,
  hasAnyInvocation,
  hasLiveInvocation,
  recordInvocation,
  responseHash,
  stableStringify,
  withRequestAudit,
} from "../../src/observability/audit.js";

describe("audit ledger", () => {
  it("recordInvocation appends to the active audit", async () => {
    const audit = createRequestAudit("req_test", "GET /x");
    await withRequestAudit(audit, async () => {
      recordInvocation({
        provider: "apple-itunes",
        endpoint: "/lookup",
        source: "live",
        latencyMs: 10,
        bytesIn: 42,
        responseHash: "abc123",
      });
    });
    expect(audit.invocations).toHaveLength(1);
    expect(audit.invocations[0]!.provider).toBe("apple-itunes");
  });

  it("getCurrentAudit returns the active audit inside the scope", async () => {
    const audit = createRequestAudit("req_test", "GET /x");
    await withRequestAudit(audit, async () => {
      expect(getCurrentAudit()).toBe(audit);
    });
    expect(getCurrentAudit()).toBeUndefined();
  });

  it("hasLiveInvocation returns true only when a matching live invocation exists", async () => {
    const audit = createRequestAudit("req_test", "GET /x");
    await withRequestAudit(audit, async () => {
      recordInvocation({
        provider: "apple-itunes",
        endpoint: "/search",
        source: "cached",
        latencyMs: 1,
        bytesIn: 0,
        responseHash: "h",
      });
      expect(hasLiveInvocation("apple-itunes")).toBe(false);
      expect(hasAnyInvocation("apple-itunes")).toBe(true);
      recordInvocation({
        provider: "apple-itunes",
        endpoint: "/lookup",
        source: "live",
        latencyMs: 10,
        bytesIn: 100,
        responseHash: "h2",
      });
      expect(hasLiveInvocation("apple-itunes")).toBe(true);
    });
  });

  it("recordInvocation silently no-ops outside a scope", () => {
    expect(() =>
      recordInvocation({
        provider: "x",
        endpoint: "/x",
        source: "live",
        latencyMs: 0,
        bytesIn: 0,
        responseHash: "",
      }),
    ).not.toThrow();
  });
});

describe("stableStringify + responseHash", () => {
  it("produces identical output for equivalent objects with different key order", () => {
    const a = { x: 1, y: { z: 2, w: 3 } };
    const b = { y: { w: 3, z: 2 }, x: 1 };
    expect(stableStringify(a)).toBe(stableStringify(b));
    expect(responseHash(a)).toBe(responseHash(b));
  });

  it("differs when values differ", () => {
    const a = { x: 1 };
    const b = { x: 2 };
    expect(responseHash(a)).not.toBe(responseHash(b));
  });

  it("handles cycles without throwing", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(() => responseHash(obj)).not.toThrow();
  });
});
