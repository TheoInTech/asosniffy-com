import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import type { Provenance } from "../schemas/index.js";

// Per-request audit ledger.
//
// Every provider call MUST register an invocation here. The orchestrator
// uses `hasLiveInvocation` to refuse stamping `provenance: "live"` on a
// response field unless a matching live invocation was actually recorded.
// This makes the "provenance lies" failure mode structurally impossible.
//
// Propagation across async boundaries uses Node's AsyncLocalStorage — the
// same primitive Hono itself uses to thread context. Provider code calls
// `recordInvocation(...)` without taking an audit parameter; the middleware
// wraps each request in `withRequestAudit(...)` so all downstream awaits
// see the same audit object.

export type AuditSource = "live" | "cached" | "fixture" | "inferred";

export interface ProviderInvocation {
  provider: string;
  endpoint: string;
  source: AuditSource;
  latencyMs: number;
  bytesIn: number;
  responseHash: string;
  httpStatus?: number;
  errorKind?: string;
  shapeDrift?: boolean;
}

export interface RequestAudit {
  requestId: string;
  route: string;
  startedAt: number;
  invocations: ProviderInvocation[];
  // Soft attestation parsed from X-Sniffy-Client by the origin-attestation
  // middleware and promoted into the audit record by the audit middleware
  // before the structured log line is emitted. Undefined when no header
  // was present (e.g. anonymous /sample callers).
  clientSurface?: "landing" | "sdk" | "cli" | "mcp" | "aso-knowledge" | "unknown";
  clientVersion?: string;
  // Lowercased payer address recovered from the facilitator settle response,
  // stamped by the /diagnose route after settlement succeeds. Surfaces in
  // structured logs so paid requests are tied to a wallet for billing
  // reconciliation. Undefined for unpaid endpoints and fixture-receipt mode.
  payer?: string;
}

const storage = new AsyncLocalStorage<RequestAudit>();

export function createRequestAudit(
  requestId: string,
  route: string,
): RequestAudit {
  return {
    requestId,
    route,
    startedAt: Date.now(),
    invocations: [],
  };
}

export async function withRequestAudit<T>(
  audit: RequestAudit,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run(audit, fn);
}

export function getCurrentAudit(): RequestAudit | undefined {
  return storage.getStore();
}

// Append a provider invocation to the current audit. Silently no-ops when
// called outside a withRequestAudit scope (e.g. from a test that doesn't set
// one up) so provider code can register unconditionally.
export function recordInvocation(inv: ProviderInvocation): void {
  const audit = storage.getStore();
  if (!audit) return;
  audit.invocations.push(inv);
}

// Did we successfully fetch from this provider during the current request?
// Used by the orchestrator to enforce honest provenance: if no live
// invocation exists for a provider, claiming `provenance: "live"` is a bug.
export function hasLiveInvocation(provider: string): boolean {
  const audit = storage.getStore();
  if (!audit) return false;
  return audit.invocations.some(
    (i) => i.provider === provider && i.source === "live",
  );
}

// Did we have a recorded invocation for this provider at all (live, cached,
// or degraded — but not "no call happened")? Used by the orchestrator to
// distinguish "we tried and the provider gave us nothing" from "we never
// even called this provider."
export function hasAnyInvocation(provider: string): boolean {
  const audit = storage.getStore();
  if (!audit) return false;
  return audit.invocations.some((i) => i.provider === provider);
}

// Deterministic JSON stringifier (sorted keys, cycle-safe).
// Used for response hashing so cache writes for "the same response" produce
// identical hashes regardless of object iteration order.
export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  function recurse(v: unknown): unknown {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v)) return null;
    seen.add(v);
    if (Array.isArray(v)) return v.map(recurse);
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const out: Record<string, unknown> = {};
    for (const key of keys) out[key] = recurse(obj[key]);
    return out;
  }
  return JSON.stringify(recurse(value));
}

export function responseHash(body: unknown): string {
  return createHash("sha256")
    .update(stableStringify(body))
    .digest("hex")
    .slice(0, 16);
}

// Snapshot of audit invocations safe to log (no secrets, no full request
// bodies — we only kept the hash anyway).
export function summarizeAudit(audit: RequestAudit): {
  requestId: string;
  route: string;
  totalMs: number;
  invocations: ReadonlyArray<Omit<ProviderInvocation, never>>;
  clientSurface?: RequestAudit["clientSurface"];
  clientVersion?: string;
  payer?: string;
} {
  return {
    requestId: audit.requestId,
    route: audit.route,
    totalMs: Date.now() - audit.startedAt,
    invocations: audit.invocations,
    clientSurface: audit.clientSurface,
    clientVersion: audit.clientVersion,
    payer: audit.payer,
  };
}

export class ProvenanceMismatchError extends Error {
  readonly provider: string;
  readonly claimedProvenance: Provenance;
  constructor(provider: string, claimedProvenance: Provenance) {
    super(
      `Cannot stamp provenance "${claimedProvenance}" for provider "${provider}": no matching live invocation in audit. ` +
        `This indicates a provenance-labeling bug.`,
    );
    this.name = "ProvenanceMismatchError";
    this.provider = provider;
    this.claimedProvenance = claimedProvenance;
  }
}

// Assert that claiming a particular provenance is honest. Called by the
// orchestrator before stamping any `live` label. In `NODE_ENV=test` this
// throws so the bug is caught loudly; in production it logs and returns
// "degraded" so a labeling bug doesn't blow up a paying request.
export function assertProvenanceHonest(opts: {
  provider: string;
  claimed: Provenance;
  envIsTest: boolean;
}): Provenance {
  if (opts.claimed !== "live") return opts.claimed;
  if (hasLiveInvocation(opts.provider)) return "live";
  if (opts.envIsTest) {
    throw new ProvenanceMismatchError(opts.provider, opts.claimed);
  }
  process.stderr.write(
    `${JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      event: "provenance_mismatch",
      provider: opts.provider,
      claimed: opts.claimed,
    })}\n`,
  );
  return "degraded";
}
