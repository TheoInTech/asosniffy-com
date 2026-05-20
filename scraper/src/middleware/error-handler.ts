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
    // The human-readable reason rides along in X-Sniffy-Error-Message so the
    // UI can show a useful "Wallet snag" instead of the generic 402 body.
    c.header("X-Sniffy-Error-Code", err.code);

    // For verification/settlement failures, the upstream facilitator response
    // body is captured in err.details (set by diagnose.ts when wrapping a
    // FacilitatorError). Surface it so users see Morph's actual error reason
    // instead of just "returned HTTP 500", and log it so server-side
    // diagnostics survive even when no one is watching the UI.
    const facilitatorDetails = readFacilitatorDetails(err);
    if (facilitatorDetails) {
      c.header(
        "X-Sniffy-Facilitator-Status",
        String(facilitatorDetails.status),
      );
      process.stderr.write(
        `${JSON.stringify({
          ts: new Date().toISOString(),
          level: "warn",
          requestId: c.get("requestId"),
          message: "facilitator_error",
          code: err.code,
          facilitatorStatus: facilitatorDetails.status,
          facilitatorBody: facilitatorDetails.body,
        })}\n`,
      );
    }

    const combinedMessage = facilitatorDetails?.excerpt
      ? `${err.message} — body: ${facilitatorDetails.excerpt}`
      : err.message;
    // ASCII-clean header value: drop CR/LF (Hono lowercases names already).
    const safeMessage = combinedMessage.replace(/[\r\n]+/g, " ").slice(0, 1024);
    c.header("X-Sniffy-Error-Message", safeMessage);
    // x402 V2 spec: PAYMENT-REQUIRED header carries Base64(JSON) of a
    // canonical PaymentRequired object so wrapFetchWithPayment / @x402/fetch
    // can read it without parsing the body. We project only the canonical
    // fields ({ x402Version, error, resource, accepts }); the Sniffy-specific
    // `payment` summary stays in the body.
    const canonical = {
      x402Version: err.unpaidBody.x402Version,
      error: err.unpaidBody.error,
      resource: err.unpaidBody.resource,
      accepts: err.unpaidBody.accepts,
    };
    c.header(
      "PAYMENT-REQUIRED",
      Buffer.from(JSON.stringify(canonical)).toString("base64"),
    );
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
    // ZodErrors come from two distinct boundaries:
    //   • Request body validation (validateBody middleware) — client's fault
    //   • Final response shape validation (DiagnosePaidResponse.parse in the
    //     diagnose route) — server's fault, usually triggered by provider
    //     data that snuck past a `.min(1)` constraint
    // Either way, surfacing the failing field paths in headers + stderr makes
    // the failure self-diagnosing instead of an opaque "HTTP 400" in the UI.
    const excerpt = err.issues
      .slice(0, 5)
      .map((i) => {
        const path = i.path.length > 0 ? i.path.join(".") : "(root)";
        return `${path}: ${i.message}`;
      })
      .join("; ")
      .replace(/[\r\n]+/g, " ")
      .slice(0, 512);
    c.header("X-Sniffy-Error-Code", "invalid_body");
    c.header("X-Sniffy-Error-Message", `ZodError: ${excerpt}`.slice(0, 1024));
    process.stderr.write(
      `${JSON.stringify({
        ts: new Date().toISOString(),
        level: "warn",
        requestId: c.get("requestId"),
        message: "schema_validation_failed",
        route: `${c.req.method} ${c.req.path}`,
        issues: err.issues,
      })}\n`,
    );
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

// diagnose.ts wraps `FacilitatorError` like:
//   new PaymentRequiredError(code, msg, unpaidBody, { status, body })
// so `details` (when present on a facilitator failure) has this shape.
interface FacilitatorErrorDetails {
  status: number;
  body: unknown;
  excerpt: string;
}

function readFacilitatorDetails(
  err: PaymentRequiredError,
): FacilitatorErrorDetails | null {
  if (err.code !== "verification_failed" && err.code !== "settlement_failed") {
    return null;
  }
  const details = err.details;
  if (
    !details ||
    typeof details !== "object" ||
    !("status" in details) ||
    typeof (details as { status: unknown }).status !== "number"
  ) {
    return null;
  }
  const { status, body } = details as { status: number; body: unknown };
  const serialized =
    typeof body === "string"
      ? body
      : body === null || body === undefined
        ? ""
        : (() => {
            try {
              return JSON.stringify(body);
            } catch {
              return String(body);
            }
          })();
  const excerpt = serialized.replace(/[\r\n]+/g, " ").slice(0, 512);
  return { status, body, excerpt };
}

export { BadRequestError };
