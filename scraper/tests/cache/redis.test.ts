import { afterEach, describe, expect, it } from "vitest";
import { getCacheClient, resetCacheClientForTests } from "../../src/cache/redis.js";

afterEach(() => {
  resetCacheClientForTests();
});

describe("getCacheClient", () => {
  it("returns an in-memory backend when no Upstash env vars are configured", () => {
    const client = getCacheClient();
    expect(client.backend).toBe("memory");
  });

  it("returns the same singleton across calls within a process", () => {
    const a = getCacheClient();
    const b = getCacheClient();
    expect(a).toBe(b);
  });

  it("get returns null for unknown keys", async () => {
    const client = getCacheClient();
    expect(await client.get("nope")).toBeNull();
  });

  it("set then get round-trips the value", async () => {
    const client = getCacheClient();
    await client.set("k", "v", 60);
    expect(await client.get("k")).toBe("v");
  });

  it("delete removes the key", async () => {
    const client = getCacheClient();
    await client.set("k", "v", 60);
    await client.delete("k");
    expect(await client.get("k")).toBeNull();
  });
});
