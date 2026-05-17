import type { Context } from "hono";
import { z } from "zod";
import {
  BadRequestError,
  HttpError,
  InternalError,
  PaymentRequiredError,
} from "../errors.js";
import {
  ExpiredAuthorizationError,
  MalformedHeaderError,
  WrongNetworkError,
} from "../payment/header.js";

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function handleError(err: Error, c: Context): Response {
  if (err instanceof PaymentRequiredError) {
    // The 402 body is the x402 unpaid response itself, not the standard error
    // shape — agents need machine-readable payment requirements. We surface
    // the specific failure code via X-Sniffy-Error-Code so clients can
    // differentiate without us breaking the DiagnoseUnpaidResponse schema.
    c.header("X-Sniffy-Error-Code", err.code);
    return c.json(err.unpaidBody, 402);
  }

  if (err instanceof HttpError) {
    const body: ErrorBody = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    };
    return c.json(body, err.status as 400 | 500);
  }

  if (err instanceof z.ZodError) {
    return c.json(
      {
        error: {
          code: "invalid_body",
          message: "Request body failed validation",
          details: err.issues,
        },
      },
      400,
    );
  }

  // These can leak out from parsePaymentHeader if a route forgets to wrap
  // them — translate to internal errors so we never 500 on a known shape.
  if (
    err instanceof MalformedHeaderError ||
    err instanceof WrongNetworkError ||
    err instanceof ExpiredAuthorizationError
  ) {
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
        },
      },
      400,
    );
  }

  // Unknown error: redact message in the response, log full stack to stderr.
  const internal = new InternalError("Internal server error");
  process.stderr.write(
    `${JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      requestId: c.get("requestId"),
      message: err.message,
      stack: err.stack,
    })}\n`,
  );
  return c.json(
    {
      error: {
        code: internal.code,
        message: internal.message,
      },
    },
    500,
  );
}

export { BadRequestError };
