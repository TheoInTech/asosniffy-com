import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { resetCacheClientForTests } from "../../src/cache/redis.js";
import {
  SiweAuthError,
  issueNonce,
  parseSiweMessage,
  resolveSession,
  revokeSession,
  verifyAndIssueSession,
} from "../../src/wallet/session.js";
import { normalizeAddress } from "../../src/lib/address.js";

const DOMAIN = "localhost:3000";
const CHAIN_ID = 2910; // Morph Hoodi
const URI = "http://localhost:3000/trail";

beforeEach(() => resetCacheClientForTests());
afterEach(() => resetCacheClientForTests());

interface SiweFields {
  domain: string;
  address: string;
  uri: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
  notBefore?: string;
  statement?: string;
}

function buildSiwe(fields: SiweFields): string {
  const lines: string[] = [];
  lines.push(`${fields.domain} wants you to sign in with your Ethereum account:`);
  lines.push(fields.address);
  lines.push("");
  if (fields.statement) {
    lines.push(fields.statement);
    lines.push("");
  }
  lines.push(`URI: ${fields.uri}`);
  lines.push("Version: 1");
  lines.push(`Chain ID: ${fields.chainId}`);
  lines.push(`Nonce: ${fields.nonce}`);
  lines.push(`Issued At: ${fields.issuedAt}`);
  if (fields.expirationTime) lines.push(`Expiration Time: ${fields.expirationTime}`);
  if (fields.notBefore) lines.push(`Not Before: ${fields.notBefore}`);
  return lines.join("\n");
}

describe("parseSiweMessage", () => {
  it("parses a complete SIWE message", () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const msg = buildSiwe({
      domain: DOMAIN,
      address: account.address,
      uri: URI,
      chainId: CHAIN_ID,
      nonce: "abc123",
      issuedAt: "2026-05-20T12:00:00.000Z",
      expirationTime: "2026-05-20T12:05:00.000Z",
      statement: "Sign in to Sniffy",
    });
    const parsed = parseSiweMessage(msg);
    expect(parsed.domain).toBe(DOMAIN);
    expect(parsed.address).toBe(account.address.toLowerCase());
    expect(parsed.uri).toBe(URI);
    expect(parsed.chainId).toBe(CHAIN_ID);
    expect(parsed.nonce).toBe("abc123");
    expect(parsed.statement).toBe("Sign in to Sniffy");
  });

  it("parses a message without statement", () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const msg = buildSiwe({
      domain: DOMAIN,
      address: account.address,
      uri: URI,
      chainId: CHAIN_ID,
      nonce: "n",
      issuedAt: "2026-05-20T12:00:00.000Z",
    });
    expect(parseSiweMessage(msg).statement).toBeUndefined();
  });

  it("throws on missing required field", () => {
    const malformed = `${DOMAIN} wants you to sign in with your Ethereum account:\n0x0000000000000000000000000000000000000001\n\nURI: ${URI}\nVersion: 1\nChain ID: 2910\nIssued At: 2026-05-20T12:00:00.000Z`;
    expect(() => parseSiweMessage(malformed)).toThrow(SiweAuthError);
  });
});

