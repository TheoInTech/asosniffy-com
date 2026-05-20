import { lookupApp } from "./itunes.js";
import { withCache } from "../../cache/wrapper.js";
import { cacheKey } from "../../cache/keys.js";
import { CACHE_TTL } from "../../cache/ttl.js";
import type { AppRecord, AppleProviderError } from "./types.js";

// Multi-storefront iTunes lookup. Phase 2 ships the data path so Phase 5
// (localization gap analysis) can exercise it without further provider
// work — the gap-detection module just consumes the map this returns.
//
// iTunes /lookup honors `?country=` and returns localized metadata per
// storefront — `trackName`, `description`, `releaseNotes`, `primaryGenreName`.

export interface MultiStorefrontResult {
  storefronts: Record<string, AppRecord | AppleProviderError>;
}

export async function lookupLocalized(
  appId: string,
  countries: readonly string[],
): Promise<MultiStorefrontResult> {
  // De-dupe and uppercase country codes for stable cache keys.
  const uniq = Array.from(new Set(countries.map((c) => c.toUpperCase())));

  const entries = await Promise.all(
    uniq.map(async (country) => {
      const result = await withCache(
        () => lookupApp({ id: appId, country }),
        {
          key: cacheKey({
            namespace: "apple:lookup",
            country,
            appId,
          }),
          ttlSeconds: CACHE_TTL.appMetadata,
          namespace: "apple:lookup",
          audit: { provider: "apple-itunes", endpoint: "/lookup" },
        },
      );
      return [country, result] as const;
    }),
  );

  const storefronts: Record<string, AppRecord | AppleProviderError> = {};
  for (const [country, result] of entries) {
    storefronts[country] = result;
  }
  return { storefronts };
}
