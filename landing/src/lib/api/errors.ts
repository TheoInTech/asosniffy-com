import type { DiagnoseUnpaidResponse } from "@sniffy/scraper/schemas";

abstract class SniffyApiError extends Error {
  abstract readonly code: string;
}

export class PaymentRequiredError extends SniffyApiError {
  readonly code = "payment_required";
  readonly status = 402;
  readonly payload: DiagnoseUnpaidResponse;

  constructor(payload: DiagnoseUnpaidResponse) {
    super(
      `Payment required for sniff ${payload.sniffId}: ${payload.payment.amount} on ${payload.payment.network}`,
    );
    this.name = "PaymentRequiredError";
    this.payload = payload;
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
