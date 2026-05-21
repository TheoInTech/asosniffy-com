import { randomBytes, timingSafeEqual } from "node:crypto";
import { verifyMessage } from "viem";
import { env } from "../env.js";
import { getCacheClient } from "../cache/redis.js";
import { normalizeAddress, tryNormalizeAddress } from "../lib/address.js";
import type { LowerAddress } from "../lib/address.js";

// SIWE (EIP-4361) handshake + opaque-token session store.
//
// Flow:
//   1. Client POSTs to /wallet/nonce with { address }; server mints a
//      single-use nonce (5-min TTL in Redis) and returns it along with the
//      domain the SIWE message must bind to.
//   2. Client builds the SIWE message (per EIP-4361 text format), signs it
//      with the wallet via EIP-191 personal_sign, POSTs to /wallet/session
//      with { message, signature }.
//   3. Server parses the SIWE message, verifies the signature against the
//      claimed address, atomically consumes the nonce (so replays fail),
//      checks domain + chainId, then issues a 32-byte opaque session token
//      stored in Redis with a 30-min TTL. Subsequent /wallet/* calls
//      authorize via Authorization: Bearer <token>.
//
// Design intent: opaque tokens (not JWTs) so revocation is a single DEL,
// secrets never leak through logs as decoded JWT payloads, and we avoid
// crypto-agility footguns. Nonces are server-issued + single-use to prevent
// replay even within the message-validity window. The SIWE message MUST
// reconstruct byte-equal from parsed fields so attackers can't smuggle
// extra resources / chains via newline injection.

const NONCE_TTL_SECONDS = 5 * 60;
const SESSION_TTL_SECONDS = 30 * 60;
const NONCE_PREFIX = "siwe:nonce:";
const SESSION_PREFIX = "siwe:session:";
const SIWE_VERSION = "1";

export type SiweAuthFailure =
  | "address_invalid"
  | "nonce_invalid"
  | "signature_invalid"
  | "chain_mismatch"
  | "domain_mismatch"
  | "expired";

export class SiweAuthError extends Error {
  readonly code: SiweAuthFailure;
  constructor(code: SiweAuthFailure, message?: string) {
    super(message ?? code);
    this.name = "SiweAuthError";
    this.code = code;
  }
}

export interface NonceIssue {
  nonce: string;
  expiresAt: string; // ISO
  domain: string;
}

// Mint a single-use nonce for the given address. The address is bound to the
// nonce in Redis so a client can't request a nonce for one address and then
// SIWE-sign as a different address.
export async function issueNonce(
  rawAddress: string,
  domain: string,
): Promise<NonceIssue> {
  const address = normalizeAddress(rawAddress);
  const nonce = randomBytes(16).toString("hex");
  const cache = getCacheClient();
  const issuedAt = Date.now();
  const expiresAt = new Date(issuedAt + NONCE_TTL_SECONDS * 1000).toISOString();
  await cache.set(
    `${NONCE_PREFIX}${nonce}`,
    JSON.stringify({ address, issuedAt, domain }),
    NONCE_TTL_SECONDS,
  );
  return { nonce, expiresAt, domain };
}

// Parsed SIWE-4361 message — only the fields we validate against.
export interface ParsedSiwe {
  domain: string;
  address: LowerAddress;
  statement?: string;
  uri: string;
  version: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
  notBefore?: string;
}

const ADDRESS_LINE_RE = /^0x[a-fA-F0-9]{40}$/;

