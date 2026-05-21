import { cors } from "hono/cors";
import { env } from "../env.js";

export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) return origin;
    return env.ALLOWED_ORIGINS.includes(origin) ? origin : null;
  },
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: [
    "Authorization",
    "Content-Type",
    "PAYMENT-SIGNATURE",
    "X-Request-ID",
    "X-Sniffy-Client",
  ],
  exposeHeaders: [
    "X-Request-ID",
    "X-Sniffy-Error-Code",
    "X-Sniffy-Error-Message",
    "PAYMENT-REQUIRED",
    "PAYMENT-RESPONSE",
  ],
  maxAge: env.NODE_ENV === "development" ? 60 : 86400,
});
