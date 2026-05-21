import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DiagnosePaidResponse,
  DiagnoseUnpaidResponse,
  QuoteResponse,
  SampleResponse,
  SCHEMA_VERSION,
} from "../src/schemas/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = (name: string) => resolve(here, "../fixtures", name);
const readFixture = (name: string): unknown =>
  JSON.parse(readFileSync(fixturePath(name), "utf8"));

const exampleQuote = {
  requestId: "req_example_001",
  sniffId: "sniff_example_001",
  store: "ios" as const,
  country: "US",
  detectedApp: {
    id: "123456789",
    name: "Example App",
    developer: "Example Studio",
  },
  pricing: {
    currency: "USDC",
    network: "morph-hoodi",
    estimatedTotal: "0.05",
    breakdown: [
      { label: "base diagnosis", amount: "0.03" },
      { label: "2 keywords", amount: "0.02" },
    ],
  },
  coverage: {
    appMetadata: "high" as const,
    keywordRank: "medium" as const,
    competitorTrail: "medium" as const,
    reviews: "low" as const,
  },
  shallowScan: {
    title: "Example App",
    subtitle: "Habit & Routine Tracker",
    primaryCategory: "Productivity",
    ratingsSummary: { average: 4.6, count: 1240 },
    previewKeyword: {
      keyword: "habit tracker",
      rankBucket: "11-30" as const,
      confidence: "medium" as const,
      provenance: "live" as const,
    },
  },
  next: { paidEndpoint: "/api/v1/aso/diagnose" },
};

const hoodiTestToken = "0xEcF966Cc754BC411E1F1106fbb4e343b835E85E4";
const merchant = "0x000000000000000000000000000000000000dEaD";
const atomic005 = "50000000000000000"; // 0.05 @ 18 decimals

const exampleUnpaid = {
  x402Version: 2 as const,
  error: "payment_required" as const,
  sniffId: "sniff_example_001",
  resource: { url: "/api/v1/aso/diagnose" },
  payment: {
    x402Version: 2 as const,
    scheme: "exact" as const,
    network: "eip155:2910",
    facilitator: "https://morph-rails.morph.network/x402",
    amount: "0.05",
    atomicAmount: atomic005,
    decimals: 18,
    asset: hoodiTestToken,
    payTo: merchant,
    maxTimeoutSeconds: 60,
    extra: { name: "HoodiTestToken", version: "1.0" },
  },
  accepts: [
    {
      scheme: "exact" as const,
      network: "eip155:2910",
      amount: atomic005,
      asset: hoodiTestToken,
      payTo: merchant,
      maxTimeoutSeconds: 60,
      extra: { name: "HoodiTestToken", version: "1.0" },
    },
  ],
};

describe("schema constants", () => {
  it("exports the expected SCHEMA_VERSION", () => {
    expect(SCHEMA_VERSION).toBe("2026-05-mvp-2");
  });
});

describe("QuoteResponse", () => {
  it("parses the §9 example payload", () => {
    expect(() => QuoteResponse.parse(exampleQuote)).not.toThrow();
  });

  it("rejects an empty breakdown", () => {
    const bad = structuredClone(exampleQuote);
    bad.pricing.breakdown = [];
    expect(() => QuoteResponse.parse(bad)).toThrow();
  });
});

describe("DiagnoseUnpaidResponse", () => {
  it("parses the dual-shape 402 example payload", () => {
    expect(() => DiagnoseUnpaidResponse.parse(exampleUnpaid)).not.toThrow();
  });

  it("rejects a non-CAIP-2 network", () => {
    const bad = structuredClone(exampleUnpaid);
    bad.payment.network = "morph-hoodi";
    expect(() => DiagnoseUnpaidResponse.parse(bad)).toThrow();
  });

  it("keeps payment.atomicAmount and accepts[0].amount in sync", () => {
    const parsed = DiagnoseUnpaidResponse.parse(exampleUnpaid);
    expect(parsed.accepts[0]?.amount).toBe(parsed.payment.atomicAmount);
  });
});

describe("fixtures round-trip", () => {
  it("sample-quote.json parses as a QuoteResponse", () => {
    const payload = readFixture("sample-quote.json");
    expect(() => QuoteResponse.parse(payload)).not.toThrow();
  });

  it("sample-report.json parses as a DiagnosePaidResponse", () => {
    const payload = readFixture("sample-report.json");
    expect(() => DiagnosePaidResponse.parse(payload)).not.toThrow();
  });

  it("sample-report.json with sample:true parses as a SampleResponse", () => {
    const payload = readFixture("sample-report.json") as Record<string, unknown>;
    expect(() =>
      SampleResponse.parse({ ...payload, sample: true })
    ).not.toThrow();
  });

  it("sample-report.json carries reportVersion matching SCHEMA_VERSION", () => {
    const payload = readFixture("sample-report.json") as { reportVersion: string };
    expect(payload.reportVersion).toBe(SCHEMA_VERSION);
  });
});
