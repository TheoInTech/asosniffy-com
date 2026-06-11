import type { z, ZodTypeAny } from "zod";

// Trust-the-server response parsing.
//
// Why this exists: a real agent lost money. The SDK bundles a SNAPSHOT of the
// scraper Zod schemas at build time (tsup noExternal), so a published SDK
// freezes the contract. When the server moves ahead (e.g. a new
// `popularitySource: "observable-signals"` enum value), the old SDK's strict
// `.parse()` THREW — and that parse runs AFTER the x402 payment has already
// settled (non-refundable). Result: charged, no result, and the agent retried
// → paid again.
//
// The server is the validation authority: the diagnose route generates +
// validates the report and settles LAST, so it never returns output it
// couldn't produce. The client re-validating strictly is the bug. So the SDK
// must TRUST the server's response and never throw it away or strip it.
//
//   success → parsed (defaults applied; unknown TOP-LEVEL sections preserved
//             via passthrough, so a slightly-stale SDK still surfaces new
//             report sections instead of silently dropping them)
//   failure → warn ONCE, return the raw payload cast to T — NEVER throw a 2xx
//
// The Zod schema becomes a dev-time skew WARNING, not a runtime gate on a
// response the buyer may have paid for.

export interface SchemaWarning {
  label: string; // "quote" | "diagnose" | "diagnose-402" | "sample"
  issues: string; // short summary of the first mismatches
}

export type SchemaWarningSink = (warning: SchemaWarning) => void;

// Default sink → STDERR. Critical: MCP servers speak JSON-RPC over STDOUT; a
// stray stdout write corrupts the protocol stream. console.warn writes to
// stderr, so it's safe for the MCP transport.
export const defaultSchemaWarningSink: SchemaWarningSink = (w) => {
  console.warn(
    `[@gosniffy/sdk] response schema skew on "${w.label}": your @gosniffy/sdk may be behind the server. ` +
      `Returning the server payload as-is (no data lost). Upgrade with: npm i @gosniffy/sdk@latest. ` +
      `(${w.issues})`,
  );
};

function asPassthrough(schema: ZodTypeAny): ZodTypeAny {
  const candidate = schema as { passthrough?: () => ZodTypeAny };
  return typeof candidate.passthrough === "function"
    ? candidate.passthrough()
    : schema;
}

export function parseTrusted<S extends ZodTypeAny>(
  schema: S,
  json: unknown,
  label: string,
  warn: SchemaWarningSink,
): z.infer<S> {
  const result = asPassthrough(schema).safeParse(json);
  if (result.success) return result.data as z.infer<S>;
  const issues = result.error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  warn({ label, issues });
  // Never discard a server response — the buyer may have paid for it.
  return json as z.infer<S>;
}
