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
//
// This is "soft" attestation: the header value is not signed, and an
// attacker reading DevTools can copy it. The real anti-abuse defenses are
// the per-IP+per-tuple rate limit and the cost circuit. What this *does*
// give us is observability — every audit log line carries the parsed
// `clientSurface` so we can see which surface (landing / sdk / cli / mcp /
// unknown) is driving traffic.

export type ClientSurface = "landing" | "sdk" | "cli" | "mcp" | "unknown";

export interface ClientAttestation {
  clientSurface: ClientSurface;
  clientVersion?: string;
  raw: string;
}

declare module "hono" {
  interface ContextVariableMap {
    // Optional: only set when the X-Sniffy-Client header is present. The
    // audit middleware checks for undefined before promoting to the log.
    clientAttestation: ClientAttestation | undefined;
  }
}

const ATTESTATION_PATTERN = /^@sniffy\/(landing|sdk|cli|mcp)@([0-9A-Za-z.\-+]+)$/;
const MAX_HEADER_LENGTH = 128;

export function parseClientAttestation(
  headerValue: string | undefined,
): ClientAttestation | undefined {
  if (headerValue === undefined) return undefined;
  const trimmed = headerValue.trim();
  if (trimmed.length === 0) return undefined;
  const raw = trimmed.slice(0, MAX_HEADER_LENGTH);
  const match = ATTESTATION_PATTERN.exec(raw);
  if (match === null) {
    return { clientSurface: "unknown", raw };
  }
  return {
    clientSurface: match[1] as Exclude<ClientSurface, "unknown">,
    clientVersion: match[2],
    raw,
  };
}

export interface OriginAttestationConfig {
  // When true, missing X-Sniffy-Client header triggers a 403. Some routes
  // (e.g. /sample) opt out by passing require:false.
  require: boolean;
}

export function originAttestation(config: OriginAttestationConfig) {
  return createMiddleware(async (c, next) => {
    // Always parse the header (even in test mode) so downstream code can
    // read c.get("clientAttestation") consistently. The 403 check below
    // is what gets short-circuited under NODE_ENV=test.
    const attestation = parseClientAttestation(c.req.header("x-sniffy-client"));
    if (attestation !== undefined) {
      c.set("clientAttestation", attestation);
    }

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
      if (attestation === undefined) {
        return c.json(
          {
            error: {
              code: "missing_client_header",
              message:
                "X-Sniffy-Client header is required. Use the SDK (`@sniffy/sdk`), CLI (`npx sniffy quote`), or include the header explicitly: see https://github.com/TheoInTech/asosniffy-com",
            },
          },
          403,
        );
      }
    }
    await next();
  });
}
