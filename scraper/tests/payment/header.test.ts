import { describe, expect, it } from "vitest";

import {
  ExpiredAuthorizationError,
  MalformedHeaderError,
  WrongNetworkError,
  parsePaymentHeader,
} from "../../src/payment/header.js";

const FUTURE = "9999999999"; // year 2286 — safely future-dated for tests
const PAST = "1577836800"; // 2020-01-01

const validPayload = {
  x402Version: 2 as const,
  scheme: "exact" as const,
  network: "eip155:2910",
  payload: {
    signature:
      "0xabcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd12341b",
    authorization: {
      from: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      to: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      value: "50000000000000000",
      validAfter: "0",
      validBefore: FUTURE,
      nonce:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
    },
  },
};

function encode(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

describe("parsePaymentHeader", () => {
  it("returns null for an undefined header", () => {
    expect(parsePaymentHeader(undefined, "eip155:2910")).toBeNull();
  });

  it("returns null for a null header", () => {
    expect(parsePaymentHeader(null, "eip155:2910")).toBeNull();
  });

  it("returns null for an empty header", () => {
    expect(parsePaymentHeader("", "eip155:2910")).toBeNull();
  });

  it("returns null for a whitespace-only header", () => {
    expect(parsePaymentHeader("   ", "eip155:2910")).toBeNull();
  });

  it("parses a valid base64-JSON v2 payload", () => {
    const header = encode(validPayload);
    const parsed = parsePaymentHeader(header, "eip155:2910");
    expect(parsed).not.toBeNull();
    expect(parsed?.network).toBe("eip155:2910");
    expect(parsed?.scheme).toBe("exact");
    expect(parsed?.payload.authorization.value).toBe("50000000000000000");
    expect(parsed?.payload.authorization.validBefore).toBe(FUTURE);
  });

  it("throws WrongNetworkError when the payload network does not match", () => {
    const header = encode({ ...validPayload, network: "eip155:2818" });
    expect(() => parsePaymentHeader(header, "eip155:2910")).toThrow(
      WrongNetworkError,
    );
  });

  it("throws ExpiredAuthorizationError when validBefore is in the past", () => {
    const header = encode({
      ...validPayload,
      payload: {
        ...validPayload.payload,
        authorization: { ...validPayload.payload.authorization, validBefore: PAST },
      },
    });
    expect(() => parsePaymentHeader(header, "eip155:2910")).toThrow(
      ExpiredAuthorizationError,
    );
  });

  it("respects an injected nowSeconds clock for expiry checks", () => {
    const header = encode({
      ...validPayload,
      payload: {
        ...validPayload.payload,
        authorization: {
          ...validPayload.payload.authorization,
          validBefore: "1000",
        },
      },
    });
    // payload's validBefore=1000, our injected now=999 → still valid
    expect(parsePaymentHeader(header, "eip155:2910", { nowSeconds: () => 999 }))
      .not.toBeNull();
    // injected now=1001 → expired
    expect(() =>
      parsePaymentHeader(header, "eip155:2910", { nowSeconds: () => 1001 }),
    ).toThrow(ExpiredAuthorizationError);
  });

  it("throws MalformedHeaderError on unparseable JSON", () => {
    const header = Buffer.from("not-json", "utf8").toString("base64");
    expect(() => parsePaymentHeader(header, "eip155:2910")).toThrow(
      MalformedHeaderError,
    );
  });

  it("throws MalformedHeaderError on schema-failing payload", () => {
    const bad = { x402Version: 2, scheme: "exact", network: "eip155:2910" };
    const header = encode(bad);
    expect(() => parsePaymentHeader(header, "eip155:2910")).toThrow(
      MalformedHeaderError,
    );
  });

  it("throws MalformedHeaderError on wrong x402Version literal", () => {
    const bad = { ...validPayload, x402Version: 1 };
    const header = encode(bad);
    expect(() => parsePaymentHeader(header, "eip155:2910")).toThrow(
      MalformedHeaderError,
    );
  });

  it("throws MalformedHeaderError on a non-CAIP-2 network string", () => {
    const bad = { ...validPayload, network: "morph-hoodi" };
    const header = encode(bad);
    expect(() => parsePaymentHeader(header, "eip155:2910")).toThrow(
      MalformedHeaderError,
    );
  });

  it("error classes expose a stable .code property for downstream HTTP mapping", () => {
    try {
      parsePaymentHeader(encode({ ...validPayload, network: "eip155:2818" }), "eip155:2910");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(WrongNetworkError);
      expect((err as WrongNetworkError).code).toBe("wrong_network");
    }
  });
});
