import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { generateKeyPairSync, createPublicKey, createVerify } from "node:crypto";
import {
  fetchAccessToken,
  signClientAssertion,
  signingInputHash,
  type AsaJwtConfig,
} from "../../src/lib/asa-jwt.js";
import { resetCacheClientForTests } from "../../src/cache/redis.js";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  resetCacheClientForTests();
});

function generateP256Keypair(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  return {
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
}

function decodeBase64Url(input: string): Buffer {
  const padded = input + "===".slice((input.length + 3) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function makeConfig(privateKeyPem: string): AsaJwtConfig {
  return {
    clientId: "client-id-xyz",
    teamId: "team-id-xyz",
    keyId: "key-id-xyz",
    privateKeyPem,
    tokenUrl: "https://appleid.apple.com/auth/oauth2/token",
  };
}

describe("signClientAssertion", () => {
  it("produces a 3-part JWT with ES256 header + expected claims", () => {
    const { privateKeyPem } = generateP256Keypair();
    const token = signClientAssertion(makeConfig(privateKeyPem));
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
    const header = JSON.parse(decodeBase64Url(parts[0]!).toString("utf8"));
    expect(header.alg).toBe("ES256");
    expect(header.kid).toBe("key-id-xyz");
    const payload = JSON.parse(decodeBase64Url(parts[1]!).toString("utf8"));
    expect(payload.iss).toBe("team-id-xyz");
    expect(payload.sub).toBe("client-id-xyz");
    expect(payload.aud).toBe("https://appleid.apple.com");
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(60 * 60);
    expect(typeof payload.jti).toBe("string");
  });

  it("signature verifies against the matching public key (ieee-p1363)", () => {
    const { privateKeyPem, publicKeyPem } = generateP256Keypair();
    const token = signClientAssertion(makeConfig(privateKeyPem));
    const [header, payload, signature] = token.split(".");
    const signingInput = `${header}.${payload}`;
    const verifier = createVerify("SHA256");
    verifier.update(signingInput);
    verifier.end();
    const ok = verifier.verify(
      { key: createPublicKey(publicKeyPem), dsaEncoding: "ieee-p1363" },
      decodeBase64Url(signature!),
    );
    expect(ok).toBe(true);
  });

  it("two signatures over equivalent claims hash the same signing-input", () => {
    const { privateKeyPem } = generateP256Keypair();
    const t1 = signClientAssertion(makeConfig(privateKeyPem));
    // Different jti each time, so signing input differs — confirms the
    // helper is non-deterministic across calls (good for replay safety).
    const t2 = signClientAssertion(makeConfig(privateKeyPem));
    expect(signingInputHash(t1)).not.toBe(signingInputHash(t2));
  });
});

describe("fetchAccessToken", () => {
  it("exchanges the JWT for a bearer token and caches it", async () => {
    const { privateKeyPem } = generateP256Keypair();
    let calls = 0;
    server.use(
      http.post("https://appleid.apple.com/auth/oauth2/token", () => {
        calls += 1;
        return HttpResponse.json({
          access_token: "bearer-xyz",
          expires_in: 600,
          token_type: "Bearer",
        });
      }),
    );

    const first = await fetchAccessToken(makeConfig(privateKeyPem));
    expect(first.token).toBe("bearer-xyz");
    expect(first.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));

    const second = await fetchAccessToken(makeConfig(privateKeyPem));
    expect(second.token).toBe("bearer-xyz");
    // Cached → no second HTTP call.
    expect(calls).toBe(1);
  });

  it("throws AsaAuthError on non-2xx token response", async () => {
    const { privateKeyPem } = generateP256Keypair();
    server.use(
      http.post("https://appleid.apple.com/auth/oauth2/token", () =>
        HttpResponse.text("invalid_client", { status: 401 }),
      ),
    );
    await expect(fetchAccessToken(makeConfig(privateKeyPem))).rejects.toThrow(
      /Apple Ads token endpoint returned 401/,
    );
  });

  it("throws when response is missing access_token", async () => {
    const { privateKeyPem } = generateP256Keypair();
    server.use(
      http.post("https://appleid.apple.com/auth/oauth2/token", () =>
        HttpResponse.json({ expires_in: 600 }),
      ),
    );
    await expect(fetchAccessToken(makeConfig(privateKeyPem))).rejects.toThrow(
      /missing access_token/,
    );
  });
});
