import { Hono } from "hono";
import {
  CountryCode,
  InsightsListResponse,
  type InsightsListResponse as InsightsListResponseType,
  Store,
} from "../schemas/index.js";
import {
  getShowcaseReport,
  listRecentShowcase,
} from "../insights/store.js";

// Sprint C — public insights surface. Two endpoints, both read-only and
// unauthenticated. Cache headers steer CDNs toward minute-scale caching;
// the underlying Redis store is the canonical truth and updates in real
// time as new /diagnose calls land.

export const insightsRoute = new Hono();

// GET /api/v1/aso/insights?store=ios&country=US&limit=50
//
// Returns the most-recent showcase entries (newest first). Defaults to
// (store=ios, country=US, limit=50). Schema-validates the filter inputs
// at the boundary; an unknown store/country returns 400.
insightsRoute.get("/", async (c) => {
  const storeRaw = c.req.query("store");
  const countryRaw = c.req.query("country");
  const limitRaw = c.req.query("limit");

  const store = storeRaw !== undefined ? Store.safeParse(storeRaw) : null;
  const country =
    countryRaw !== undefined ? CountryCode.safeParse(countryRaw) : null;

  if (store && !store.success) {
    return c.json(
      {
        error: {
          code: "invalid_query" as const,
          message: "store must be 'ios' or 'android'",
        },
      },
      400,
    );
  }
  if (country && !country.success) {
    return c.json(
      {
        error: {
          code: "invalid_query" as const,
          message: "country must be an ISO 3166-1 alpha-2 uppercase code",
        },
      },
      400,
    );
  }

  const limit = limitRaw !== undefined ? Number.parseInt(limitRaw, 10) : 50;
  if (!Number.isFinite(limit) || limit < 1 || limit > 200) {
    return c.json(
      {
        error: {
          code: "invalid_query" as const,
          message: "limit must be an integer in [1, 200]",
        },
      },
      400,
    );
  }

  const storeValue = store?.success ? store.data : undefined;
  const countryValue = country?.success ? country.data : undefined;

  const result = await listRecentShowcase({
    ...(storeValue !== undefined ? { store: storeValue } : {}),
    ...(countryValue !== undefined ? { country: countryValue } : {}),
    limit,
  });

  const response: InsightsListResponseType = {
    entries: result.entries,
    freshestAt: result.freshestAt,
    filters: {
      store: storeValue ?? null,
      country: countryValue ?? null,
      limit,
    },
  };

  // Encourage CDNs to cache for 60s. The underlying Redis store updates in
  // real time but the index doesn't need to be lock-step with every new
  // diagnose; a minute of staleness is fine for an SEO listing.
  c.header("Cache-Control", "public, max-age=60, s-maxage=60");
  return c.json(InsightsListResponse.parse(response));
});

// GET /api/v1/aso/insights/:store/:country/:appId
//
// Returns the PublicShowcaseReport for one tuple, or 404 when missing.
insightsRoute.get("/:store/:country/:appId", async (c) => {
  const storeParse = Store.safeParse(c.req.param("store"));
  const countryParse = CountryCode.safeParse(c.req.param("country"));
  const appId = c.req.param("appId");

  if (!storeParse.success || !countryParse.success || !appId) {
    return c.json(
      {
        error: {
          code: "invalid_query" as const,
          message: "store, country, appId path params required",
        },
      },
      400,
    );
  }

  const report = await getShowcaseReport(
    storeParse.data,
    countryParse.data,
    appId,
  );
  if (!report) {
    return c.json(
      {
        error: {
          code: "showcase_not_found" as const,
          message:
            "No public showcase exists for this (store, country, appId) tuple. " +
            "Either the diagnose was opted out (X-Sniffy-No-Index header) or the entry expired.",
        },
      },
      404,
    );
  }

  // Individual reports are immutable per save — the next diagnose for the
  // same tuple overwrites them. 5-minute CDN cache keeps the page snappy
  // without serving truly stale data on bursty re-diagnose flows.
  c.header("Cache-Control", "public, max-age=300, s-maxage=300");
  return c.json(report);
});
