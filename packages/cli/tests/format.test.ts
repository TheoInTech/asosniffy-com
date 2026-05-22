import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import chalk from "chalk";
import { formatPaid, formatQuote, formatSample } from "../src/format.js";
import type { QuoteResponse, SampleResponse } from "@gosniffy/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));

beforeAll(() => {
  // Strip color codes so snapshots are deterministic across TTY / no-TTY runs.
  chalk.level = 0;
});

const SAMPLE: SampleResponse = {
  ...JSON.parse(
    readFileSync(
      join(__dirname, "..", "..", "..", "scraper", "fixtures", "sample-report.json"),
      "utf8",
    ),
  ),
  sample: true,
};

const QUOTE: QuoteResponse = {
  requestId: "req_test_fmt_1",
  sniffId: "sniff_fmt_1",
  store: "ios",
  country: "US",
  detectedApp: {
    id: "1000000001",
    name: "Pawprint Habits",
    developer: "Sniffy Labs",
  },
  pricing: {
    currency: "USDC",
    network: "morph-hoodi",
    estimatedTotal: "0.04",
    breakdown: [
      { label: "base", amount: "0.02" },
      { label: "1 keyword", amount: "0.02" },
    ],
  },
  coverage: {
    appMetadata: "high",
    keywordRank: "medium",
    competitorTrail: "low",
    reviews: "low",
  },
  shallowScan: {
    title: "Pawprint Habits",
    subtitle: "Daily Routine & Streaks",
    primaryCategory: "Productivity",
    ratingsSummary: { average: 4.5, count: 1200 },
    previewKeyword: {
      keyword: "habit tracker",
      rankBucket: "11-30",
      confidence: "medium",
      provenance: "live",
    },
  },
  next: { paidEndpoint: "/api/v1/aso/diagnose" },
};

describe("formatPaid (and formatSample, which wraps it)", () => {
  it("renders all expected sections deterministically", () => {
    const output = formatPaid(SAMPLE);
    expect(output).toMatchSnapshot();
  });

  it("renders the sample header", () => {
    expect(formatSample(SAMPLE)).toContain("Sniffy sample");
  });

  it("uses provenance icons for every label", () => {
    const output = formatPaid(SAMPLE);
    // Sample fixture is all-fixture provenance → at least one '○ fixture'
    expect(output).toContain("○ fixture");
  });

  it("includes an explorer link for Hoodi network", () => {
    const output = formatPaid(SAMPLE);
    expect(output).toContain("explorer-hoodi.morph.network/tx/");
  });
});

describe("formatQuote", () => {
  it("renders quote with shallowScan section", () => {
    const output = formatQuote(QUOTE);
    expect(output).toContain("Sniffy quote — sniffId sniff_fmt_1");
    expect(output).toContain("Shallow scan");
    expect(output).toContain("habit tracker");
    expect(output).toContain("● live");
  });

  it("renders the pricing breakdown", () => {
    const output = formatQuote(QUOTE);
    expect(output).toContain("0.04 USDC on morph-hoodi");
    expect(output).toContain("base");
    expect(output).toContain("1 keyword");
  });
});
