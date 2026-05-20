// Provider error taxonomy. Replaces the binary `live | error` collapse that
// caused transient iTunes 429s to be recorded as `provenance: "fixture"`.
//
// Every classified error carries enough context for downstream callers to
// decide between (a) caching a negative result, (b) surfacing a `degraded`
// row, or (c) falling back to fixture — which is allowed ONLY in /sample.

export type ProviderErrorKind =
  | "rate_limited"
  | "schema_drift"
  | "not_found"
  | "upstream_unavailable"
  | "network_error"
  | "partial";

export interface ProviderError {
  readonly kind: ProviderErrorKind;
  readonly provider: string;
  readonly endpoint: string;
  readonly message: string;
  readonly retryAfterSec?: number;
  readonly httpStatus?: number;
}

// Legacy envelope shape returned by Apple providers. Kept stable so existing
// provider tests continue to assert against `{ error: "..." }` while the
// orchestrator-side error type gains richer fields via `toProviderError`.
export type LegacyProviderEnvelope =
  | { error: "rate_limited" }
  | { error: "not_found" }
  | { error: "network_error" }
  | { error: "blocked" };

export function isLegacyEnvelope(value: unknown): value is LegacyProviderEnvelope {
  if (typeof value !== "object" || value === null) return false;
  if (!("error" in (value as Record<string, unknown>))) return false;
  const e = (value as Record<string, unknown>).error;
  return (
    e === "rate_limited" ||
    e === "not_found" ||
    e === "network_error" ||
    e === "blocked"
  );
}

export function isProviderError(value: unknown): value is ProviderError {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.kind === "string" &&
    typeof v.provider === "string" &&
    typeof v.endpoint === "string" &&
    typeof v.message === "string"
  );
}

export interface ToProviderErrorInput {
  provider: string;
  endpoint: string;
  legacy: LegacyProviderEnvelope;
  httpStatus?: number;
  retryAfterSec?: number;
}

export function toProviderError(input: ToProviderErrorInput): ProviderError {
  const kindMap: Record<LegacyProviderEnvelope["error"], ProviderErrorKind> = {
    rate_limited: "rate_limited",
    not_found: "not_found",
    network_error: "network_error",
    blocked: "upstream_unavailable",
  };
  const kind = kindMap[input.legacy.error];
  const base: ProviderError = {
    kind,
    provider: input.provider,
    endpoint: input.endpoint,
    message: `${input.provider} ${input.endpoint}: ${input.legacy.error}`,
  };
  if (input.httpStatus !== undefined && input.retryAfterSec !== undefined) {
    return {
      ...base,
      httpStatus: input.httpStatus,
      retryAfterSec: input.retryAfterSec,
    };
  }
  if (input.httpStatus !== undefined) {
    return { ...base, httpStatus: input.httpStatus };
  }
  if (input.retryAfterSec !== undefined) {
    return { ...base, retryAfterSec: input.retryAfterSec };
  }
  return base;
}

// Map error kinds to the provenance verdict the caller should stamp. Honest
// outage-vs-fake distinction: every kind except `not_found` degrades to
// `degraded`. `not_found` is a successful provider call with an empty result —
// the caller decides whether that's `live` (yes, app definitely isn't there)
// or `degraded` (we don't know yet, partial data).
export function provenanceForErrorKind(
  kind: ProviderErrorKind,
): "degraded" | "live" {
  if (kind === "not_found") return "live";
  return "degraded";
}

export function describeError(error: ProviderError): string {
  const status = error.httpStatus !== undefined ? ` (HTTP ${error.httpStatus})` : "";
  const retry =
    error.retryAfterSec !== undefined
      ? ` retry in ${error.retryAfterSec}s`
      : "";
  return `${error.message}${status}${retry}`;
}
