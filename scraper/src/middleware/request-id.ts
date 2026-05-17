import { createMiddleware } from "hono/factory";
import { newRequestId } from "../utils/ids.js";
import type { RequestId } from "../schemas/index.js";

declare module "hono" {
  interface ContextVariableMap {
    requestId: RequestId;
    parsedBody: unknown;
  }
}

export const requestIdMiddleware = createMiddleware(async (c, next) => {
  const id = newRequestId();
  c.set("requestId", id);
  await next();
  c.res.headers.set("X-Request-ID", id);
});
