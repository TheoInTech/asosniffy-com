import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { getQuote, postDiagnose } from "./client";
import {
  ApiError,
  ApiNetworkError,
  ApiValidationError,
  PaymentRequiredError,
} from "./errors";

const VALID_QUOTE_REQUEST = {
  store: "ios" as const,
  app: "https://apps.apple.com/us/app/example/id111",
  country: "US",
  keywords: ["fitness tracker"],
};

const VALID_QUOTE_RESPONSE = {
  requestId: "req_test",
  sniffId: "sniff_test",
  store: "ios",
  country: "US",
  detectedApp: { id: "111", name: "Example", developer: "Dev" },
  pricing: {
    currency: "USDC",
    network: "eip155:2910",
    estimatedTotal: "0.04",
    breakdown: [{ label: "base", amount: "0.03" }],
  },
  coverage: {
    appMetadata: "high",
    keywordRank: "medium",
    competitorTrail: "medium",
    reviews: "low",
  },
  shallowScan: {
    title: "Example",
    subtitle: "Do the example",
    primaryCategory: "Lifestyle",
    ratingsSummary: { average: 4.6, count: 8200 },
    previewKeyword: {
      keyword: "fitness tracker",
      rankBucket: "11-30",
      confidence: "medium",
      provenance: "live",
    },
  },
  next: { paidEndpoint: "/api/v1/aso/diagnose" },
};

const VALID_UNPAID_402 = {
  x402Version: 2,
  error: "payment_required",
  sniffId: "sniff_test",
  resource: { url: "/api/v1/aso/diagnose" },
  payment: {
    x402Version: 2,
    scheme: "exact",
    network: "eip155:2910",
    facilitator: "https://morph-rails.morph.network/x402",
    amount: "0.05",
    atomicAmount: "50000000000000000",
    decimals: 18,
    asset: "0x" + "1".repeat(40),
    payTo: "0x" + "2".repeat(40),
    maxTimeoutSeconds: 60,
    extra: { name: "HoodiTestToken", version: "1.0" },
  },
  accepts: [
    {
      scheme: "exact",
      network: "eip155:2910",
      amount: "50000000000000000",
      asset: "0x" + "1".repeat(40),
      payTo: "0x" + "2".repeat(40),
      maxTimeoutSeconds: 60,
      extra: { name: "HoodiTestToken", version: "1.0" },
    },
  ],
};

function mockFetchOnce(response: Partial<Response> & { json?: () => Promise<unknown>; text?: () => Promise<string> }): Mock {
  const fn = vi.fn().mockResolvedValueOnce({
    ok: response.ok ?? false,
    status: response.status ?? 500,
    json: response.json ?? (async () => ({})),
    text: response.text ?? (async () => ""),
  } as unknown as Response);
  (globalThis as unknown as { fetch: typeof fetch }).fetch = fn as unknown as typeof fetch;
  return fn;
}

describe("api/client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses a valid quote response", async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => VALID_QUOTE_RESPONSE,
    });
    const res = await getQuote(VALID_QUOTE_REQUEST);
    expect(res.sniffId).toBe("sniff_test");
    expect(res.pricing.estimatedTotal).toBe("0.04");
  });

  it("throws PaymentRequiredError with a parsed payload on 402", async () => {
    mockFetchOnce({
      ok: false,
      status: 402,
      json: async () => VALID_UNPAID_402,
    });
    await expect(
      postDiagnose({
        sniffId: "sniff_test",
        store: "ios",
        app: "111",
        country: "US",
        keywords: ["fitness tracker"],
      }),
    ).rejects.toMatchObject({
      name: "PaymentRequiredError",
      payload: {
        sniffId: "sniff_test",
        payment: { network: "eip155:2910" },
      },
    });
  });

  it("throws ApiValidationError when the body fails schema", async () => {
    mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => ({ bogus: true }),
    });
    await expect(getQuote(VALID_QUOTE_REQUEST)).rejects.toBeInstanceOf(
      ApiValidationError,
    );
  });

  it("throws ApiError on non-402 non-2xx responses", async () => {
    mockFetchOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "boom" }),
    });
    await expect(getQuote(VALID_QUOTE_REQUEST)).rejects.toBeInstanceOf(ApiError);
  });

  it("throws ApiNetworkError when fetch itself rejects", async () => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline")) as unknown as typeof fetch;
    await expect(getQuote(VALID_QUOTE_REQUEST)).rejects.toBeInstanceOf(
      ApiNetworkError,
    );
  });

  it("ensures PaymentRequiredError carries the parsed unpaid payload type", async () => {
    mockFetchOnce({
      ok: false,
      status: 402,
      json: async () => VALID_UNPAID_402,
    });
    try {
      await postDiagnose({
        sniffId: "sniff_test",
        store: "ios",
        app: "111",
        country: "US",
        keywords: ["fitness tracker"],
      });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(PaymentRequiredError);
      if (err instanceof PaymentRequiredError) {
        expect(err.payload.payment.amount).toBe("0.05");
      }
    }
  });
});
