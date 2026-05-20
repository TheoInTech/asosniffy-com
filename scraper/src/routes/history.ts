import { Hono } from "hono";
import { z } from "zod";
import { CountryCode, SniffId, Store } from "../schemas/index.js";
import { getRankSeries, type RankSample } from "../cache/timeseries.js";
import { verifyWildcardForRequest } from "../lib/history-hmac.js";
import { env } from "../env.js";

export const historyRoute = new Hono();

const QueryParams = z.object({
  sniffId: SniffId,
  store: Store,
  country: CountryCode,
  appId: z.string().min(1),
  keyword: z.string().min(1),
  signature: z.string().min(1),
  window: z
    .enum(["7d", "30d", "90d"])
    .optional()
    .default("30d"),
});

historyRoute.get("/", async (c) => {
  if (!env.RANK_HISTORY_ENABLED) {
    return c.json(
      {
        error: {
          code: "history_disabled",
          message:
            "Rank history is disabled in this environment. Set RANK_HISTORY_ENABLED=true to enable.",
        },
      },
      503,
    );
  }
  if (!env.SNIFFY_HISTORY_HMAC_SECRET) {
    return c.json(
      {
        error: {
          code: "history_disabled",
          message:
            "Rank history endpoint is not configured (SNIFFY_HISTORY_HMAC_SECRET missing).",
        },
      },
      503,
    );
  }

  const parsed = QueryParams.safeParse({
    sniffId: c.req.query("sniffId"),
    store: c.req.query("store"),
    country: c.req.query("country"),
    appId: c.req.query("appId"),
    keyword: c.req.query("keyword"),
    signature: c.req.query("signature"),
    window: c.req.query("window") ?? "30d",
  });
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: "invalid_query",
          message: "Missing or malformed query parameters",
          details: parsed.error.issues,
        },
      },
      400,
    );
  }

  const { sniffId, store, country, appId, keyword, signature, window } =
    parsed.data;

  // Verify the wildcard signature ties this caller to a paid /diagnose for
  // (sniffId, store, country, appId). The signature is keyword-agnostic
  // within that scope so the SDK can fetch every keyword's series without
  // re-minting per keyword. Constant-time comparison inside verifyWildcardForRequest.
  if (!verifyWildcardForRequest({ sniffId, store, country, appId }, signature)) {
    return c.json(
      {
        error: {
          code: "invalid_signature",
          message:
            "Signature did not verify. /history is only accessible to callers who paid for the original /diagnose; pass the historySignature returned in that response.",
        },
      },
      401,
    );
  }

  const windowDays =
    window === "7d" ? 7 : window === "30d" ? 30 : 90;

  let series: RankSample[];
  try {
    series = await getRankSeries({
      store,
      country,
      appId,
      keyword,
      windowDays,
    });
  } catch (err) {
    return c.json(
      {
        error: {
          code: "internal_error",
          message: `Failed to read rank history: ${(err as Error).message}`,
        },
      },
      500,
    );
  }

  return c.json({
    sniffId,
    store,
    country,
    appId,
    keyword,
    window,
    series,
  });
});
