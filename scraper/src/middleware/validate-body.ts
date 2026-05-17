import { createMiddleware } from "hono/factory";
import { z, type ZodTypeAny } from "zod";
import { BadRequestError } from "../errors.js";

// Hand-rolled per docs/02-core-api.md decision: gives us full control over the
// error response shape {error: {code, message, details}} that downstream
// agents/SDKs expect.
export function validateBody<S extends ZodTypeAny>(schema: S) {
  return createMiddleware(async (c, next) => {
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw new BadRequestError("Request body is not valid JSON");
    }

    const result = schema.safeParse(raw);
    if (!result.success) {
      throw new BadRequestError(
        "Request body failed validation",
        "invalid_body",
        result.error.issues,
      );
    }

    c.set("parsedBody", result.data);
    await next();
  });
}

export function getParsedBody<T extends ZodTypeAny>(
  c: import("hono").Context,
  _schema: T,
): z.infer<T> {
  return c.get("parsedBody") as z.infer<T>;
}
