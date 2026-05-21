import crypto from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  buildSignContent,
  createFacilitatorClient,
  DEFAULT_FACILITATOR_BASE_URL,
  FacilitatorError,
  signRequest,
  sortObject,
} from "../../src/payment/facilitator/index.js";

const ACCESS_KEY = "morph_ak_test_0000000000000000";
const SECRET_KEY = "morph_sk_test_0000000000000000";
const FIXED_TIMESTAMP = "1747407600000";

describe("sortObject", () => {
  it("recursively sorts nested object keys", () => {
    const input = {
      b: 1,
      a: { d: 4, c: { f: 6, e: 5 } },
    };
    expect(JSON.stringify(sortObject(input))).toBe(
      '{"a":{"c":{"e":5,"f":6},"d":4},"b":1}',
    );
  });

  it("preserves array order while sorting keys inside array elements", () => {
    const input = [{ z: 1, a: 2 }, { y: 3, b: 4 }];
    expect(JSON.stringify(sortObject(input))).toBe(
      '[{"a":2,"z":1},{"b":4,"y":3}]',
    );
  });

  it("returns primitives unchanged", () => {
    expect(sortObject(42)).toBe(42);
    expect(sortObject("hello")).toBe("hello");
    expect(sortObject(null)).toBe(null);
  });
});

describe("buildSignContent", () => {
  it("includes MORPH-ACCESS-BODY when a body is provided", () => {
    const content = buildSignContent({
      accessKey: ACCESS_KEY,
      timestamp: FIXED_TIMESTAMP,
      method: "POST",
      path: "/x402/v2/verify",
      rawBody: JSON.stringify({ x402Version: 2, foo: "bar" }),
    });
    expect(content).toContain("MORPH-ACCESS-BODY");
    const parsed = JSON.parse(content);
    expect(parsed["MORPH-ACCESS-BODY"]).toEqual({ x402Version: 2, foo: "bar" });
  });

  it("OMITS MORPH-ACCESS-BODY entirely when there is no body (GET case)", () => {
    const content = buildSignContent({
      accessKey: ACCESS_KEY,
      timestamp: FIXED_TIMESTAMP,
      method: "GET",
      path: "/x402/v2/supported",
    });
    expect(content).not.toContain("MORPH-ACCESS-BODY");
    const parsed = JSON.parse(content);
    expect(Object.keys(parsed).sort()).toEqual([
      "MORPH-ACCESS-KEY",
      "MORPH-ACCESS-METHOD",
      "MORPH-ACCESS-PATH",
      "MORPH-ACCESS-TIMESTAMP",
    ]);
  });

  it("flattens query params as string[] values into the sign map", () => {
    const content = buildSignContent({
      accessKey: ACCESS_KEY,
      timestamp: FIXED_TIMESTAMP,
      method: "GET",
      path: "/x402/v2/probe",
      rawQuery: "foo=1&bar=2&foo=3",
    });
    const parsed = JSON.parse(content);
    expect(parsed.foo).toEqual(["1", "3"]);
    expect(parsed.bar).toEqual(["2"]);
  });

  it("uses the full path including /x402 prefix in the sign content", () => {
    const content = buildSignContent({
      accessKey: ACCESS_KEY,
      timestamp: FIXED_TIMESTAMP,
      method: "POST",
      path: "/x402/v2/settle",
    });
    const parsed = JSON.parse(content);
    expect(parsed["MORPH-ACCESS-PATH"]).toBe("/x402/v2/settle");
  });
});

describe("signRequest", () => {
  it("is deterministic for the same inputs", () => {
    const sig1 = signRequest({
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
      timestamp: FIXED_TIMESTAMP,
      method: "POST",
      path: "/x402/v2/verify",
      rawBody: JSON.stringify({ x402Version: 2, hello: "world" }),
    });
    const sig2 = signRequest({
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
      timestamp: FIXED_TIMESTAMP,
      method: "POST",
      path: "/x402/v2/verify",
      rawBody: JSON.stringify({ x402Version: 2, hello: "world" }),
    });
    const a = Buffer.from(sig1, "base64");
    const b = Buffer.from(sig2, "base64");
    expect(a.length).toBe(b.length);
    expect(crypto.timingSafeEqual(a, b)).toBe(true);
  });

  it("produces the same signature regardless of key order in the body", () => {
    const bodyOrderA = JSON.stringify({ a: 1, b: { d: 2, c: 3 } });
    const bodyOrderB = JSON.stringify({ b: { c: 3, d: 2 }, a: 1 });
    const sigA = signRequest({
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
      timestamp: FIXED_TIMESTAMP,
      method: "POST",
      path: "/x402/v2/verify",
      rawBody: bodyOrderA,
    });
    const sigB = signRequest({
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
      timestamp: FIXED_TIMESTAMP,
      method: "POST",
      path: "/x402/v2/verify",
      rawBody: bodyOrderB,
    });
    expect(sigA).toBe(sigB);
  });

  it("changes when the secret changes", () => {
    const sigA = signRequest({
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
      timestamp: FIXED_TIMESTAMP,
      method: "POST",
      path: "/x402/v2/verify",
      rawBody: JSON.stringify({ x402Version: 2 }),
    });
    const sigB = signRequest({
      accessKey: ACCESS_KEY,
      secretKey: "morph_sk_test_different",
      timestamp: FIXED_TIMESTAMP,
      method: "POST",
      path: "/x402/v2/verify",
      rawBody: JSON.stringify({ x402Version: 2 }),
    });
    expect(sigA).not.toBe(sigB);
  });
});

