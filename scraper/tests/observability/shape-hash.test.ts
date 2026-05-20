import { beforeEach, describe, expect, it } from "vitest";
import {
  getShapeDrift,
  recordResponseShape,
  recordShape,
  responseShapeHash,
} from "../../src/observability/shape-hash.js";
import { resetCacheClientForTests } from "../../src/cache/redis.js";

beforeEach(() => {
  resetCacheClientForTests();
});

describe("responseShapeHash", () => {
  it("produces identical hashes for objects that differ only in values", () => {
    const a = { foo: "x", bar: 1 };
    const b = { foo: "completely different value", bar: 999 };
    expect(responseShapeHash(a).hash).toBe(responseShapeHash(b).hash);
  });

  it("produces identical hashes regardless of key order", () => {
    const a = { foo: 1, bar: "x" };
    const b = { bar: "x", foo: 1 };
    expect(responseShapeHash(a).hash).toBe(responseShapeHash(b).hash);
  });

  it("produces different hashes when a field is added", () => {
    const a = { foo: 1 };
    const b = { foo: 1, bar: 2 };
    expect(responseShapeHash(a).hash).not.toBe(responseShapeHash(b).hash);
  });

  it("produces different hashes when a field is renamed", () => {
    const a = { foo: 1 };
    const b = { fou: 1 };
    expect(responseShapeHash(a).hash).not.toBe(responseShapeHash(b).hash);
  });

  it("ignores array length", () => {
    const a = { items: [{ id: 1 }] };
    const b = { items: [{ id: 1 }, { id: 2 }, { id: 3 }] };
    expect(responseShapeHash(a).hash).toBe(responseShapeHash(b).hash);
  });

  it("detects added fields inside array elements", () => {
    const a = { items: [{ id: 1 }] };
    const b = { items: [{ id: 1, name: "x" }] };
    expect(responseShapeHash(a).hash).not.toBe(responseShapeHash(b).hash);
  });

  it("fieldPaths are sorted and include nested structure", () => {
    const { fieldPaths } = responseShapeHash({
      feed: { entry: [{ id: "1", title: { label: "x" } }] },
    });
    expect(fieldPaths).toContain("feed:object");
    expect(fieldPaths).toContain("feed.entry:array");
    // Sorted output → deterministic across runs.
    const sorted = [...fieldPaths].sort();
    expect(fieldPaths).toEqual(sorted);
  });
});

describe("recordShape — drift detection", () => {
  it("first call records no drift (no previous hash)", async () => {
    const result = await recordShape({
      provider: "apple-itunes",
      endpoint: "/lookup",
      hash: "abc",
    });
    expect(result.drift).toBe(false);
    expect(result.previousHash).toBeNull();
    expect(result.driftSince).toBeNull();
  });

  it("same hash on second call → no drift", async () => {
    await recordShape({ provider: "apple-itunes", endpoint: "/lookup", hash: "abc" });
    const second = await recordShape({
      provider: "apple-itunes",
      endpoint: "/lookup",
      hash: "abc",
    });
    expect(second.drift).toBe(false);
    expect(second.previousHash).toBe("abc");
  });

  it("different hash on second call → drift + driftSince populated", async () => {
    await recordShape({ provider: "apple-itunes", endpoint: "/lookup", hash: "abc" });
    const second = await recordShape({
      provider: "apple-itunes",
      endpoint: "/lookup",
      hash: "xyz",
    });
    expect(second.drift).toBe(true);
    expect(second.previousHash).toBe("abc");
    expect(second.driftSince).not.toBeNull();
  });

  it("getShapeDrift returns the latest state", async () => {
    await recordShape({ provider: "apple-itunes", endpoint: "/lookup", hash: "abc" });
    await recordShape({ provider: "apple-itunes", endpoint: "/lookup", hash: "xyz" });
    const state = await getShapeDrift({
      provider: "apple-itunes",
      endpoint: "/lookup",
    });
    expect(state.lastSeenHash).toBe("xyz");
    expect(state.driftSince).not.toBeNull();
  });
});

describe("recordResponseShape — convenience composition", () => {
  it("computes hash + records in one call", async () => {
    const r = await recordResponseShape({
      provider: "apple-itunes",
      endpoint: "/lookup",
      value: { foo: 1, bar: "x" },
    });
    expect(r.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(r.drift).toBe(false);
    expect(r.fieldPaths.length).toBeGreaterThan(0);
  });

  it("second call with a renamed field reports drift", async () => {
    await recordResponseShape({
      provider: "apple-itunes",
      endpoint: "/lookup",
      value: { foo: 1 },
    });
    const second = await recordResponseShape({
      provider: "apple-itunes",
      endpoint: "/lookup",
      value: { fou: 1 },
    });
    expect(second.drift).toBe(true);
  });
});
