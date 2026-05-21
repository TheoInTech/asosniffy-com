import { Hono } from "hono";
import { env } from "../env.js";
import { validateBody } from "../middleware/validate-body.js";
import { siweAuth } from "../middleware/siwe-auth.js";
import {
  WalletNonceRequest,
  WalletSessionRequest,
  type WalletNonceResponse,
  type WalletSessionResponse,
  type WalletSniffsResponse,
} from "../schemas/wallet.js";
import {
  SiweAuthError,
  acceptedSiweDomains,
  activeChainId,
  issueNonce,
  resolveSession,
  revokeSession,
  verifyAndIssueSession,
} from "../wallet/session.js";
import { getSniff, listSniffs } from "../wallet/history.js";
import { tryNormalizeAddress } from "../lib/address.js";

// /api/v1/aso/wallet/*
//
// All endpoints are free (signature is the auth, not x402). Caller flow:
//   1. POST /nonce           {address}                    → {nonce, domain, expiresAt}
//   2. POST /session         {message, signature}         → {sessionToken, address, expiresAt}
//   3. GET  /sniffs          Bearer <sessionToken>        → {items[], nextCursor}
//   4. GET  /sniff/:sniffId  Bearer <sessionToken>        → DiagnosePaidResponse | 404
//   5. DELETE /session       Bearer <sessionToken>        → 204 (logout)

export const walletRoute = new Hono();

walletRoute.use("*", async (c, next) => {
  if (!env.WALLET_HISTORY_ENABLED) {
    return c.json(
      {
        error: {
          code: "history_unavailable",
          message: "Wallet history is disabled on this deployment.",
        },
      },
      503,
    );
  }
  return next();
});

// ---------- nonce ----------

walletRoute.post("/nonce", validateBody(WalletNonceRequest), async (c) => {
  const body = c.get("parsedBody") as { address: string };
  const normalized = tryNormalizeAddress(body.address);
  if (!normalized) {
    return c.json(
      { error: { code: "address_invalid", message: "Address is not a valid EVM address" } },
      400,
    );
  }
  // Domain that the SIWE message must bind to. Use the first acceptable
  // domain (typically sniffy.io in production, localhost:3000 in dev). The
  // client uses this verbatim so the server's verify pass is byte-equal.
  const domains = acceptedSiweDomains();
  if (domains.length === 0) {
    return c.json(
      {
        error: {
          code: "history_unavailable",
          message: "No accepted SIWE domain configured (ALLOWED_ORIGINS empty).",
        },
      },
      503,
    );
  }
  const primaryDomain = domains[0]!;
  const issued = await issueNonce(normalized, primaryDomain);
  const response: WalletNonceResponse = {
    nonce: issued.nonce,
    domain: primaryDomain,
    expiresAt: issued.expiresAt,
  };
  return c.json(response);
});

// ---------- session: exchange SIWE for opaque token ----------

walletRoute.post("/session", validateBody(WalletSessionRequest), async (c) => {
  const body = c.get("parsedBody") as { message: string; signature: `0x${string}` };
  try {
    const issued = await verifyAndIssueSession({
      message: body.message,
      signature: body.signature,
      acceptedDomains: acceptedSiweDomains(),
      expectedChainId: activeChainId(),
    });
    const response: WalletSessionResponse = {
      sessionToken: issued.sessionToken,
      address: issued.address,
      expiresAt: issued.expiresAt,
    };
    return c.json(response);
  } catch (err) {
    if (err instanceof SiweAuthError) {
      // Generic message in body — specific code in field so the frontend can
      // branch on it without exposing why exactly the signature failed.
      return c.json(
        { error: { code: err.code, message: "SIWE authentication failed" } },
        401,
      );
    }
    throw err;
  }
});

// ---------- session: logout ----------

walletRoute.delete("/session", siweAuth(), async (c) => {
  const header = c.req.header("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (match && match[1]) {
    await revokeSession(match[1]);
  }
  return c.body(null, 204);
});

// ---------- sniffs list ----------

walletRoute.get("/sniffs", siweAuth(), async (c) => {
  const address = c.get("walletAddress");
  if (!address) {
    // Defensive: siweAuth() set this. Mirror the 401 shape for type safety.
    return c.json(
      { error: { code: "session_invalid", message: "Session missing on context" } },
      401,
    );
  }
  const limitParam = c.req.query("limit");
  const cursor = c.req.query("cursor") ?? undefined;
  const limit = limitParam !== undefined ? Number.parseInt(limitParam, 10) : undefined;
  const result = await listSniffs({
    address,
    ...(cursor !== undefined ? { cursor } : {}),
    ...(limit !== undefined && Number.isFinite(limit) ? { limit } : {}),
  });
  const response: WalletSniffsResponse = {
    items: result.items,
    nextCursor: result.nextCursor,
  };
  return c.json(response);
});

// ---------- single sniff replay ----------

walletRoute.get("/sniff/:sniffId", siweAuth(), async (c) => {
  const address = c.get("walletAddress");
  if (!address) {
    return c.json(
      { error: { code: "session_invalid", message: "Session missing on context" } },
      401,
    );
  }
  const sniffId = c.req.param("sniffId");
  const report = await getSniff({ address, sniffId });
  if (!report) {
    // 404 (not 403) on ownership mismatch is intentional — refusing to
    // confirm whether the sniffId exists prevents a paying user's history
    // from being enumerated by another wallet.
    return c.json(
      { error: { code: "sniff_not_found", message: "Sniff not found" } },
      404,
    );
  }
  return c.json(report);
});

// Light read helper for /health-style introspection (not used by the route
// chain). Tests use it to assert end-to-end without round-tripping HTTP.
export async function _testResolveSession(token: string) {
  return resolveSession(token);
}
