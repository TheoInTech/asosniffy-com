import type { DiagnoseUnpaidResponse } from "@sniffy/scraper/schemas";

// A single HTTP exchange in the x402 paywall dance. The flow normally produces
// two entries: one 402 (with PAYMENT-REQUIRED) and one 200 (with PAYMENT-RESPONSE).
// We expose these so the demo can render a protocol waterfall — judges shouldn't
// have to take our word for it that we're speaking x402.
export interface ProtocolTraceEntry {
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  status: number;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  startedAt: string;
  durationMs: number;
}

abstract class SniffyApiError extends Error {
  abstract readonly code: string;
}

export class PaymentRequiredError extends SniffyApiError {
  readonly code: string;
  readonly status = 402;
  readonly payload: DiagnoseUnpaidResponse;
  readonly serverMessage?: string;

  constructor(
    payload: DiagnoseUnpaidResponse,
    serverCode?: string,
    serverMessage?: string,
  ) {
    const fallback = `Payment required for sniff ${payload.sniffId}: ${payload.payment.amount} on ${payload.payment.network}`;
    super(serverMessage ?? fallback);
    this.name = "PaymentRequiredError";
    this.payload = payload;
    this.code = serverCode ?? "payment_required";
    if (serverMessage) this.serverMessage = serverMessage;
  }
}

export class ApiError extends SniffyApiError {
  readonly code: string;
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, code: string, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.body = body;
  }
}

export class ApiNetworkError extends SniffyApiError {
  readonly code = "network_error";
  override readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ApiNetworkError";
    this.cause = cause;
  }
}

export class ApiValidationError extends SniffyApiError {
  readonly code = "validation_error";
  readonly issues: string;
  readonly raw: unknown;

  constructor(issues: string, raw: unknown) {
    super(`Response failed schema validation: ${issues}`);
    this.name = "ApiValidationError";
    this.issues = issues;
    this.raw = raw;
  }
}
