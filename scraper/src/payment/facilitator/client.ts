import { z } from "zod";
import { signRequest } from "./hmac.js";
import {
  SettleRequest,
  SettleResponse,
  SupportedResponse,
  VerifyRequest,
  VerifyResponse,
} from "./types.js";

export const DEFAULT_FACILITATOR_BASE_URL = "https://morph-rails.morph.network/x402";

export class FacilitatorError extends Error {
  public readonly status: number;
  public readonly body: unknown;
  public readonly path: string;
  public readonly method: string;

  constructor(args: { status: number; body: unknown; path: string; method: string; message?: string }) {
    super(
      args.message ??
        `Morph facilitator ${args.method} ${args.path} returned HTTP ${args.status}`,
    );
    this.name = "FacilitatorError";
    this.status = args.status;
    this.body = args.body;
    this.path = args.path;
    this.method = args.method;
  }
}

export interface CreateFacilitatorClientOptions {
  accessKey: string;
  secretKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  // Allow tests to inject a deterministic clock for HMAC timestamps.
  now?: () => number;
}

export interface FacilitatorClient {
  baseUrl: string;
  getSupported(): Promise<SupportedResponse>;
  verify(payload: VerifyRequest): Promise<VerifyResponse>;
  settle(payload: SettleRequest): Promise<SettleResponse>;
}

interface InternalRequestArgs {
  method: "GET" | "POST";
  endpoint: string;
  body?: VerifyRequest | SettleRequest;
  signed: boolean;
}

function parsePath(baseUrl: string, endpoint: string): { fullPath: string; absoluteUrl: string } {
  // We need the full path that includes the `/x402` prefix because that prefix
  // is part of the HMAC sign content (skill checklist item #7). Using
  // `new URL(endpoint, base)` with an absolute-path endpoint resolves against
  // the host root, dropping the `/x402` prefix from the base — so we
  // string-concatenate instead.
  const base = new URL(baseUrl);
  const basePath = base.pathname.replace(/\/+$/, "");
  const endpointPath = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const fullPath = `${basePath}${endpointPath}`;
  return {
    fullPath,
    absoluteUrl: `${base.origin}${fullPath}`,
  };
}

export function createFacilitatorClient(
  options: CreateFacilitatorClientOptions,
): FacilitatorClient {
  const baseUrl = options.baseUrl ?? DEFAULT_FACILITATOR_BASE_URL;
  const httpFetch = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const { accessKey, secretKey } = options;

  async function request(
    args: InternalRequestArgs,
  ): Promise<{ body: unknown; status: number; fullPath: string }> {
    const { fullPath, absoluteUrl } = parsePath(baseUrl, args.endpoint);
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    let rawBody: string | undefined;
    if (args.body !== undefined) {
      rawBody = JSON.stringify(args.body);
      headers["Content-Type"] = "application/json";
    }

    if (args.signed) {
      const timestamp = now().toString();
      const signature = signRequest({
        accessKey,
        secretKey,
        timestamp,
        method: args.method,
        path: fullPath,
        rawQuery: "",
        rawBody,
      });
      headers["MORPH-ACCESS-KEY"] = accessKey;
      headers["MORPH-ACCESS-TIMESTAMP"] = timestamp;
      headers["MORPH-ACCESS-SIGN"] = signature;
    }

    // Network-layer failures (DNS, connection reset, TLS, timeout) surface as
    // a TypeError("fetch failed") in node:fetch. Translate to FacilitatorError
    // so the diagnose route can map it to HTTP 402 settlement_failed instead
    // of bubbling up as an opaque 500.
    let response: Response;
    try {
      response = await httpFetch(absoluteUrl, {
        method: args.method,
        headers,
        body: rawBody,
      });
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      throw new FacilitatorError({
        status: 0,
        body: { networkError: errMessage },
        path: fullPath,
        method: args.method,
        message: `Morph ${args.method} ${fullPath} failed before response: ${errMessage}`,
      });
    }

    const text = await response.text();
    let parsed: unknown = undefined;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }
    }

    if (!response.ok) {
      throw new FacilitatorError({
        status: response.status,
        body: parsed ?? null,
        path: fullPath,
        method: args.method,
      });
    }
    return { body: parsed, status: response.status, fullPath };
  }

  // Convert a ZodError from a 2xx-body parse into a FacilitatorError so the
  // diagnose route's existing `FacilitatorError` → 402 settlement_failed /
  // verification_failed taxonomy handles it uniformly. Without this, a
  // malformed-but-200 facilitator response leaks the raw ZodError to the
  // global handler and the user sees HTTP 400 "invalid_body" — wrong code,
  // wrong direction (our request wasn't bad; Morph's response was).
  function parseFacilitatorResponse<T>(
    schema: z.ZodType<T>,
    body: unknown,
    status: number,
    fullPath: string,
    method: "GET" | "POST",
  ): T {
    const result = schema.safeParse(body);
    if (result.success) return result.data;
    const issues = result.error.issues
      .map((i) => `${i.path.length > 0 ? i.path.join(".") : "(root)"}: ${i.message}`)
      .join("; ");
    throw new FacilitatorError({
      status,
      body,
      path: fullPath,
      method,
      message: `Morph ${method} ${fullPath} returned HTTP ${status} with body that failed schema validation: ${issues}`,
    });
  }

  return {
    baseUrl,
    async getSupported() {
      const { body, status, fullPath } = await request({
        method: "GET",
        endpoint: "/v2/supported",
        signed: false,
      });
      return parseFacilitatorResponse(SupportedResponse, body, status, fullPath, "GET");
    },
    async verify(payload) {
      const validated = VerifyRequest.parse(payload);
      const { body, status, fullPath } = await request({
        method: "POST",
        endpoint: "/v2/verify",
        body: validated,
        signed: true,
      });
      return parseFacilitatorResponse(VerifyResponse, body, status, fullPath, "POST");
    },
    async settle(payload) {
      const validated = SettleRequest.parse(payload);
      const { body, status, fullPath } = await request({
        method: "POST",
        endpoint: "/v2/settle",
        body: validated,
        signed: true,
      });
      return parseFacilitatorResponse(SettleResponse, body, status, fullPath, "POST");
    },
  };
}
