import { z } from "zod";
import { Provenance, RankBucket, Confidence } from "@sniffy/scraper/schemas";
import { ApiError, ApiNetworkError, ApiValidationError } from "./errors";
import { getBaseUrl, SNIFFY_CLIENT_ID } from "./client";

// Phase 4 — client for GET /api/v1/aso/history.
//
// The server mints a wildcard `historySignature` HMAC at /diagnose
// settle-time and returns it in the paid response. The SDK reuses one
// signature across every keyword from the same paid request — no second
// x402 charge.
//
// We keep the response shape narrow: scraper returns more fields per
// sample, but the UI only needs position + bucket + confidence + provenance
// + searchedDepth + sampledAt to render the sparkline. Adding stricter
// validation here means a server-side schema drift surfaces as an
// ApiValidationError instead of silently rendering NaN bars.

const RankSampleSchema = z.object({
  position: z.number().int(),
  bucket: RankBucket,
  confidence: Confidence,
  provenance: Provenance,
  searchedDepth: z.number().int().nonnegative(),
  sampledAt: z.string(),
});

const HistoryResponseSchema = z.object({
  sniffId: z.string(),
  store: z.enum(["ios", "android"]),
  country: z.string(),
  appId: z.string(),
  keyword: z.string(),
  window: z.enum(["7d", "30d", "90d"]),
  series: z.array(RankSampleSchema),
});

export type RankSample = z.infer<typeof RankSampleSchema>;
export type HistoryResponse = z.infer<typeof HistoryResponseSchema>;

export interface GetHistoryInput {
  sniffId: string;
  store: "ios" | "android";
  country: string;
  appId: string;
  keyword: string;
  signature: string;
  window?: "7d" | "30d" | "90d";
}

export async function getHistory(
  input: GetHistoryInput,
  options: { signal?: AbortSignal } = {},
): Promise<HistoryResponse> {
  const params = new URLSearchParams({
    sniffId: input.sniffId,
    store: input.store,
    country: input.country,
    appId: input.appId,
    keyword: input.keyword,
    signature: input.signature,
    window: input.window ?? "30d",
  });
  const url = `${getBaseUrl()}/api/v1/aso/history?${params.toString()}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { "X-Sniffy-Client": SNIFFY_CLIENT_ID },
      signal: options.signal,
    });
  } catch (err) {
    throw new ApiNetworkError(
      "Request to /api/v1/aso/history failed before reaching the server",
      err,
    );
  }
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => "");
    }
    const headerCode = res.headers.get("x-sniffy-error-code") ?? undefined;
    const headerMessage = res.headers.get("x-sniffy-error-message") ?? undefined;
    const bodyError =
      body && typeof body === "object" && "error" in body
        ? (body as { error?: { code?: string; message?: string } }).error
        : undefined;
    const code = headerCode ?? bodyError?.code ?? `http_${res.status}`;
    const message =
      headerMessage ?? bodyError?.message ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, code, message, body);
  }
  let raw: unknown;
  try {
    raw = await res.json();
  } catch (err) {
    throw new ApiError(res.status, "invalid_json", "Response was not valid JSON", err);
  }
  try {
    return HistoryResponseSchema.parse(raw);
  } catch (err) {
    if (err instanceof Error) {
      throw new ApiValidationError(err.message, raw);
    }
    throw err;
  }
}
