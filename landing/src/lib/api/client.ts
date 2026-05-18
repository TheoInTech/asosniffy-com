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
} from "./errors";

const DEFAULT_BASE_URL = "http://localhost:3001";

export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SCRAPER_BASE_URL ?? DEFAULT_BASE_URL;
}

interface RequestOptions {
  signal?: AbortSignal;
  paymentHeader?: string;
}

async function postJSON<T>(
  path: string,
  body: unknown,
  parser: (raw: unknown) => T,
  options: RequestOptions = {},
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options.paymentHeader
          ? { "PAYMENT-SIGNATURE": options.paymentHeader }
          : {}),
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch (err) {
    throw new ApiNetworkError(
      `Request to ${path} failed before reaching the server`,
      err,
    );
  }

  if (res.status === 402) {
    let raw: unknown;
    try {
      raw = await res.json();
    } catch (err) {
      throw new ApiError(402, "payment_required_malformed", "Server returned 402 without a parseable body", err);
    }
    const parsed = DiagnoseUnpaidResponse.safeParse(raw);
    if (!parsed.success) {
      throw new ApiValidationError(
        parsed.error.issues.map((i) => i.message).join("; "),
        raw,
      );
    }
    throw new PaymentRequiredError(parsed.data);
  }

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => "");
    }
    throw new ApiError(res.status, `http_${res.status}`, `Request to ${path} failed: HTTP ${res.status}`, body);
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

async function getJSON<T>(
  path: string,
  parser: (raw: unknown) => T,
  options: RequestOptions = {},
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { method: "GET", signal: options.signal });
  } catch (err) {
    throw new ApiNetworkError(
      `Request to ${path} failed before reaching the server`,
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
    throw new ApiError(res.status, `http_${res.status}`, `Request to ${path} failed: HTTP ${res.status}`, body);
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
