import {
  type AppIdentifier,
  type Confidence,
  type CountryCode,
  type CoverageProviderError,
  type DetectedApp,
  type Provenance,
  type ShallowScanCandidate,
  type Store,
} from "../schemas/index.js";
import { normalizeAppIdentifier } from "../lib/app-identifier.js";
import { sampleQuote } from "./fixtures.js";
import { lookupApp, searchApps } from "../providers/apple/itunes.js";
import {
  lookupApp as lookupAndroidApp,
  searchApps as searchAndroidApps,
} from "../providers/android/play-store.js";
import type { AppRecord, AppleProviderError } from "../providers/apple/types.js";
import type {
  AndroidAppRecord,
  AndroidProviderError,
} from "../providers/android/types.js";
import { withCache } from "../cache/wrapper.js";
import { cacheKey } from "../cache/keys.js";
import { CACHE_TTL } from "../cache/ttl.js";
import { env } from "../env.js";
import { similarityScore } from "./identity.js";
import { identityConfidenceFromScore } from "../scoring/confidence.js";
import { toProviderError } from "../providers/_lib/errors.js";

export interface DetectInput {
  store: Store;
  app: AppIdentifier;
  country: CountryCode;
  // When true, /sample-style fixture fallback is allowed on provider error.
  // /quote and /diagnose pass false — they prefer to surface a `degraded`
  // row over a fixture substitute (Phase 1 honest-floor policy).
  allowFixtureFallback?: boolean;
}

export interface DetectResult {
  detectedApp: DetectedApp;
  provenance: Provenance;
  // Full provider record when available — lets downstream callers (shallow
  // scan, full-report orchestrator) reuse subtitle, ratings, etc. without
  // refetching. `null` when we fell back to fixture or degraded. Apple
  // records carry iTunes-specific fields; Android records carry Play
  // Store-specific fields — caller branches on `store`.
  appRecord: AppRecord | null;
  androidRecord: AndroidAppRecord | null;
  // How confident we are this is the right app. Drives the confidence cap
  // on every downstream keyword-rank label (see scoring/confidence.ts).
  identityConfidence: Confidence;
  // Ambiguous-name candidates surfaced to the UI when identityConfidence is
  // < "medium". Empty when detection was unambiguous (appId lookup, or
  // top-result similarity ≥ 0.85).
  candidates: ShallowScanCandidate[];
  // Provider failures observed during this detect call. Surfaced through
  // coverage.providerErrors[] so the UI can render the failure reason.
  providerErrors: CoverageProviderError[];
}

const APPLE_PROVIDER = "apple-itunes";
const GOOGLE_PROVIDER = "google-play";

// Resolve app identity from a user-supplied identifier.
//
// iOS path:
//   - numeric appId → iTunes /lookup (high confidence on success)
//   - app name → iTunes /search, then similarity-score the top results to
//     find the best match. Returns candidates[] when ambiguous.
//   - url → normalized to appId upstream (lib/app-identifier.ts); if the URL
//     can't be parsed, we degrade rather than fixture-substitute.
//
// Android (Phase 2):
//   - appId (reverse-DNS) → gplay.app({appId})
//   - name → gplay.search({term}), disambiguate, choose top match
//   - kill-switch via GOOGLE_PLAY_PROVIDER=disabled falls through to a
//     fixture preview labeled fixture (only allowed in /sample).
//
// Provenance discipline (Phase 1+2):
//   - Provider success → "live"
//   - Cache hit       → "cached"  (the cache wrapper does the rewrite)
//   - Provider error  → "degraded" (not "fixture") unless
//                       allowFixtureFallback is true (i.e. /sample only)
export async function getDetectedApp(input: DetectInput): Promise<DetectResult> {
  if (input.store === "android") {
    return resolveAndroid(input);
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
        audit: { provider: APPLE_PROVIDER, endpoint: "/lookup" },
      },
    );
    if (!("error" in result)) {
      return {
        detectedApp: extractDetectedApp(result),
        provenance: result.provenance,
        appRecord: result,
        androidRecord: null,
        identityConfidence: "high",
        candidates: [],
        providerErrors: [],
      };
    }
    return appleErrorOrFixture({
      input,
      error: result,
      endpoint: "/lookup",
      overlay: { id: normalized.value },
    });
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
        audit: { provider: APPLE_PROVIDER, endpoint: "/search" },
      },
    );
    if ("error" in results) {
      return appleErrorOrFixture({
        input,
        error: results,
        endpoint: "/search",
        overlay: { name: normalized.value },
      });
    }
    if (results.length === 0) {
      return {
        detectedApp: {
          id: "unknown",
          name: normalized.value,
          developer: "Unknown",
        },
        provenance: "degraded",
        appRecord: null,
        androidRecord: null,
        identityConfidence: "low",
        candidates: [],
        providerErrors: [
          {
            provider: APPLE_PROVIDER,
            kind: "not_found",
            message: `No App Store results for "${normalized.value}" in ${input.country}`,
          },
        ],
      };
    }
    return disambiguateIos(normalized.value, results);
  }

  return appleErrorOrFixture({
    input,
    error: { error: "not_found" },
    endpoint: "/lookup",
    overlay: {},
  });
}

