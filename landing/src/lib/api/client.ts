import {
  DiagnosePaidResponse,
  DiagnoseUnpaidResponse,
  type DiagnoseRequest,
  type QuoteRequest,
  QuoteResponse,
  SampleResponse,
} from "@sniffy/scraper/schemas";
import {
  ApiError,
  ApiNetworkError,
  ApiValidationError,
  PaymentRequiredError,
  type ProtocolTraceEntry,
} from "./errors";

const DEFAULT_BASE_URL = "http://localhost:3001";

// Identifies this surface to the scraper's soft attestation middleware so
// the per-request audit log carries clientSurface=landing. Bump the version
// manually in sync with package.json on minor releases — drift is a logging
// concern, not a protocol one.
// Exported so sibling modules (history.ts) can share the same client ID
// without duplicating the version string.
export const SNIFFY_CLIENT_ID = "@sniffy/landing@0.0.0";

export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SCRAPER_BASE_URL ?? DEFAULT_BASE_URL;
}

interface RequestOptions {
  signal?: AbortSignal;
  paymentHeader?: string;
  onProtocolTrace?: (entry: ProtocolTraceEntry) => void;
}

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

async function postJSON<T>(
  path: string,
  body: unknown,
  parser: (raw: unknown) => T,
  options: RequestOptions = {},
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Sniffy-Client": SNIFFY_CLIENT_ID,
    ...(options.paymentHeader ? { "PAYMENT-SIGNATURE": options.paymentHeader } : {}),
  };
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch (err) {
    throw new ApiNetworkError(
      `Request to ${path} failed before reaching the server`,
      err,
    );
  }

  const responseHeaders = headersToRecord(res.headers);
  const durationMs = Math.round(performance.now() - t0);

  if (res.status === 402) {
    let raw: unknown;
    try {
      raw = await res.json();
    } catch (err) {
      throw new ApiError(402, "payment_required_malformed", "Server returned 402 without a parseable body", err);
    }
    if (options.onProtocolTrace) {
      options.onProtocolTrace({
        url,
        method: "POST",
        requestHeaders,
        requestBody: body,
        status: 402,
        responseHeaders,
        responseBody: raw,
        startedAt,
        durationMs,
      });
    }
    const parsed = DiagnoseUnpaidResponse.safeParse(raw);
    if (!parsed.success) {
      throw new ApiValidationError(
        parsed.error.issues.map((i) => i.message).join("; "),
        raw,
      );
    }
    const serverCode = res.headers.get("x-sniffy-error-code") ?? undefined;
    const serverMessage = res.headers.get("x-sniffy-error-message") ?? undefined;
    throw new PaymentRequiredError(parsed.data, serverCode, serverMessage);
  }

  if (!res.ok) {
    throw await buildNonOkApiError(res, path);
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch (err) {
    throw new ApiError(res.status, "invalid_json", "Response was not valid JSON", err);
  }
  if (options.onProtocolTrace) {
    options.onProtocolTrace({
      url,
      method: "POST",
      requestHeaders,
      requestBody: body,
      status: res.status,
      responseHeaders,
      responseBody: raw,
      startedAt,
      durationMs,
    });
  }
  try {
    return parser(raw);
  } catch (err) {
    if (err instanceof Error) {
      throw new ApiValidationError(err.message, raw);
    }
    throw err;
  }
}

// Build an ApiError for a non-2xx response, pulling whatever diagnostic the
// server surfaced — `X-Sniffy-Error-Code` / `-Message` headers (the same path
// the 402 branch uses) plus `body.error.message`/`body.error.details` so a
// ZodError's failing field paths show up in the UI's Wallet snag instead of
// the opaque "HTTP 400". Always returns a rejected ApiError; never throws.
async function buildNonOkApiError(res: Response, path: string): Promise<ApiError> {
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
      ? (body as { error?: { code?: string; message?: string; details?: unknown } })
          .error
      : undefined;
  const code =
    headerCode ?? bodyError?.code ?? `http_${res.status}`;
  // Prefer the explicit server message over the generic transport-level one;
  // fall back to the historical message format if the server gave us nothing.
  const message = headerMessage
    ? `Request to ${path} failed: HTTP ${res.status} — ${headerMessage}`
    : bodyError?.message
      ? `Request to ${path} failed: HTTP ${res.status} — ${bodyError.message}`
      : `Request to ${path} failed: HTTP ${res.status}`;
  return new ApiError(res.status, code, message, body);
}

async function getJSON<T>(
  path: string,
  parser: (raw: unknown) => T,
  options: RequestOptions = {},
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { "X-Sniffy-Client": SNIFFY_CLIENT_ID },
      signal: options.signal,
    });
  } catch (err) {
    throw new ApiNetworkError(
      `Request to ${path} failed before reaching the server`,
      err,
    );
  }
  if (!res.ok) {
    throw await buildNonOkApiError(res, path);
  }
  let raw: unknown;
  try {
    raw = await res.json();
  } catch (err) {
    throw new ApiError(res.status, "invalid_json", "Response was not valid JSON", err);
  }
  try {
    return parser(raw);
  } catch (err) {
    if (err instanceof Error) {
      throw new ApiValidationError(err.message, raw);
    }
    throw err;
  }
}

export async function getQuote(
  req: QuoteRequest,
  options: RequestOptions = {},
) {
  return postJSON(
    "/api/v1/aso/quote",
    req,
    (raw) => QuoteResponse.parse(raw),
    options,
  );
}

export async function postDiagnose(
  req: DiagnoseRequest,
  options: RequestOptions = {},
) {
  return postJSON(
    "/api/v1/aso/diagnose",
    req,
    (raw) => DiagnosePaidResponse.parse(raw),
    options,
  );
}

export async function getSample(options: RequestOptions = {}) {
  return getJSON(
    "/api/v1/aso/sample",
    (raw) => SampleResponse.parse(raw),
    options,
  );
}
