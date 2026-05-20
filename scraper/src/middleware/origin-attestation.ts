import { createMiddleware } from "hono/factory";
import { env } from "../env.js";

// Phase 5 — soft origin attestation.
//
// /quote (the most-expensive free endpoint) requires X-Sniffy-Client header
// so anonymous scrapers can't quietly burn iTunes budget. The header is
// part of the public SDK / CLI / MCP contract — Sniffy's own client surfaces
// always set it.
//
// /sample is intentionally exempt per CLAUDE.md: judges hit it without any
// header and must always get 200.
//
// Plus: a small User-Agent deny-list (configurable via env) blocks the
// obvious bots — empty UAs, raw `curl/`, and headless defaults without
// the X-Sniffy-Client header.

export interface OriginAttestationConfig {
  // When true, missing X-Sniffy-Client header triggers a 403. Some routes
  // (e.g. /sample) opt out by passing require:false.
  require: boolean;
}

export function originAttestation(config: OriginAttestationConfig) {
  return createMiddleware(async (c, next) => {
    if (env.NODE_ENV === "test") {
      await next();
      return;
    }
    const ua = (c.req.header("user-agent") ?? "").toLowerCase();
    const deny = env.ABUSE_DENYLIST_UA;
    if (deny.length > 0 && deny.some((needle) => ua.includes(needle))) {
      return c.json(
        {
          error: {
            code: "ua_blocked",
            message:
              "User-Agent denied. If you're building a real client, set X-Sniffy-Client; see https://github.com/TheoInTech/asosniffy-com",
          },
        },
        403,
      );
    }
    if (config.require && env.ABUSE_REQUIRE_SNIFFY_CLIENT) {
      const sniffyClient = c.req.header("x-sniffy-client");
      if (!sniffyClient || sniffyClient.trim().length === 0) {
        return c.json(
          {
            error: {
              code: "missing_client_header",
              message:
                "X-Sniffy-Client header is required. Use the SDK (`@sniffy/sdk`), CLI (`npx sniffy quote`), or include the header explicitly: see https://github.com/TheoInTech/asosniffy-com#client-attestation",
            },
          },
          403,
        );
      }
    }
    await next();
  });
}
