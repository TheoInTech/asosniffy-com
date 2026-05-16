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

  async function request(args: InternalRequestArgs): Promise<unknown> {
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

    const response = await httpFetch(absoluteUrl, {
      method: args.method,
      headers,
      body: rawBody,
    });

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
    return parsed;
  }

  return {
    baseUrl,
    async getSupported() {
      const body = await request({
        method: "GET",
        endpoint: "/v2/supported",
        signed: false,
      });
      return SupportedResponse.parse(body);
    },
    async verify(payload) {
      const validated = VerifyRequest.parse(payload);
      const body = await request({
        method: "POST",
        endpoint: "/v2/verify",
        body: validated,
        signed: true,
      });
      return VerifyResponse.parse(body);
    },
    async settle(payload) {
      const validated = SettleRequest.parse(payload);
      const body = await request({
        method: "POST",
        endpoint: "/v2/settle",
        body: validated,
        signed: true,
      });
      return SettleResponse.parse(body);
    },
  };
}