interface CapturedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: string | undefined;
}

function captureFetch(response: { status: number; body: unknown }): {
  fetchImpl: typeof fetch;
  captured: CapturedRequest[];
} {
  const captured: CapturedRequest[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    const requestUrl =
      typeof url === "string" || url instanceof URL ? url.toString() : url.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = new Headers(init?.headers ?? {});
    const bodyValue = init?.body;
    let body: string | undefined;
    if (typeof bodyValue === "string") body = bodyValue;
    else if (bodyValue === undefined || bodyValue === null) body = undefined;
    else body = String(bodyValue);
    captured.push({ url: requestUrl, method, headers, body });
    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { fetchImpl, captured };
}

describe("createFacilitatorClient", () => {
  it("defaults to the Morph facilitator base URL", () => {
    const client = createFacilitatorClient({
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
    });
    expect(client.baseUrl).toBe(DEFAULT_FACILITATOR_BASE_URL);
  });

  it("getSupported() sends GET /v2/supported with NO HMAC headers", async () => {
    const { fetchImpl, captured } = captureFetch({
      status: 200,
      body: {
        kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:2818" }],
        extensions: [],
        signers: {
          "eip155:*": ["0x1111111111111111111111111111111111111111"],
        },
      },
    });

    const client = createFacilitatorClient({
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
      fetchImpl,
    });
    const result = await client.getSupported();
    expect(result.kinds[0]?.network).toBe("eip155:2818");

    expect(captured).toHaveLength(1);
    const req = captured[0]!;
    expect(req.method).toBe("GET");
    expect(req.url).toBe("https://morph-rails.morph.network/x402/v2/supported");
    expect(req.headers.has("MORPH-ACCESS-KEY")).toBe(false);
    expect(req.headers.has("MORPH-ACCESS-TIMESTAMP")).toBe(false);
    expect(req.headers.has("MORPH-ACCESS-SIGN")).toBe(false);
  });

  it("verify() attaches all three MORPH-ACCESS-* headers", async () => {
    const { fetchImpl, captured } = captureFetch({
      status: 200,
      body: {
        isValid: true,
        invalidReason: "",
        payer: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    });

    const client = createFacilitatorClient({
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
      fetchImpl,
      now: () => Number(FIXED_TIMESTAMP),
    });
    const result = await client.verify({
      x402Version: 2,
      paymentPayload: { dummy: true },
      paymentRequirements: { dummy: true },
    });
    expect(result.isValid).toBe(true);

    expect(captured).toHaveLength(1);
    const req = captured[0]!;
    expect(req.method).toBe("POST");
    expect(req.url).toBe("https://morph-rails.morph.network/x402/v2/verify");
    expect(req.headers.get("MORPH-ACCESS-KEY")).toBe(ACCESS_KEY);
    expect(req.headers.get("MORPH-ACCESS-TIMESTAMP")).toBe(FIXED_TIMESTAMP);
    const sign = req.headers.get("MORPH-ACCESS-SIGN");
    expect(sign).toBeTruthy();
    // signature must match an independent computation of signRequest
    const expected = signRequest({
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
      timestamp: FIXED_TIMESTAMP,
      method: "POST",
      path: "/x402/v2/verify",
      rawBody: req.body,
    });
    expect(sign).toBe(expected);
  });

  it("settle() signs the request path including the /x402 prefix", async () => {
    const { fetchImpl, captured } = captureFetch({
      status: 200,
      body: {
        success: true,
        errorReason: "",
        payer: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        transaction:
          "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        network: "eip155:2910",
      },
    });
    const client = createFacilitatorClient({
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
      fetchImpl,
      now: () => Number(FIXED_TIMESTAMP),
    });
    const result = await client.settle({
      x402Version: 2,
      paymentPayload: { dummy: true },
      paymentRequirements: { dummy: true },
    });
    expect(result.success).toBe(true);
    expect(result.transaction).toMatch(/^0x[a-fA-F0-9]+$/);

    const req = captured[0]!;
    expect(req.url).toBe("https://morph-rails.morph.network/x402/v2/settle");
    const expected = signRequest({
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
      timestamp: FIXED_TIMESTAMP,
      method: "POST",
      path: "/x402/v2/settle",
      rawBody: req.body,
    });
    expect(req.headers.get("MORPH-ACCESS-SIGN")).toBe(expected);
  });

  it("throws FacilitatorError on non-2xx responses", async () => {
    const { fetchImpl } = captureFetch({
      status: 401,
      body: {
        isValid: false,
        invalidReason: "invalid signature",
        success: false,
        errorReason: "invalid signature",
      },
    });
    const client = createFacilitatorClient({
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
      fetchImpl,
    });
    await expect(
      client.verify({
        x402Version: 2,
        paymentPayload: {},
        paymentRequirements: {},
      }),
    ).rejects.toMatchObject({
      name: "FacilitatorError",
      status: 401,
      path: "/x402/v2/verify",
      method: "POST",
    });
  });

  it("throws FacilitatorError when httpFetch rejects (network error)", async () => {
    // Models the user's req_uFTHJ8KVjm0E case: TypeError("fetch failed") from
    // node:fetch on connection reset/DNS/TLS failure. Without translation, this
    // bubbles up as an uncaught error → opaque HTTP 500.
    const fetchImpl: typeof fetch = async () => {
      throw new TypeError("fetch failed");
    };
    const client = createFacilitatorClient({
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
      fetchImpl,
    });
    await expect(
      client.settle({
        x402Version: 2,
        paymentPayload: {},
        paymentRequirements: {},
      }),
    ).rejects.toMatchObject({
      name: "FacilitatorError",
      status: 0,
      path: "/x402/v2/settle",
      method: "POST",
      body: { networkError: "fetch failed" },
    });
  });

  it("settle() throws FacilitatorError when the 200 body fails schema validation", async () => {
    // Models the user's observed bug: Morph returns HTTP 200 but `transaction`
    // is malformed (empty string) and `network` isn't a CAIP-2 identifier.
    // SettleResponse.parse() would throw a raw ZodError; we expect it wrapped
    // as a FacilitatorError so the diagnose route's 402 settlement_failed
    // taxonomy handles it instead of leaking HTTP 400 invalid_body.
    const { fetchImpl } = captureFetch({
      status: 200,
      body: {
        success: true,
        transaction: "",
        network: "morph-hoodi",
      },
    });
    const client = createFacilitatorClient({
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
      fetchImpl,
    });
    let captured: unknown;
    try {
      await client.settle({
        x402Version: 2,
        paymentPayload: {},
        paymentRequirements: {},
      });
    } catch (e) {
      captured = e;
    }
    expect(captured).toBeInstanceOf(FacilitatorError);
    const err = captured as FacilitatorError;
    expect(err.status).toBe(200);
    expect(err.path).toBe("/x402/v2/settle");
    expect(err.method).toBe("POST");
    expect(err.message).toContain("transaction");
    expect(err.message).toContain("network");
    expect(err.body).toMatchObject({
      success: true,
      transaction: "",
      network: "morph-hoodi",
    });
  });

  it("verify() throws FacilitatorError when the 200 body fails schema validation", async () => {
    // Verify symmetry with settle(): a 200-with-garbage from /v2/verify must
    // also map to FacilitatorError, not a raw ZodError.
    const { fetchImpl } = captureFetch({
      status: 200,
      body: {
        // isValid is required by VerifyResponse — omitting it triggers a
        // ZodError on the boolean type rather than on a regex.
        invalidReason: "nope",
      },
    });
    const client = createFacilitatorClient({
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
      fetchImpl,
    });
    await expect(
      client.verify({
        x402Version: 2,
        paymentPayload: {},
        paymentRequirements: {},
      }),
    ).rejects.toMatchObject({
      name: "FacilitatorError",
      status: 200,
      path: "/x402/v2/verify",
      method: "POST",
    });
  });

  it("does not bake secrets into the FacilitatorError message", async () => {
    const { fetchImpl } = captureFetch({
      status: 500,
      body: { errorReason: "boom" },
    });
    const client = createFacilitatorClient({
      accessKey: ACCESS_KEY,
      secretKey: SECRET_KEY,
      fetchImpl,
    });
    let captured: unknown;
    try {
      await client.settle({
        x402Version: 2,
        paymentPayload: {},
        paymentRequirements: {},
      });
    } catch (e) {
      captured = e;
    }
    expect(captured).toBeInstanceOf(FacilitatorError);
    const err = captured as FacilitatorError;
    expect(err.message).not.toContain(SECRET_KEY);
    expect(err.message).not.toContain("MORPH-ACCESS-SIGN");
  });
});

describe("createFacilitatorClient — live integration (gated)", () => {
  const runLive = process.env.RUN_LIVE_TESTS === "1";
  it.skipIf(!runLive)(
    "GET /v2/supported returns a non-empty kinds array",
    async () => {
      const client = createFacilitatorClient({
        accessKey: process.env.MORPH_X402_ACCESS_KEY ?? "",
        secretKey: process.env.MORPH_X402_SECRET_KEY ?? "",
      });
      const result = await client.getSupported();
      expect(Array.isArray(result.kinds)).toBe(true);
      expect(result.kinds.length).toBeGreaterThan(0);
    },
    15_000,
  );
});