async function resolveAndroid(input: DetectInput): Promise<DetectResult> {
  // Kill-switch: GOOGLE_PLAY_PROVIDER=disabled returns a fixture-shaped
  // result. Only allowed in /sample; otherwise propagates as degraded so
  // callers see the explicit "Android is off" signal.
  if (env.GOOGLE_PLAY_PROVIDER === "disabled") {
    return androidUnsupported(input);
  }

  const normalized = normalizeAppIdentifier(input.app);

  // Reverse-DNS-looking strings get treated as a packageName; numeric IDs
  // also fall into appId by app-identifier.ts but Play Store doesn't accept
  // numeric IDs — caller will get a 404 via the search path which we then
  // surface as a candidates[] list.
  const looksLikePackage =
    normalized.kind === "appId" && /\./.test(normalized.value);

  if (looksLikePackage) {
    const record = await withCache(
      () =>
        lookupAndroidApp({
          packageName: normalized.value,
          country: input.country,
        }),
      {
        key: cacheKey({
          namespace: "android:lookup",
          country: input.country,
          appId: normalized.value,
        }),
        ttlSeconds: CACHE_TTL.androidPreview,
        namespace: "android:lookup",
        audit: { provider: GOOGLE_PROVIDER, endpoint: "/details" },
      },
    );
    if (!("error" in record)) {
      return {
        detectedApp: {
          id: record.packageName,
          name: record.name,
          developer: record.developer,
        },
        provenance: record.provenance,
        appRecord: null,
        androidRecord: record,
        // packageName lookup is the highest-confidence Android path.
        identityConfidence: "high",
        candidates: [],
        providerErrors: [],
      };
    }
    return androidErrorOrFixture({
      input,
      error: record,
      endpoint: "/details",
      overlay: { id: normalized.value },
    });
  }

  // Treat anything else as a search term.
  const term =
    normalized.kind === "name"
      ? normalized.value
      : normalized.kind === "appId"
        ? normalized.value
        : "";
  if (term.length === 0) {
    return androidErrorOrFixture({
      input,
      error: { error: "not_found" },
      endpoint: "/search",
      overlay: {},
    });
  }

  const results = await withCache(
    () =>
      searchAndroidApps({
        term,
        country: input.country,
        limit: 50,
      }),
    {
      key: cacheKey({
        namespace: "android:search",
        country: input.country,
        extra: { term: term.toLowerCase(), limit: 50 },
      }),
      ttlSeconds: CACHE_TTL.androidPreview,
      namespace: "android:search",
      audit: { provider: GOOGLE_PROVIDER, endpoint: "/search" },
    },
  );
  if ("error" in results) {
    return androidErrorOrFixture({
      input,
      error: results,
      endpoint: "/search",
      overlay: { name: term },
    });
  }
  if (results.length === 0) {
    return {
      detectedApp: {
        id: "unknown",
        name: term,
        developer: "Unknown",
      },
      provenance: "degraded",
      appRecord: null,
      androidRecord: null,
      identityConfidence: "low",
      candidates: [],
      providerErrors: [
        {
          provider: GOOGLE_PROVIDER,
          kind: "not_found",
          message: `No Play Store results for "${term}" in ${input.country}`,
        },
      ],
    };
  }
  return disambiguateAndroid(term, results);
}

interface AppleErrorOrFixtureArgs {
  input: DetectInput;
  error: AppleProviderError;
  endpoint: string;
  overlay: { id?: string; name?: string };
}

function appleErrorOrFixture(args: AppleErrorOrFixtureArgs): DetectResult {
  if (args.input.allowFixtureFallback) {
    return fixtureFallback(args.overlay);
  }
  const provErr = toProviderError({
    provider: APPLE_PROVIDER,
    endpoint: args.endpoint,
    legacy: args.error,
  });
  return {
    detectedApp: {
      id: args.overlay.id ?? "unknown",
      name: args.overlay.name ?? "Unknown",
      developer: "Unknown",
    },
    provenance: "degraded",
    appRecord: null,
    androidRecord: null,
    identityConfidence: "low",
    candidates: [],
    providerErrors: [
      {
        provider: APPLE_PROVIDER,
        kind: provErr.kind,
        message: provErr.message,
      },
    ],
  };
}

