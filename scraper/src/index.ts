import { Hono } from "hono";
import { env } from "./env.js";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { loggerMiddleware } from "./middleware/logger.js";
import { corsMiddleware } from "./middleware/cors.js";
import { auditMiddleware } from "./middleware/audit.js";
import { originAttestation } from "./middleware/origin-attestation.js";
import { rateLimitPerIp } from "./middleware/rate-limit.js";
import { costCircuitMiddleware } from "./middleware/cost-limit.js";
import { handleError } from "./middleware/error-handler.js";
import { healthRoute } from "./routes/health.js";
import { sampleRoute } from "./routes/sample.js";
import { quoteRoute } from "./routes/quote.js";
import { diagnoseRoute } from "./routes/diagnose.js";
import { historyRoute } from "./routes/history.js";
import { walletRoute } from "./routes/wallet.js";

export function createApp() {
  const app = new Hono();

  app.use("*", requestIdMiddleware);
  // Audit middleware sits after request-id (it reads c.get("requestId")) and
  // before everything that issues provider calls — so the AsyncLocalStorage
  // context is live for the full handler stack.
  app.use("*", auditMiddleware);
  app.use("*", loggerMiddleware);
  app.use("*", corsMiddleware);

  app.onError(handleError);

  // Phase 5 — per-route abuse guards.
  //
  // /sample: rate-limited (high cap) + UA deny-list + cost circuit. Always
  //          allowed without X-Sniffy-Client per CLAUDE.md (judges hit it raw).
  // /quote:  rate-limited (low cap) + X-Sniffy-Client required + cost circuit.
  //          Per-tuple cap lands inside the route after body validation.
  // /diagnose: no rate-limit middleware — paid endpoint runs to completion.
  // /history: per-IP rate limit only; doesn't hit iTunes so no cost circuit.
  // /health/*: no guards — uptime monitors hit them freely.
  app.use(
    "/api/v1/aso/sample/*",
    originAttestation({ require: false }),
    rateLimitPerIp({
      namespace: "sample",
      perMinute: env.RL_SAMPLE_PER_MIN,
      perDay: env.RL_SAMPLE_PER_DAY,
    }),
  );
  app.use(
    "/api/v1/aso/quote/*",
    originAttestation({ require: true }),
    rateLimitPerIp({
      namespace: "quote",
      perMinute: env.RL_QUOTE_PER_MIN,
      perDay: env.RL_QUOTE_PER_DAY,
    }),
    costCircuitMiddleware(),
  );
  app.use(
    "/api/v1/aso/history/*",
    rateLimitPerIp({
      namespace: "history",
      perMinute: env.RL_HISTORY_PER_MIN,
      perDay: env.RL_HISTORY_PER_MIN * 60 * 12, // generous daily cap
    }),
  );
  // Wallet/Trail endpoints — free to call (signature is the auth, not x402).
  // Per-IP cap is generous because legitimate browsers refresh the list
  // every few minutes; abuse from one IP is bounded by Redis read cost.
  app.use(
    "/api/v1/aso/wallet/*",
    rateLimitPerIp({
      namespace: "wallet",
      perMinute: 60,
      perDay: 60 * 60 * 12,
    }),
  );

  app.route("/health", healthRoute);
  app.route("/api/v1/aso/sample", sampleRoute);
  app.route("/api/v1/aso/quote", quoteRoute);
  app.route("/api/v1/aso/diagnose", diagnoseRoute);
  app.route("/api/v1/aso/history", historyRoute);
  app.route("/api/v1/aso/wallet", walletRoute);

  return app;
}

export const app = createApp();
export default app;
