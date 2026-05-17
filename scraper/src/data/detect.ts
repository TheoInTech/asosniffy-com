import {
  type AppIdentifier,
  type CountryCode,
  type DetectedApp,
  type Provenance,
  type Store,
} from "../schemas/index.js";
import { normalizeAppIdentifier } from "../lib/app-identifier.js";
import { sampleQuote } from "./fixtures.js";
import { lookupApp, searchApps } from "../providers/apple/itunes.js";
import { lookupAppPreview } from "../providers/android/play-store.js";
import type { AppRecord } from "../providers/apple/types.js";
import { withCache } from "../cache/wrapper.js";
import { cacheKey } from "../cache/keys.js";
import { CACHE_TTL } from "../cache/ttl.js";

export interface DetectInput {
  store: Store;
  app: AppIdentifier;
  country: CountryCode;
}

export interface DetectResult {
  detectedApp: DetectedApp;
  provenance: Provenance;
  // Full provider record when available — lets downstream callers (shallow
  // scan, full-report orchestrator) reuse subtitle, ratings, etc. without
  // refetching. `null` when we fell back to fixture.
  appRecord: AppRecord | null;
}

// Resolve app identity from a user-supplied identifier.
//
// iOS path:   appId → iTunes lookup; name → iTunes search (top hit); url
//             that didn't yield an appId → fixture fallback.
// Android:    always fixture preview for MVP (PLAN.md §11). Caller's input
//             is reflected so the response feels shaped-real.
//
// On any provider error (rate-limited / network / not-found), the function
// returns the fixture overlay with provenance="fixture" rather than
// throwing — every state must produce a valid response (PLAN.md §14).
export async function getDetectedApp(input: DetectInput): Promise<DetectResult> {
  if (input.store === "android") {
    return resolveAndroidPreview(input);
  }
  return resolveIos(input);
}

async function resolveIos(input: DetectInput): Promise<DetectResult> {
  const normalized = normalizeAppIdentifier(input.app);

  if (normalized.kind === "appId") {
    const result = await withCache(
      () => lookupApp({ id: normalized.value, country: input.country }),
      {
        key: cacheKey({
          namespace: "apple:lookup",
          country: input.country,
          appId: normalized.value,
        }),
        ttlSeconds: CACHE_TTL.appMetadata,
        namespace: "apple:lookup",
      },
    );
    if (!("error" in result)) {
      return {
        detectedApp: extractDetectedApp(result),
        provenance: result.provenance,
        appRecord: result,
      };
    }
    return fixtureFallback({ id: normalized.value });
  }

  if (normalized.kind === "name") {
    const results = await withCache(
      () =>
        searchApps({
          term: normalized.value,
          country: input.country,
          limit: 50,
        }),
      {
        key: cacheKey({
          namespace: "apple:search",
          country: input.country,
          extra: { term: normalized.value.toLowerCase(), limit: 50 },
        }),
        ttlSeconds: CACHE_TTL.appMetadata,
        namespace: "apple:search",
      },
    );
    if (!("error" in results) && results.length > 0) {
      const top = results[0]!;
      return {
        detectedApp: extractDetectedApp(top),
        provenance: top.provenance,
        appRecord: top,
      };
    }
    return fixtureFallback({ name: normalized.value });
  }

  // url with no extractable appId — server-side URL resolution is post-MVP.
  return fixtureFallback({});
}

async function resolveAndroidPreview(input: DetectInput): Promise<DetectResult> {
  const normalized = normalizeAppIdentifier(input.app);
  const packageName =
    normalized.kind === "appId" || normalized.kind === "name"
      ? normalized.value
      : "com.example.unknown";

  const preview = await withCache(
    () =>
      lookupAppPreview({
        packageName,
        country: input.country,
      }),
    {
      key: cacheKey({
        namespace: "android:lookup",
        country: input.country,
        appId: packageName,
      }),
      ttlSeconds: CACHE_TTL.androidPreview,
      namespace: "android:lookup",
    },
  );

  return {
    detectedApp: {
      id: preview.packageName,
      name: preview.name,
      developer: preview.developer,
    },
    provenance: preview.provenance,
    appRecord: null,
  };
}

function extractDetectedApp(record: AppRecord): DetectedApp {
  return {
    id: record.id,
    name: record.name,
    developer: record.developer,
  };
}

function fixtureFallback(overlay: { id?: string; name?: string }): DetectResult {
  return {
    detectedApp: {
      ...sampleQuote.detectedApp,
      ...(overlay.id !== undefined ? { id: overlay.id } : {}),
      ...(overlay.name !== undefined ? { name: overlay.name } : {}),
    },
    provenance: "fixture",
    appRecord: null,
  };
}
