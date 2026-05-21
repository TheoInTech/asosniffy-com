import { createMiddleware } from "hono/factory";
import { resolveSession } from "../wallet/session.js";
import type { LowerAddress } from "../lib/address.js";

// Bearer-token gate for /wallet/* endpoints. Reads
//   Authorization: Bearer sniffy_sess_<token>
// looks up the opaque session in Redis, and stamps `c.set("walletAddress", ...)`
// when valid. 401 with code `session_invalid` on miss/expiry so the frontend
// can clear its cached session and re-prompt SIWE without surfacing internal
// state.

declare module "hono" {
  interface ContextVariableMap {
    walletAddress?: LowerAddress;
  }
}

export interface SiweAuthMiddlewareArgs {
  optional?: boolean; // when true, missing/invalid auth is allowed (no c.set)
}

export function siweAuth(args: SiweAuthMiddlewareArgs = {}) {
  return createMiddleware(async (c, next) => {
    const header = c.req.header("authorization");
    if (!header) {
      if (args.optional) return next();
      return c.json(
        { error: { code: "session_invalid", message: "Authorization header required" } },
        401,
      );
    }
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    if (!match || !match[1]) {
      if (args.optional) return next();
      return c.json(
        { error: { code: "session_invalid", message: "Bearer token malformed" } },
        401,
      );
    }
    const session = await resolveSession(match[1]);
    if (!session) {
      if (args.optional) return next();
      return c.json(
        { error: { code: "session_invalid", message: "Session expired or revoked" } },
        401,
      );
    }
    c.set("walletAddress", session.address);
    await next();
  });
}
