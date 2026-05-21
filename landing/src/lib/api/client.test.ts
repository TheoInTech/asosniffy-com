import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import {
  deleteWalletSession,
  getQuote,
  getSample,
  getWalletNonce,
  getWalletSniff,
  getWalletSniffs,
  postDiagnose,
  postWalletSession,
} from "./client";
import {
  ApiError,
  ApiNetworkError,
  ApiValidationError,
  PaymentRequiredError,
  SiweAuthError,
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
    headers: response.headers ?? new Headers(),
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

  it("sets x-sniffy-client header on POST requests (postJSON)", async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => VALID_QUOTE_RESPONSE,
    });
    await getQuote(VALID_QUOTE_REQUEST);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-sniffy-client"]).toMatch(/^@sniffy\/landing@/);
  });

  it("sets x-sniffy-client header on GET requests (getJSON)", async () => {
    // We don't care about parsing succeeding — only that fetch was called
    // with the attestation header. A schema-failure rejection is fine here.
    const fetchMock = mockFetchOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    await expect(getSample()).rejects.toBeInstanceOf(ApiValidationError);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-sniffy-client"]).toMatch(/^@sniffy\/landing@/);
  });

  describe("wallet/* (SIWE auth + Trail history)", () => {
    const VALID_ADDRESS = "0x" + "1".repeat(40);

    it("getWalletNonce parses a valid nonce response", async () => {
      mockFetchOnce({
        ok: true,
        status: 200,
        json: async () => ({
          nonce: "abc12345",
          domain: "localhost:3000",
          expiresAt: "2026-05-20T12:05:00.000Z",
        }),
      });
      const res = await getWalletNonce(VALID_ADDRESS);
      expect(res.nonce).toBe("abc12345");
      expect(res.domain).toBe("localhost:3000");
    });

    it("postWalletSession returns a session token on 200", async () => {
      mockFetchOnce({
        ok: true,
        status: 200,
        json: async () => ({
          sessionToken: "sniffy_sess_xyz_padding_long_enough",
          address: VALID_ADDRESS,
          expiresAt: "2026-05-20T12:30:00.000Z",
        }),
      });
      const res = await postWalletSession({
        message: "siwe message",
        signature: "0xdeadbeef",
      });
      expect(res.sessionToken).toBe("sniffy_sess_xyz_padding_long_enough");
    });

    it("throws SiweAuthError on 401 with the server's error code", async () => {
      mockFetchOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: { code: "nonce_invalid", message: "Nonce consumed" },
        }),
      });
      try {
        await postWalletSession({ message: "x", signature: "0xab" });
        throw new Error("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(SiweAuthError);
        if (err instanceof SiweAuthError) {
          expect(err.code).toBe("nonce_invalid");
        }
      }
    });

    it("getWalletSniffs attaches Bearer token", async () => {
      const fetchMock = mockFetchOnce({
        ok: true,
        status: 200,
        json: async () => ({ items: [], nextCursor: null }),
      });
      await getWalletSniffs({ sessionToken: "sniffy_sess_test" });
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer sniffy_sess_test");
    });

    it("getWalletSniffs throws SiweAuthError on 401 so the hook can re-prompt", async () => {
      mockFetchOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: "session_invalid" } }),
      });
      await expect(
        getWalletSniffs({ sessionToken: "sniffy_sess_expired" }),
      ).rejects.toBeInstanceOf(SiweAuthError);
    });

    it("getWalletSniff requests the right path", async () => {
      const fetchMock = mockFetchOnce({
        ok: true,
        status: 200,
        json: async () => ({
          requestId: "req_x",
          sniffId: "sniff_z",
          reportVersion: "test",
          receipt: {
            network: "eip155:2910",
            facilitator: "morph-official",
            facilitatorMode: "morph-official",
            amount: "0.10",
            atomicAmount: "100000",
            asset: "0x" + "0".repeat(39) + "1",
            transactionHash: "0xdeadbeef",
            settledAt: "2026-05-20T12:00:00.000Z",
          },
          dataProvenance: {
            appMetadata: "live",
            keywordRank: "live",
            competitors: "live",
            recommendations: "inferred",
          },
          summary: "test",
          keywordDiagnosis: [],
          competitorTrail: [],
          metadataScore: {
            overall: 50,
            title: { score: 50, notes: "x" },
            subtitle: { score: 50, notes: "x" },
            keywords: { score: 50, notes: "x" },
            screenshots: { score: 50, notes: "x" },
          },
          recommendations: [],
          readyToPaste: {
            title: "",
            subtitle: "",
            keywordsField: "",
            shortDescription: "",
          },
          suggestedKeywords: [],
          regressions: [],
          historySignature: "",
          localizationAnalysis: null,
        }),
      });
      const res = await getWalletSniff({
        sessionToken: "sniffy_sess_t",
        sniffId: "sniff_z",
      });
      expect(res.sniffId).toBe("sniff_z");
      const url = fetchMock.mock.calls[0]?.[0] as string;
      expect(url).toMatch(/\/wallet\/sniff\/sniff_z$/);
    });

    it("deleteWalletSession resolves on 204", async () => {
      mockFetchOnce({
        ok: true,
        status: 204,
        json: async () => undefined,
      });
      await expect(
        deleteWalletSession("sniffy_sess_logout"),
      ).resolves.toBeUndefined();
    });
  });
});
