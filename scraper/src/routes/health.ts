import { Hono } from "hono";
import { env } from "../env.js";
import { SCHEMA_VERSION } from "../schemas/index.js";
import { getMetrics } from "../cache/metrics.js";
import { getCacheClient } from "../cache/redis.js";

export const healthRoute = new Hono();

healthRoute.get("/", (c) =>
  c.json({
    ok: true,
    schemaVersion: SCHEMA_VERSION,
    network: env.MORPH_NETWORK,
  }),
);

healthRoute.get("/metrics", (c) =>
  c.json({
    ...getMetrics(),
    cacheBackend: getCacheClient().backend,
  }),
);
