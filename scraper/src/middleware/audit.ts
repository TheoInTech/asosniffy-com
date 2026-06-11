import { createMiddleware } from "hono/factory";
import {
  createRequestAudit,
  summarizeAudit,
  withRequestAudit,
  type RequestAudit,
} from "../observability/audit.js";
import { funnelStageFor, recordFunnelStage } from "../observability/funnel.js";
import {
  createCogsLedger,
  summarizeCogs,
  withCogsLedger,
  type CogsLedger,
} from "../observability/cogs-ledger.js";

declare module "hono" {
  interface ContextVariableMap {
    cogsLedger: CogsLedger;
  }
}

declare module "hono" {
  interface ContextVariableMap {
    audit: RequestAudit;
  }
}

// Per-request audit middleware. Creates a RequestAudit at the top of the
// stack and runs the rest of the handler inside `withRequestAudit` so every
// provider call (deep in the orchestrator) can record an invocation via
// the AsyncLocalStorage-backed `recordInvocation(...)` without taking the
// audit as a parameter.
//
// Emits one structured log line per request on completion. Secrets are not
// in the audit — we only stored response hashes — so this is safe to log.
export const auditMiddleware = createMiddleware(async (c, next) => {
  const requestId = c.get("requestId");
  const route = `${c.req.method} ${c.req.path}`;
  const audit = createRequestAudit(requestId, route);
  c.set("audit", audit);
  // Cost-aware pricing — per-request COGS ledger nested inside the audit
  // scope. The route stamps revenue + budget; every LLM/vision call records
  // its spend; we log margin below.
  const cogsLedger = createCogsLedger(requestId, route);
  c.set("cogsLedger", cogsLedger);

  await withRequestAudit(audit, async () => {
    await withCogsLedger(cogsLedger, async () => {
      await next();
    });
  });

  // Promote the attestation parsed by the per-route origin-attestation
  // middleware into the audit record. Origin-attestation runs *inside*
  // next(), so by the time we get here c.get("clientAttestation") is set
  // for routes that mount it (and a header was present). Undefined on
  // routes that don't enforce it (e.g. /sample) or anonymous callers.
  const attestation = c.get("clientAttestation");
  if (attestation !== undefined) {
    audit.clientSurface = attestation.clientSurface;
    audit.clientVersion = attestation.clientVersion;
  }

  // Wave 0.4 — demand-funnel counter (quote_success / diagnose_402 /
  // diagnose_paid by client surface). Hono resolves errors to a response via
  // app.onError *before* the middleware chain unwinds, so c.res.status is the
  // final status here even when the handler threw PaymentRequiredError.
  // recordFunnelStage never throws.
  const stage = funnelStageFor(route, c.res.status);
  if (stage !== null) {
    await recordFunnelStage(stage, attestation?.clientSurface ?? "anonymous");
  }

  // After the handler runs, drop a single structured log line summarizing
  // every provider invocation. Skipped when ENABLE_REQUEST_LOG=false (set in
  // tests) so vitest output stays readable.
  if (process.env.ENABLE_REQUEST_LOG !== "false") {
    const summary = summarizeAudit(audit);
    process.stdout.write(
      `${JSON.stringify({
        ts: new Date().toISOString(),
        level: "info",
        event: "request_audit",
        ...summary,
      })}\n`,
    );
    // Cost-aware pricing — one margin line per request. Only emitted when the
    // request actually accrued COGS or set revenue (skips /sample, /health,
    // and other no-spend routes so the log stays signal). overBudget=true is
    // the alert: a section's actual cost exceeded its reserved projection.
    const cogs = summarizeCogs(cogsLedger);
    if (cogs.totalCogsCents > 0 || cogs.revenueCents !== null) {
      process.stdout.write(
        `${JSON.stringify({
          ts: new Date().toISOString(),
          level: cogs.overBudget ? "warn" : "info",
          event: "cogs_ledger",
          ...cogs,
        })}\n`,
      );
    }
  }
});
