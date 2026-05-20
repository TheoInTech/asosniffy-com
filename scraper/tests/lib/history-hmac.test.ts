import { describe, expect, it } from "vitest";
import {
  canonicalString,
  signHistoryTuple,
  signWildcardForRequest,
  verifyHistorySignature,
  verifyWildcardForRequest,
} from "../../src/lib/history-hmac.js";

const TUPLE = {
  sniffId: "sniff_abc",
  store: "ios" as const,
  country: "US",
  appId: "570060128",
  keyword: "language",
};

describe("canonicalString", () => {
  it("normalizes country to uppercase", () => {
    const s = canonicalString({ ...TUPLE, country: "us" });
    expect(s).toContain("|US|");
  });

  it("normalizes keyword to lowercase + trimmed", () => {
    const s = canonicalString({ ...TUPLE, keyword: "  Language  " });
    expect(s.endsWith("|language")).toBe(true);
  });

  it("produces stable output for equivalent inputs", () => {
    expect(canonicalString({ ...TUPLE, country: "us", keyword: "LANGUAGE" })).toBe(
      canonicalString({ ...TUPLE, country: "US", keyword: "language" }),
    );
  });
});

describe("signHistoryTuple + verifyHistorySignature", () => {
  it("verifies a freshly-signed tuple", () => {
    const sig = signHistoryTuple(TUPLE);
    expect(sig.length).toBe(64); // sha256 hex
    expect(verifyHistorySignature(TUPLE, sig)).toBe(true);
  });

  it("rejects a signature for a different tuple", () => {
    const sig = signHistoryTuple(TUPLE);
    expect(
      verifyHistorySignature({ ...TUPLE, keyword: "different" }, sig),
    ).toBe(false);
  });

  it("rejects an empty signature", () => {
    expect(verifyHistorySignature(TUPLE, "")).toBe(false);
  });

  it("rejects garbage signatures of the right length", () => {
    expect(verifyHistorySignature(TUPLE, "0".repeat(64))).toBe(false);
  });

  it("rejects signatures with the wrong length", () => {
    expect(verifyHistorySignature(TUPLE, "deadbeef")).toBe(false);
  });

  it("rejects non-hex signatures gracefully", () => {
    expect(verifyHistorySignature(TUPLE, "z".repeat(64))).toBe(false);
  });
});

describe("wildcard signature flow", () => {
  it("a wildcard signature verifies for any keyword from the same request", () => {
    const { keyword: _ignored, ...wildcardInput } = TUPLE;
    void _ignored;
    const sig = signWildcardForRequest(wildcardInput);
    expect(verifyWildcardForRequest(wildcardInput, sig)).toBe(true);
  });

  it("a wildcard signature does NOT verify as a per-keyword signature", () => {
    const { keyword: _ignored, ...wildcardInput } = TUPLE;
    void _ignored;
    const sig = signWildcardForRequest(wildcardInput);
    expect(verifyHistorySignature(TUPLE, sig)).toBe(false);
  });
});
