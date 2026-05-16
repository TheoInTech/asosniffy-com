import type {
  DiagnoseRequest,
  DiagnosePaidResponse,
  QuoteRequest,
  QuoteResponse,
  SampleResponse,
} from "@sniffy/scraper/schemas";

export interface SignerLike {
  signTypedData: (args: unknown) => Promise<`0x${string}`>;
  address: `0x${string}`;
}

export interface CreateSniffyOptions {
  baseUrl?: string;
  signer?: SignerLike;
}

export interface SniffyClient {
  quote: (input: QuoteRequest) => Promise<QuoteResponse>;
  diagnose: (input: DiagnoseRequest) => Promise<DiagnosePaidResponse>;
  sample: () => Promise<SampleResponse>;
}

const NOT_IMPLEMENTED = "not implemented — wired in Phase 06";

export function createSniffy(_options: CreateSniffyOptions = {}): SniffyClient {
  return {
    quote: async () => {
      throw new Error(NOT_IMPLEMENTED);
    },
    diagnose: async () => {
      throw new Error(NOT_IMPLEMENTED);
    },
    sample: async () => {
      throw new Error(NOT_IMPLEMENTED);
    },
  };
}
