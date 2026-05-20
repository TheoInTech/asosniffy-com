import { describe, expect, it } from "vitest";
import { hashIdentifier } from "../../src/middleware/rate-limit.js";

describe("rate-limit helpers", () => {
  it("hashIdentifier is stable for the same value within the same day", () => {
    const a = hashIdentifier("10.0.0.1");
    const b = hashIdentifier("10.0.0.1");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("hashIdentifier produces different hashes for different identifiers", () => {
    expect(hashIdentifier("10.0.0.1")).not.toBe(hashIdentifier("10.0.0.2"));
  });

  it("hash length is bounded (16 hex chars)", () => {
    expect(hashIdentifier("a-very-long-identifier-value-here")).toHaveLength(
      16,
    );
  });
});
