import { serve } from "@hono/node-server";
import { app } from "./index.js";
import { env } from "./env.js";

const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    process.stdout.write(
      `${JSON.stringify({
        ts: new Date().toISOString(),
        event: "listening",
        port: info.port,
        network: env.MORPH_NETWORK,
        mode: env.MORPH_FACILITATOR_MODE,
      })}\n`,
    );
  },
);

function shutdown(signal: string): void {
  process.stdout.write(
    `${JSON.stringify({
      ts: new Date().toISOString(),
      event: "shutdown",
      signal,
    })}\n`,
  );
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
