import { Hono } from "hono";
import { requestIdMiddleware } from "./middleware/request-id.js";
import { loggerMiddleware } from "./middleware/logger.js";
import { corsMiddleware } from "./middleware/cors.js";
import { handleError } from "./middleware/error-handler.js";
import { healthRoute } from "./routes/health.js";
import { sampleRoute } from "./routes/sample.js";
import { quoteRoute } from "./routes/quote.js";
import { diagnoseRoute } from "./routes/diagnose.js";

export function createApp() {
  const app = new Hono();

  app.use("*", requestIdMiddleware);
  app.use("*", loggerMiddleware);
  app.use("*", corsMiddleware);

  app.onError(handleError);

  app.route("/health", healthRoute);
  app.route("/api/v1/aso/sample", sampleRoute);
  app.route("/api/v1/aso/quote", quoteRoute);
  app.route("/api/v1/aso/diagnose", diagnoseRoute);

  return app;
}

export const app = createApp();
export default app;