interface AndroidErrorOrFixtureArgs {
  input: DetectInput;
  error: AndroidProviderError;
  endpoint: string;
  overlay: { id?: string; name?: string };
}

function androidErrorOrFixture(args: AndroidErrorOrFixtureArgs): DetectResult {
  if (args.input.allowFixtureFallback) {
    return fixtureFallback(args.overlay);
  }
  const legacyKind = args.error.error;
  const kind =
    legacyKind === "rate_limited"
      ? ("rate_limited" as const)
      : legacyKind === "not_found"
        ? ("not_found" as const)
        : legacyKind === "blocked"
          ? ("upstream_unavailable" as const)
          : ("network_error" as const);
  return {
    detectedApp: {
      id: args.overlay.id ?? "unknown",
      name: args.overlay.name ?? "Unknown",
      developer: "Unknown",
    },
    provenance: "degraded",
    appRecord: null,
    androidRecord: null,
    identityConfidence: "low",
    candidates: [],
    providerErrors: [
      {
        provider: GOOGLE_PROVIDER,
        kind,
        message: `google-play ${args.endpoint}: ${legacyKind}`,
      },
    ],
  };
}

function androidUnsupported(input: DetectInput): DetectResult {
  if (input.allowFixtureFallback) {
    return fixtureFallback({});
  }
  return {
    detectedApp: { id: "unknown", name: "Unknown", developer: "Unknown" },
    provenance: "degraded",
    appRecord: null,
    androidRecord: null,
    identityConfidence: "low",
    candidates: [],
    providerErrors: [
      {
        provider: GOOGLE_PROVIDER,
        kind: "upstream_unavailable",
        message:
          "Google Play provider disabled via GOOGLE_PLAY_PROVIDER=disabled.",
      },
    ],
  };
}

function disambiguateIos(
  query: string,
  results: readonly AppRecord[],
): DetectResult {
  if (results.length === 0) {
    return {
      detectedApp: { id: "unknown", name: query, developer: "Unknown" },
      provenance: "degraded",
      appRecord: null,
      androidRecord: null,
      identityConfidence: "low",
      candidates: [],
      providerErrors: [],
    };
  }
  const scored = results
    .map((record) => ({ record, score: similarityScore(query, record) }))
    .sort((a, b) => b.score - a.score);
  const top = scored[0]!;
  const identityConfidence = identityConfidenceFromScore(top.score);
  const candidates: ShallowScanCandidate[] =
    identityConfidence === "high"
      ? []
      : scored.slice(0, 5).map((s) => ({
          id: s.record.id,
          name: s.record.name,
          developer: s.record.developer,
          ...(s.record.iconUrl !== undefined ? { iconUrl: s.record.iconUrl } : {}),
          similarityScore: Math.round(s.score * 100) / 100,
        }));
  return {
    detectedApp: extractDetectedApp(top.record),
    provenance: top.record.provenance,
    appRecord: top.record,
    androidRecord: null,
    identityConfidence,
    candidates,
    providerErrors: [],
  };
}

function disambiguateAndroid(
  query: string,
  results: readonly AndroidAppRecord[],
): DetectResult {
  if (results.length === 0) {
    return {
      detectedApp: { id: "unknown", name: query, developer: "Unknown" },
      provenance: "degraded",
      appRecord: null,
      androidRecord: null,
      identityConfidence: "low",
      candidates: [],
      providerErrors: [],
    };
  }
  const scored = results
    .map((record) => ({ record, score: similarityScore(query, record) }))
    .sort((a, b) => b.score - a.score);
  const top = scored[0]!;
  const identityConfidence = identityConfidenceFromScore(top.score);
  const candidates: ShallowScanCandidate[] =
    identityConfidence === "high"
      ? []
      : scored.slice(0, 5).map((s) => ({
          id: s.record.packageName,
          name: s.record.name,
          developer: s.record.developer,
          ...(s.record.iconUrl !== undefined ? { iconUrl: s.record.iconUrl } : {}),
          similarityScore: Math.round(s.score * 100) / 100,
        }));
  return {
    detectedApp: {
      id: top.record.packageName,
      name: top.record.name,
      developer: top.record.developer,
    },
    provenance: top.record.provenance,
    appRecord: null,
    androidRecord: top.record,
    identityConfidence,
    candidates,
    providerErrors: [],
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
    androidRecord: null,
    identityConfidence: "low",
    candidates: [],
    providerErrors: [],
  };
}
