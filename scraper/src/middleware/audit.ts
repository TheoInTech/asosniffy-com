import { createMiddleware } from "hono/factory";
import {
  createRequestAudit,
  summarizeAudit,
  withRequestAudit,
  type RequestAudit,
} from "../observability/audit.js";

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

  await withRequestAudit(audit, async () => {
    await next();
  });

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
  }
});