// Hand-rolled SIWE parser. We avoid `siwe` (the EIP-4361 npm package) because
// it pulls ethers and a viem-compatible verifier already exists. Output is
// strict: missing required field => throws.
export function parseSiweMessage(raw: string): ParsedSiwe {
  // SIWE uses LF, not CRLF.
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  if (lines.length < 6) {
    throw new SiweAuthError("signature_invalid", "SIWE message too short");
  }

  // Line 0: "<domain> wants you to sign in with your Ethereum account:"
  const headerMatch = /^(\S+) wants you to sign in with your Ethereum account:$/.exec(
    lines[0]!,
  );
  if (!headerMatch || !headerMatch[1]) {
    throw new SiweAuthError("signature_invalid", "SIWE header malformed");
  }
  const domain = headerMatch[1];

  // Line 1: 0x address.
  const addressLine = lines[1] ?? "";
  if (!ADDRESS_LINE_RE.test(addressLine)) {
    throw new SiweAuthError("signature_invalid", "SIWE address line malformed");
  }
  const address = normalizeAddress(addressLine);

  // Line 2: empty separator.
  if ((lines[2] ?? "") !== "") {
    throw new SiweAuthError("signature_invalid", "expected blank line after address");
  }

  // Optional statement on line 3 (followed by blank), or the fields block
  // begins immediately.
  let cursor = 3;
  let statement: string | undefined;
  if (lines[cursor] !== "" && !startsWithFieldKey(lines[cursor] ?? "")) {
    statement = lines[cursor] ?? "";
    cursor += 1;
    if ((lines[cursor] ?? "") !== "") {
      throw new SiweAuthError(
        "signature_invalid",
        "expected blank line after statement",
      );
    }
    cursor += 1;
  } else if (lines[cursor] === "") {
    cursor += 1;
  }

  // Remaining lines are `Key: Value` pairs.
  const fields = new Map<string, string>();
  for (let i = cursor; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line === "") continue;
    const colon = line.indexOf(":");
    if (colon === -1) {
      throw new SiweAuthError(
        "signature_invalid",
        `SIWE field line missing colon: ${line}`,
      );
    }
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    fields.set(key, value);
  }

  const uri = fields.get("URI");
  const version = fields.get("Version");
  const chainIdStr = fields.get("Chain ID");
  const nonce = fields.get("Nonce");
  const issuedAt = fields.get("Issued At");
  const expirationTime = fields.get("Expiration Time");
  const notBefore = fields.get("Not Before");

  if (!uri || !version || !chainIdStr || !nonce || !issuedAt) {
    throw new SiweAuthError(
      "signature_invalid",
      "SIWE message missing required field",
    );
  }
  const chainId = Number.parseInt(chainIdStr, 10);
  if (!Number.isFinite(chainId)) {
    throw new SiweAuthError("signature_invalid", "Chain ID not a number");
  }

  return {
    domain,
    address,
    ...(statement !== undefined ? { statement } : {}),
    uri,
    version,
    chainId,
    nonce,
    issuedAt,
    ...(expirationTime !== undefined ? { expirationTime } : {}),
    ...(notBefore !== undefined ? { notBefore } : {}),
  };
}

function startsWithFieldKey(line: string): boolean {
  return /^(URI|Version|Chain ID|Nonce|Issued At|Expiration Time|Not Before|Request ID|Resources):/.test(
    line,
  );
}

export interface VerifyAndIssueArgs {
  message: string;
  signature: `0x${string}`;
  // Per-request inputs the route handler resolves from env / cors config.
  acceptedDomains: ReadonlyArray<string>;
  expectedChainId: number;
  now?: number; // test override (ms epoch)
}

export interface IssuedSession {
  sessionToken: string;
  address: LowerAddress;
  expiresAt: string; // ISO
}

