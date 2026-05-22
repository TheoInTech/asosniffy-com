import type { DiagnoseUnpaidResponse } from "./schemas/index.js";

export type ErrorCode =
  | "invalid_body"
  | "payment_required"
  | "malformed_payment_header"
  | "wrong_network"
  | "expired_authorization"
  | "amount_mismatch"
  | "verification_failed"
  | "settlement_failed"
  // Sprint B — Sniff Pack credit spend on /diagnose. Returned when the
  // authenticated wallet's Pack balance is below the required credit cost.
  // Body carries the same DiagnoseUnpaidResponse shape so the client can
  // fall back to per-call x402 or buy another pack.
  | "insufficient_balance"
  | "session_invalid"
  | "internal_error";

export abstract class HttpError extends Error {
  abstract readonly status: number;
  abstract readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    if (details !== undefined) this.details = details;
  }
}

export class BadRequestError extends HttpError {
  readonly status = 400;
  readonly code: ErrorCode;

  constructor(message: string, code: ErrorCode = "invalid_body", details?: unknown) {
    super(message, details);
    this.code = code;
  }
}

export class PaymentRequiredError extends HttpError {
  readonly status = 402;
  readonly code: ErrorCode;
  readonly unpaidBody: DiagnoseUnpaidResponse;

  constructor(
    code: ErrorCode,
    message: string,
    unpaidBody: DiagnoseUnpaidResponse,
    details?: unknown,
  ) {
    super(message, details);
    this.code = code;
    this.unpaidBody = unpaidBody;
  }
}

export class InternalError extends HttpError {
  readonly status = 500;
  readonly code: ErrorCode = "internal_error";
}
