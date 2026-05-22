import {
  createHash,
  createPrivateKey,
  createPublicKey,
  createSign,
  randomUUID,
} from "node:crypto";
import { env } from "../env.js";
import { getCacheClient } from "../cache/redis.js";

// Apple Search Ads OAuth v4 — JWT bearer flow.
//
// References:
//   https://developer.apple.com/documentation/apple_search_ads/implementing_oauth_for_the_apple_search_ads_api
//   https://developer.apple.com/documentation/apple_ads/apple-search-ads-campaign-management-api-4
//
// Token lifecycle:
//   1. Build a client-assertion JWT signed ES256 (P-256 + SHA-256) with the
//      .p8 private key Apple issues in the Ads UI.
//   2. POST to https://appleid.apple.com/auth/oauth2/token with grant_type=
//      client_credentials, scope=searchadsorg, client_id=<id>, client_secret=
//      <JWT>. Apple returns a bearer access_token with TTL ~30 minutes.
//   3. Cache the bearer in Redis until expires_in-60s.
//   4. Subsequent API calls send Authorization: Bearer <token> +
//      X-AP-Context: orgId=<org_id> (the latter scopes to the Ads org).
//
// The JWT signer is the load-bearing piece. The popularity adapter
// (providers/apple/search-ads-popularity.ts) consumes the token; this
// module is the only place that touches the private key.

const TOKEN_CACHE_KEY = "aso:asa:access-token";

export interface AsaJwtConfig {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKeyPem: string;
  tokenUrl: string;
}

export interface AccessToken {
  token: string;
  // Unix seconds at which the token expires. Used by callers that want to
  // refresh proactively rather than on next 401.
  expiresAt: number;
}

export class AsaAuthError extends Error {
  readonly status?: number;
  readonly body?: string;
  constructor(message: string, status?: number, body?: string) {
    super(message);
    this.name = "AsaAuthError";
    if (status !== undefined) this.status = status;
    if (body !== undefined) this.body = body;
  }
}

