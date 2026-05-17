import { createMiddleware } from "hono/factory";
import { env } from "../env.js";

export const loggerMiddleware = createMiddleware(async (c, next) => {
  if (!env.ENABLE_REQUEST_LOG) {
    await next();
    return;
  }
  const start = performance.now();
  await next();
  const durationMs = Math.round((performance.now() - start) * 100) / 100;
  const line = {
    ts: new Date().toISOString(),
    requestId: c.get("requestId"),
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs,
  };
  // One JSON object per line — easy to grep / ship to Loki / Railway logs.
  process.stdout.write(`${JSON.stringify(line)}\n`);
});
