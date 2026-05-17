import { cors } from "hono/cors";
import { env } from "../env.js";

export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) return origin;
    return env.ALLOWED_ORIGINS.includes(origin) ? origin : null;
  },
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "PAYMENT-SIGNATURE", "X-Request-ID"],
  exposeHeaders: ["X-Request-ID", "X-Sniffy-Error-Code"],
  maxAge: 86400,
});