// Sign a client-assertion JWT for Apple's token endpoint. JWT lifetime is
// capped at 180 days per Apple's spec — we use 30 min so a leaked JWT has
// a short blast radius (the bearer it exchanges for is the real reusable
// credential; we keep the JWT ephemeral).
export function signClientAssertion(config: AsaJwtConfig): string {
  const header = base64url(
    JSON.stringify({ alg: "ES256", kid: config.keyId, typ: "JWT" }),
  );
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(
    JSON.stringify({
      iss: config.teamId,
      sub: config.clientId,
      aud: "https://appleid.apple.com",
      iat: now,
      exp: now + 30 * 60, // 30 minutes
      jti: randomUUID(),
    }),
  );
  const signingInput = `${header}.${payload}`;

  const key = createPrivateKey({
    key: config.privateKeyPem,
    format: "pem",
  });
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  // dsaEncoding: "ieee-p1363" outputs r||s concat (64 bytes for P-256)
  // — what JWS ES256 expects. Node defaults to "der" which is NOT compatible.
  const sig = signer.sign({ key, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${base64urlBuffer(sig)}`;
}

// Exchange the client-assertion JWT for an Apple Ads bearer token.
// Caches the result in Redis with TTL = expires_in - 60s.
export async function fetchAccessToken(
  config: AsaJwtConfig,
): Promise<AccessToken> {
  // Cache hit?
  const cache = getCacheClient();
  const cached = await cache.get(TOKEN_CACHE_KEY);
  if (cached !== null) {
    const parsed = JSON.parse(cached) as AccessToken;
    if (parsed.expiresAt > Math.floor(Date.now() / 1000)) {
      return parsed;
    }
  }

  // Miss → exchange JWT for bearer.
  const assertion = signClientAssertion(config);
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: assertion,
    grant_type: "client_credentials",
    scope: "searchadsorg",
  }).toString();

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new AsaAuthError(
      `Apple Ads token endpoint returned ${res.status}: ${text.slice(0, 200)}`,
      res.status,
      text.slice(0, 1024),
    );
  }
  let parsed: { access_token?: string; expires_in?: number; token_type?: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AsaAuthError(
      `Apple Ads token response was not JSON: ${text.slice(0, 200)}`,
      res.status,
      text.slice(0, 1024),
    );
  }
  if (!parsed.access_token || typeof parsed.expires_in !== "number") {
    throw new AsaAuthError(
      `Apple Ads token response missing access_token/expires_in: ${text.slice(0, 200)}`,
      res.status,
      text.slice(0, 1024),
    );
  }
  const accessToken: AccessToken = {
    token: parsed.access_token,
    expiresAt: Math.floor(Date.now() / 1000) + parsed.expires_in,
  };
  await cache.set(
    TOKEN_CACHE_KEY,
    JSON.stringify(accessToken),
    Math.max(parsed.expires_in - 60, 60),
  );
  return accessToken;
}

// Best-effort access-token fetch using the configured env. Returns null
// when ASA is disabled or any required env var is missing — callers should
// then fall back to the heuristic popularity score (Phase 1 honest path).
export async function tryFetchAccessToken(): Promise<AccessToken | null> {
  if (!env.APPLE_SEARCH_ADS_ENABLED) return null;
  if (
    !env.APPLE_SEARCH_ADS_CLIENT_ID ||
    !env.APPLE_SEARCH_ADS_TEAM_ID ||
    !env.APPLE_SEARCH_ADS_KEY_ID ||
    !env.APPLE_SEARCH_ADS_PRIVATE_KEY_PEM
  ) {
    return null;
  }
  return fetchAccessToken({
    clientId: env.APPLE_SEARCH_ADS_CLIENT_ID,
    teamId: env.APPLE_SEARCH_ADS_TEAM_ID,
    keyId: env.APPLE_SEARCH_ADS_KEY_ID,
    privateKeyPem: env.APPLE_SEARCH_ADS_PRIVATE_KEY_PEM,
    tokenUrl: env.APPLE_SEARCH_ADS_TOKEN_URL,
  });
}

// ---------- base64url helpers (no padding) ----------

function base64url(input: string): string {
  return base64urlBuffer(Buffer.from(input, "utf8"));
}

function base64urlBuffer(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Exposed for tests. Computes a stable hash of the JWT header+payload
// signing input so two signatures over the same claims can be compared
// for shape equality without depending on the (non-deterministic) ECDSA r/s.
export function signingInputHash(token: string): string {
  const [header, payload] = token.split(".");
  if (!header || !payload) return "";
  return createHash("sha256").update(`${header}.${payload}`).digest("hex");
}

// Phase 9 — public-key fingerprint helper. Derived from the .p8 private
// key in env, hashed over the DER-encoded SPKI public key. Last 8 hex
// chars are emitted at server start so ops can verify which ASA key is
// active without exposing the private material. Returns null when ASA
// auth env is missing — the startup logger silently skips the line.
//
// Used by SECURITY.md's ASA JWT rotation runbook: after rotating the
// .p8 file in Apple Ads UI and updating the env, the deploy logs should
// show a new fingerprint matching what's listed in Apple's UI.
export function publicKeyFingerprint(privateKeyPem: string): string | null {
  try {
    const priv = createPrivateKey({ key: privateKeyPem, format: "pem" });
    const pub = createPublicKey(priv);
    const der = pub.export({ format: "der", type: "spki" });
    return createHash("sha256").update(der).digest("hex").slice(-8);
  } catch {
    return null;
  }
}

// Emit one line at server start when ASA is enabled and the key parses.
// Goes through console.log so it shows up in Railway's stdout pipe; if
// the project introduces structured logger later, swap to that. Silent
// when ASA is disabled or env is missing — startup must not throw.
export function logAsaKeyFingerprintAtStart(): void {
  if (!env.APPLE_SEARCH_ADS_ENABLED) return;
  if (!env.APPLE_SEARCH_ADS_PRIVATE_KEY_PEM) return;
  const fp = publicKeyFingerprint(env.APPLE_SEARCH_ADS_PRIVATE_KEY_PEM);
  if (!fp) return;
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      event: "asa_jwt_key_fingerprint",
      keyId: env.APPLE_SEARCH_ADS_KEY_ID ?? null,
      fingerprint: fp,
    }),
  );
}