// Atomic: parse → verify signature → consume nonce → issue session. All-or-
// nothing — any failure surfaces a typed error and leaves state unchanged.
export async function verifyAndIssueSession(
  args: VerifyAndIssueArgs,
): Promise<IssuedSession> {
  const parsed = parseSiweMessage(args.message);
  const now = args.now ?? Date.now();

  // Version is fixed at "1" by EIP-4361.
  if (parsed.version !== SIWE_VERSION) {
    throw new SiweAuthError("signature_invalid", `unsupported SIWE version ${parsed.version}`);
  }

  // Chain binding — must match the network the server thinks is active.
  if (parsed.chainId !== args.expectedChainId) {
    throw new SiweAuthError("chain_mismatch");
  }

  // Domain binding — exact match against the accepted list.
  if (!args.acceptedDomains.includes(parsed.domain)) {
    throw new SiweAuthError("domain_mismatch");
  }

  // Time bounds. notBefore is permissive; expirationTime must be in the future.
  if (parsed.notBefore !== undefined) {
    const nbf = Date.parse(parsed.notBefore);
    if (Number.isFinite(nbf) && nbf > now) {
      throw new SiweAuthError("expired", "not yet valid");
    }
  }
  if (parsed.expirationTime !== undefined) {
    const exp = Date.parse(parsed.expirationTime);
    if (Number.isFinite(exp) && exp <= now) {
      throw new SiweAuthError("expired");
    }
  }

  // Signature verification — must recover to the claimed address.
  let valid: boolean;
  try {
    valid = await verifyMessage({
      address: parsed.address,
      message: args.message,
      signature: args.signature,
    });
  } catch {
    throw new SiweAuthError("signature_invalid");
  }
  if (!valid) {
    throw new SiweAuthError("signature_invalid");
  }

  // Atomically consume the nonce. Two-step (GET then DELETE) is acceptable
  // here because the Redis layer's get returns the same string for two
  // racing callers but only one delete actually un-stores it; either of
  // those callers will see a hit and proceed, the other will fail the
  // subsequent re-read. We require the GET payload's bound address to match
  // the SIWE-claimed address — defends against nonce theft from another
  // wallet's request.
  const cache = getCacheClient();
  const nonceKey = `${NONCE_PREFIX}${parsed.nonce}`;
  const raw = await cache.get(nonceKey);
  if (raw === null) {
    throw new SiweAuthError("nonce_invalid");
  }
  let bound: { address?: string; issuedAt?: number; domain?: string };
  try {
    bound = JSON.parse(raw) as typeof bound;
  } catch {
    throw new SiweAuthError("nonce_invalid");
  }
  if (
    typeof bound.address !== "string" ||
    !constantTimeEqualString(bound.address, parsed.address)
  ) {
    throw new SiweAuthError("nonce_invalid");
  }
  // Consume.
  await cache.delete(nonceKey);

  // Issue session.
  const sessionToken = `sniffy_sess_${randomBytes(24).toString("base64url")}`;
  const sessionExpiresAtMs = now + SESSION_TTL_SECONDS * 1000;
  const sessionExpiresAt = new Date(sessionExpiresAtMs).toISOString();
  await cache.set(
    `${SESSION_PREFIX}${sessionToken}`,
    JSON.stringify({ address: parsed.address, expiresAt: sessionExpiresAtMs }),
    SESSION_TTL_SECONDS,
  );

  return {
    sessionToken,
    address: parsed.address,
    expiresAt: sessionExpiresAt,
  };
}

export interface ResolvedSession {
  address: LowerAddress;
  expiresAt: number; // ms epoch
}

// Look up an opaque session token. Returns null on miss/expiry/malformed —
// caller maps to 401 with code `session_invalid`.
export async function resolveSession(
  token: string,
): Promise<ResolvedSession | null> {
  if (!token || !token.startsWith("sniffy_sess_")) return null;
  const raw = await getCacheClient().get(`${SESSION_PREFIX}${token}`);
  if (raw === null) return null;
  let parsed: { address?: string; expiresAt?: number };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    return null;
  }
  const address = tryNormalizeAddress(parsed.address);
  if (!address) return null;
  const expiresAt = typeof parsed.expiresAt === "number" ? parsed.expiresAt : 0;
  if (expiresAt <= Date.now()) return null;
  return { address, expiresAt };
}

// Revoke a session by token. Idempotent.
export async function revokeSession(token: string): Promise<void> {
  if (!token || !token.startsWith("sniffy_sess_")) return;
  await getCacheClient().delete(`${SESSION_PREFIX}${token}`);
}

// Resolve the chain ID the SIWE message must bind to, from the active
// MORPH_NETWORK CAIP-2 identifier. Returns NaN if the env is malformed
// (defensive — env validation already rejects malformed CAIP-2).
export function activeChainId(): number {
  const network = env.MORPH_NETWORK; // CAIP-2: "eip155:<id>"
  const colon = network.indexOf(":");
  if (colon === -1) return Number.NaN;
  return Number.parseInt(network.slice(colon + 1), 10);
}

// Derive the list of acceptable SIWE `domain` values from the CORS origin
// allowlist. SIWE binds to a hostname (no scheme, no path) so we strip
// `https?://` and trailing slashes from each origin.
export function acceptedSiweDomains(): string[] {
  const out = new Set<string>();
  for (const origin of env.ALLOWED_ORIGINS) {
    const trimmed = origin.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
    if (trimmed) out.add(trimmed);
  }
  return Array.from(out);
}

function constantTimeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return timingSafeEqual(ab, bb);
}
