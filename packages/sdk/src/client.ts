import {
  DiagnosePaidResponse,
  DiagnoseUnpaidResponse,
  QuoteResponse,
  SampleResponse,
  type DiagnoseRequest,
  type DiagnosePaidResponse as DiagnosePaidResponseT,
  type QuoteRequest,
  type QuoteResponse as QuoteResponseT,
  type SampleResponse as SampleResponseT,
} from "@sniffy/scraper/schemas";
import type { LocalAccount } from "viem";
import { PaymentRequiredError } from "./errors.js";
import { createPayingFetch, type PayingFetch } from "./x402.js";

const DEFAULT_BASE_URL = "https://api.sniffy.io";

// Identifies this surface to the scraper's soft attestation middleware so
// the per-request audit log carries clientSurface=sdk. CLI and MCP route
// through createSniffy() and inherit this value until v0.1 threads a
// `clientId` option into CreateSniffyOptions.
const SNIFFY_CLIENT_ID = "@sniffy/sdk@0.0.0";

export interface SignerLike {
  signTypedData: (args: unknown) => Promise<`0x${string}`>;
  address: `0x${string}`;
}

export interface CreateSniffyOptions {
  baseUrl?: string;
  signer?: LocalAccount;
  fetchImpl?: typeof globalThis.fetch;
}

export interface DiagnoseOptions {
  autoPay?: boolean;
}

export interface SniffyClient {
  quote: (input: QuoteRequest) => Promise<QuoteResponseT>;
  diagnose: (
    input: DiagnoseRequest,
    options?: DiagnoseOptions,
  ) => Promise<DiagnosePaidResponseT>;
  sample: () => Promise<SampleResponseT>;
}

function joinUrl(base: string, path: string): string {
  const trimmedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const trimmedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedBase}${trimmedPath}`;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Sniffy API returned non-JSON response (status ${res.status}): ${text.slice(0, 200)}`,
    );
  }
}

async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = (await readJson(res).catch(() => null)) as
    | { error?: { code?: string; message?: string } }
    | null;
  const code = body?.error?.code ?? "unknown_error";
  const message = body?.error?.message ?? fallback;
  throw new Error(`Sniffy API error (${res.status} ${code}): ${message}`);
}

export function createSniffy(options: CreateSniffyOptions = {}): SniffyClient {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const baseFetch = options.fetchImpl ?? globalThis.fetch;
  const signer = options.signer;

  let payingFetch: PayingFetch | null = null;
  function getPayingFetch(): PayingFetch {
    if (payingFetch !== null) return payingFetch;
    if (signer === undefined) {
      throw new Error(
        "Sniffy: signer is required for .diagnose() with autoPay=true. " +
          "Pass a viem Account via createSniffy({ signer }), or call .diagnose(input, { autoPay: false }) to intercept the 402.",
      );
    }
    payingFetch = createPayingFetch(signer);
    return payingFetch;
  }

  return {
    async quote(input) {
      const res = await baseFetch(joinUrl(baseUrl, "/api/v1/aso/quote"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sniffy-client": SNIFFY_CLIENT_ID,
        },
        body: JSON.stringify(input),
      });
      if (res.status !== 200) {
        await throwApiError(res, "quote request failed");
      }
      return QuoteResponse.parse(await readJson(res));
    },

    async sample() {
      const res = await baseFetch(joinUrl(baseUrl, "/api/v1/aso/sample"), {
        method: "GET",
        headers: { "x-sniffy-client": SNIFFY_CLIENT_ID },
      });
      if (res.status !== 200) {
        await throwApiError(res, "sample request failed");
      }
      return SampleResponse.parse(await readJson(res));
    },

    async diagnose(input, { autoPay = true } = {}) {
      const url = joinUrl(baseUrl, "/api/v1/aso/diagnose");
      // @x402/fetch preserves init.headers across its 402 → sign → retry
      // cycle, so setting x-sniffy-client here flows through both the
      // autoPay path and the manual path below.
      const init: RequestInit = {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-sniffy-client": SNIFFY_CLIENT_ID,
        },
        body: JSON.stringify(input),
      };

      if (autoPay && signer !== undefined) {
        // @x402/fetch handles the 402 → sign → retry cycle transparently.
        // No retry on 5xx; the wrapper only intercepts 402.
        const res = await getPayingFetch()(url, init);
        if (res.status === 402) {
          // Wrapper attempted payment but server still returned 402 — surface
          // it as PaymentRequiredError so callers can inspect.
          throw new PaymentRequiredError(
            DiagnoseUnpaidResponse.parse(await readJson(res)),
          );
        }
        if (res.status !== 200) {
          await throwApiError(res, "diagnose request failed");
        }
        return DiagnosePaidResponse.parse(await readJson(res));
      }

      // Manual path: single request, throw PaymentRequiredError on 402.
      const res = await baseFetch(url, init);
      if (res.status === 402) {
        throw new PaymentRequiredError(
          DiagnoseUnpaidResponse.parse(await readJson(res)),
        );
      }
      if (res.status !== 200) {
        await throwApiError(res, "diagnose request failed");
      }
      return DiagnosePaidResponse.parse(await readJson(res));
    },
  };
}
