import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createSniffy, PaymentRequiredError } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  readFileSync(
    join(__dirname, "..", "..", "..", "scraper", "fixtures", "sample-report.json"),
    "utf8",
  ),
);

const QUOTE_FIXTURE = {
  requestId: "req_test_q1",
  sniffId: "sniff_q1",
  store: "ios" as const,
  country: "US" as const,
  detectedApp: {
    id: "123456789",
    name: "Test App",
    developer: "Test Inc",
  },
  pricing: {
    currency: "USDC" as const,
    network: "morph-hoodi" as const,
    estimatedTotal: "0.04",
    breakdown: [{ label: "base", amount: "0.04" }],
  },
  coverage: {
    appMetadata: "high" as const,
    keywordRank: "medium" as const,
    competitorTrail: "low" as const,
    reviews: "low" as const,
  },
  shallowScan: {
    title: "Test App",
    subtitle: "Test subtitle",
    primaryCategory: "Productivity",
    ratingsSummary: { average: 4.5, count: 1200 },
    previewKeyword: {
      keyword: "habit tracker",
      rankBucket: "11-30" as const,
      confidence: "medium" as const,
      provenance: "live" as const,
    },
  },
  savingsNote: {
    message:
      "This sniff: $0.04 USDC. Typical ASO subscription: $59/month (or $589/year). Pay only when you sniff — no subscription, no seats, no card on file.",
    estimatedSniffCost: "0.04",
    typicalSubscriptionMonthlyUSD: 59,
    typicalSubscriptionAnnualUSD: 589,
  },
  next: { paidEndpoint: "/api/v1/aso/diagnose" },
};

const UNPAID_FIXTURE = {
  x402Version: 2 as const,
  error: "payment_required" as const,
  sniffId: "sniff_q1",
  resource: { url: "http://localhost:3001/api/v1/aso/diagnose" },
  payment: {
    x402Version: 2 as const,
    scheme: "exact" as const,
    network: "eip155:2910" as const,
    facilitator: "https://morph-rails.morph.network/x402",
    amount: "0.04",
    atomicAmount: "40000000000000000",
    decimals: 18,
    asset: "0xEcF966Cc754BC411E1F1106fbb4e343b835E85E4",
    payTo: "0x000000000000000000000000000000000000c0de",
    maxTimeoutSeconds: 60,
    extra: { name: "HoodiTestToken", version: "1.0" },
  },
  accepts: [
    {
      scheme: "exact" as const,
      network: "eip155:2910" as const,
      amount: "40000000000000000",
      asset: "0xEcF966Cc754BC411E1F1106fbb4e343b835E85E4",
      payTo: "0x000000000000000000000000000000000000c0de",
      maxTimeoutSeconds: 60,
      extra: { name: "HoodiTestToken", version: "1.0" },
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createSniffy — quote", () => {
  it("POSTs JSON to /api/v1/aso/quote and parses the response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(QUOTE_FIXTURE));
    const sniffy = createSniffy({
      baseUrl: "http://test",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await sniffy.quote({
      store: "ios",
      app: "https://apps.apple.com/us/app/example/id123456789",
      country: "US",
      keywords: ["habit tracker"],
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://test/api/v1/aso/quote");
    expect((init as RequestInit).method).toBe("POST");
    expect(result.sniffId).toBe("sniff_q1");
    expect(result.shallowScan.previewKeyword.keyword).toBe("habit tracker");
  });

  it("throws an Error with status + code on non-200", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { code: "invalid_body", message: "bad shape" } },
        400,
      ),
    );
    const sniffy = createSniffy({
      baseUrl: "http://test",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await expect(
      sniffy.quote({
        store: "ios",
        app: "x",
        country: "US",
        keywords: ["k"],
      }),
    ).rejects.toThrow(/400.*invalid_body.*bad shape/);
  });
});

describe("createSniffy — sample", () => {
  it("GETs /api/v1/aso/sample and parses the response", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...FIXTURE, sample: true }),
    );
    const sniffy = createSniffy({
      baseUrl: "http://test",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const result = await sniffy.sample();
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe("GET");
    expect(result.sample).toBe(true);
    expect(result.receipt.facilitatorMode).toBe("fixture-receipt");
  });
});