describe("issueNonce + verifyAndIssueSession", () => {
  it("happy path: signed SIWE message exchanges for a session token", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const issued = await issueNonce(account.address, DOMAIN);
    const message = buildSiwe({
      domain: DOMAIN,
      address: account.address,
      uri: URI,
      chainId: CHAIN_ID,
      nonce: issued.nonce,
      issuedAt: new Date().toISOString(),
      expirationTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
    const signature = await account.signMessage({ message });
    const session = await verifyAndIssueSession({
      message,
      signature,
      acceptedDomains: [DOMAIN],
      expectedChainId: CHAIN_ID,
    });
    expect(session.address).toBe(account.address.toLowerCase());
    expect(session.sessionToken).toMatch(/^sniffy_sess_/);
  });

  it("rejects nonce replay (single-use)", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const issued = await issueNonce(account.address, DOMAIN);
    const message = buildSiwe({
      domain: DOMAIN,
      address: account.address,
      uri: URI,
      chainId: CHAIN_ID,
      nonce: issued.nonce,
      issuedAt: new Date().toISOString(),
    });
    const signature = await account.signMessage({ message });
    await verifyAndIssueSession({
      message,
      signature,
      acceptedDomains: [DOMAIN],
      expectedChainId: CHAIN_ID,
    });
    await expect(
      verifyAndIssueSession({
        message,
        signature,
        acceptedDomains: [DOMAIN],
        expectedChainId: CHAIN_ID,
      }),
    ).rejects.toMatchObject({ code: "nonce_invalid" });
  });

  it("rejects wrong chain", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const issued = await issueNonce(account.address, DOMAIN);
    const message = buildSiwe({
      domain: DOMAIN,
      address: account.address,
      uri: URI,
      chainId: 1, // Ethereum Mainnet — wrong for Hoodi
      nonce: issued.nonce,
      issuedAt: new Date().toISOString(),
    });
    const signature = await account.signMessage({ message });
    await expect(
      verifyAndIssueSession({
        message,
        signature,
        acceptedDomains: [DOMAIN],
        expectedChainId: CHAIN_ID,
      }),
    ).rejects.toMatchObject({ code: "chain_mismatch" });
  });

  it("rejects wrong domain", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const issued = await issueNonce(account.address, DOMAIN);
    const message = buildSiwe({
      domain: "phishing.example.com",
      address: account.address,
      uri: URI,
      chainId: CHAIN_ID,
      nonce: issued.nonce,
      issuedAt: new Date().toISOString(),
    });
    const signature = await account.signMessage({ message });
    await expect(
      verifyAndIssueSession({
        message,
        signature,
        acceptedDomains: [DOMAIN],
        expectedChainId: CHAIN_ID,
      }),
    ).rejects.toMatchObject({ code: "domain_mismatch" });
  });

  it("rejects expired message", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const issued = await issueNonce(account.address, DOMAIN);
    const pastIso = new Date(Date.now() - 60_000).toISOString();
    const message = buildSiwe({
      domain: DOMAIN,
      address: account.address,
      uri: URI,
      chainId: CHAIN_ID,
      nonce: issued.nonce,
      issuedAt: new Date(Date.now() - 120_000).toISOString(),
      expirationTime: pastIso,
    });
    const signature = await account.signMessage({ message });
    await expect(
      verifyAndIssueSession({
        message,
        signature,
        acceptedDomains: [DOMAIN],
        expectedChainId: CHAIN_ID,
      }),
    ).rejects.toMatchObject({ code: "expired" });
  });

  it("rejects when signature recovers to a different address than claimed", async () => {
    const signer = privateKeyToAccount(generatePrivateKey());
    const impostor = privateKeyToAccount(generatePrivateKey());
    const issued = await issueNonce(signer.address, DOMAIN);
    const message = buildSiwe({
      domain: DOMAIN,
      address: signer.address, // claims signer
      uri: URI,
      chainId: CHAIN_ID,
      nonce: issued.nonce,
      issuedAt: new Date().toISOString(),
    });
    const signature = await impostor.signMessage({ message }); // signed by impostor
    await expect(
      verifyAndIssueSession({
        message,
        signature,
        acceptedDomains: [DOMAIN],
        expectedChainId: CHAIN_ID,
      }),
    ).rejects.toMatchObject({ code: "signature_invalid" });
  });

  it("rejects nonce issued for a different address", async () => {
    const a = privateKeyToAccount(generatePrivateKey());
    const b = privateKeyToAccount(generatePrivateKey());
    const issued = await issueNonce(a.address, DOMAIN);
    const message = buildSiwe({
      domain: DOMAIN,
      address: b.address,
      uri: URI,
      chainId: CHAIN_ID,
      nonce: issued.nonce, // borrowed nonce from a's session
      issuedAt: new Date().toISOString(),
    });
    const signature = await b.signMessage({ message });
    await expect(
      verifyAndIssueSession({
        message,
        signature,
        acceptedDomains: [DOMAIN],
        expectedChainId: CHAIN_ID,
      }),
    ).rejects.toMatchObject({ code: "nonce_invalid" });
  });
});

describe("resolveSession + revokeSession", () => {
  it("revokes a session so subsequent reads return null", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const issued = await issueNonce(account.address, DOMAIN);
    const message = buildSiwe({
      domain: DOMAIN,
      address: account.address,
      uri: URI,
      chainId: CHAIN_ID,
      nonce: issued.nonce,
      issuedAt: new Date().toISOString(),
    });
    const signature = await account.signMessage({ message });
    const session = await verifyAndIssueSession({
      message,
      signature,
      acceptedDomains: [DOMAIN],
      expectedChainId: CHAIN_ID,
    });
    expect(await resolveSession(session.sessionToken)).toMatchObject({
      address: normalizeAddress(account.address),
    });
    await revokeSession(session.sessionToken);
    expect(await resolveSession(session.sessionToken)).toBeNull();
  });

  it("returns null for malformed bearer tokens", async () => {
    expect(await resolveSession("invalid_prefix_xyz")).toBeNull();
    expect(await resolveSession("")).toBeNull();
  });
});