describe("createSniffy — X-Sniffy-Client attestation", () => {
  it("sets x-sniffy-client on quote", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(QUOTE_FIXTURE));
    const sniffy = createSniffy({
      baseUrl: "http://test",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await sniffy.quote({
      store: "ios",
      app: "https://apps.apple.com/us/app/example/id123456789",
      country: "US",
      keywords: ["habit tracker"],
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-sniffy-client"]).toMatch(/^@gosniffy\/sdk@/);
  });

  it("sets x-sniffy-client on sample", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...FIXTURE, sample: true }));
    const sniffy = createSniffy({
      baseUrl: "http://test",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await sniffy.sample();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-sniffy-client"]).toMatch(/^@gosniffy\/sdk@/);
  });

  it("sets x-sniffy-client on diagnose (manual path)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(FIXTURE));
    const sniffy = createSniffy({
      baseUrl: "http://test",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await sniffy.diagnose(
      {
        sniffId: "sniff_q1",
        store: "ios",
        app: "x",
        country: "US",
        keywords: ["habit tracker"],
      },
      { autoPay: false },
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-sniffy-client"]).toMatch(/^@gosniffy\/sdk@/);
  });

  it("default identity matches @gosniffy/sdk@<pkg.version>", async () => {
    const sdkPkg = JSON.parse(
      readFileSync(join(__dirname, "..", "package.json"), "utf8"),
    ) as { version: string };
    fetchMock.mockResolvedValueOnce(jsonResponse(QUOTE_FIXTURE));
    const sniffy = createSniffy({
      baseUrl: "http://test",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await sniffy.quote({
      store: "ios",
      app: "https://apps.apple.com/us/app/example/id123456789",
      country: "US",
      keywords: ["habit tracker"],
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-sniffy-client"]).toBe(`@gosniffy/sdk@${sdkPkg.version}`);
  });

  it("honors clientId override verbatim on quote", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(QUOTE_FIXTURE));
    const sniffy = createSniffy({
      baseUrl: "http://test",
      fetchImpl: fetchMock as unknown as typeof fetch,
      clientId: "@gosniffy/mcp@9.9.9",
    });
    await sniffy.quote({
      store: "ios",
      app: "https://apps.apple.com/us/app/example/id123456789",
      country: "US",
      keywords: ["habit tracker"],
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-sniffy-client"]).toBe("@gosniffy/mcp@9.9.9");
  });

  it("clientId override flows through diagnose manual path", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(FIXTURE));
    const sniffy = createSniffy({
      baseUrl: "http://test",
      fetchImpl: fetchMock as unknown as typeof fetch,
      clientId: "@gosniffy/cli@1.2.3",
    });
    await sniffy.diagnose(
      {
        sniffId: "sniff_q1",
        store: "ios",
        app: "x",
        country: "US",
        keywords: ["habit tracker"],
      },
      { autoPay: false },
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-sniffy-client"]).toBe("@gosniffy/cli@1.2.3");
  });

  it("clientId override flows through sample", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ...FIXTURE, sample: true }));
    const sniffy = createSniffy({
      baseUrl: "http://test",
      fetchImpl: fetchMock as unknown as typeof fetch,
      clientId: "@sniffy/landing@0.5.0",
    });
    await sniffy.sample();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-sniffy-client"]).toBe("@sniffy/landing@0.5.0");
  });
});

describe("createSniffy — diagnose", () => {
  it("returns the parsed paid response on 200", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(FIXTURE));
    const sniffy = createSniffy({
      baseUrl: "http://test",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const result = await sniffy.diagnose(
      {
        sniffId: "sniff_q1",
        store: "ios",
        app: "x",
        country: "US",
        keywords: ["habit tracker"],
      },
      { autoPay: false },
    );
    expect(result.receipt.transactionHash).toMatch(/^0x/);
  });

  it("throws PaymentRequiredError on 402 when autoPay=false", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(UNPAID_FIXTURE, 402));
    const sniffy = createSniffy({
      baseUrl: "http://test",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    let caught: unknown;
    try {
      await sniffy.diagnose(
        {
          sniffId: "sniff_q1",
          store: "ios",
          app: "x",
          country: "US",
          keywords: ["habit tracker"],
        },
        { autoPay: false },
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(PaymentRequiredError);
    const err = caught as PaymentRequiredError;
    expect(err.sniffId).toBe("sniff_q1");
    expect(err.payment.network).toBe("eip155:2910");
    expect(err.payment.amount).toBe("0.04");
    expect(err.response.accepts).toHaveLength(1);
  });

  it("throws PaymentRequiredError on 402 when autoPay=true but no signer", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(UNPAID_FIXTURE, 402));
    const sniffy = createSniffy({
      baseUrl: "http://test",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    // autoPay defaults to true; with no signer we fall through to the manual path
    await expect(
      sniffy.diagnose({
        sniffId: "sniff_q1",
        store: "ios",
        app: "x",
        country: "US",
        keywords: ["habit tracker"],
      }),
    ).rejects.toBeInstanceOf(PaymentRequiredError);
  });
});
