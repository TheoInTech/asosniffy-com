import { expect, test } from "@playwright/test";

const QUOTE_RESPONSE = {
  requestId: "req_e2e_001",
  sniffId: "sniff_e2e_001",
  store: "ios",
  country: "US",
  detectedApp: {
    id: "1234567890",
    name: "PlayStretch",
    developer: "Pixel Detective Co.",
  },
  pricing: {
    currency: "USDC",
    network: "eip155:2910",
    estimatedTotal: "0.05",
    breakdown: [
      { label: "Base diagnosis", amount: "0.03" },
      { label: "Keyword × 2", amount: "0.02" },
    ],
  },
  coverage: {
    appMetadata: "high",
    keywordRank: "medium",
    competitorTrail: "medium",
    reviews: "low",
  },
  shallowScan: {
    title: "PlayStretch — Daily Mobility",
    subtitle: "Mobility, every morning",
    primaryCategory: "Health & Fitness",
    ratingsSummary: { average: 4.7, count: 12450 },
    previewKeyword: {
      keyword: "morning stretch",
      rankBucket: "11-30",
      confidence: "medium",
      provenance: "live",
    },
  },
  next: { paidEndpoint: "/api/v1/aso/diagnose" },
};

test.describe("Home → quote flow", () => {
  test.beforeEach(async ({ page }) => {
    // Intercept any scraper call and return our canned quote response. We
    // exercise the typed fetch client + Zod parse + QuoteResponseView without
    // requiring the live scraper.
    await page.route("**/api/v1/aso/quote", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(QUOTE_RESPONSE),
      });
    });
  });

  test("runs a free sniff and renders the shallowScan + unlock CTA", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: /pay per sniff/i }),
    ).toBeVisible();

    await page
      .getByLabel("App URL, App Store ID, or name")
      .fill("https://apps.apple.com/us/app/playstretch/id1234567890");

    // Add two keywords via Enter
    const keywordInput = page.getByLabel("Keywords");
    await keywordInput.fill("morning stretch");
    await keywordInput.press("Enter");
    await keywordInput.fill("mobility");
    await keywordInput.press("Enter");

    await page
      .getByRole("button", { name: /run free sniff test/i })
      .click();

    await expect(page.getByText("PlayStretch — Daily Mobility")).toBeVisible();
    await expect(page.getByText("morning stretch").first()).toBeVisible();
    await expect(page.getByText("rank 11-30")).toBeVisible();
    await expect(page.getByText("Cost to unlock full trail")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /unlock full trail/i }),
    ).toBeVisible();
  });

  test("offers the See sample report link in the shell", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: /see sample report/i }),
    ).toBeVisible();
  });
});

test.describe("Morph link health (network)", () => {
  test.skip(
    !process.env.PLAYWRIGHT_NETWORK_CHECKS,
    "Set PLAYWRIGHT_NETWORK_CHECKS=1 to probe Morph public URLs.",
  );

  test("FundPanel links return 200", async ({ page, request }) => {
    await page.route("**/api/v1/aso/quote", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(QUOTE_RESPONSE),
      });
    });

    await page.goto("/");
    await page
      .getByLabel("App URL, App Store ID, or name")
      .fill("https://apps.apple.com/us/app/playstretch/id1234567890");
    const kw = page.getByLabel("Keywords");
    await kw.fill("morning stretch");
    await kw.press("Enter");
    await page.getByRole("button", { name: /run free sniff test/i }).click();
    await expect(page.getByText("Cost to unlock full trail")).toBeVisible();

    // FundPanel auto-opens when no wallet is connected, so its links should
    // already be in the DOM. If the default flips later, expand it explicitly.
    const fundToggle = page.getByRole("button", { name: /how to fund/i });
    const expanded = await fundToggle.getAttribute("aria-expanded");
    if (expanded === "false") {
      await fundToggle.click();
    }

    const links = await page
      .getByRole("link", { name: /(bridge|faucet|explorer)/i })
      .all();
    expect(links.length).toBeGreaterThan(0);

    for (const link of links) {
      const href = await link.getAttribute("href");
      expect(href).toBeTruthy();
      if (!href) continue;
      const res = await request.fetch(href, {
        method: "HEAD",
        maxRedirects: 5,
        timeout: 8_000,
      });
      // 2xx are healthy; 301/302 redirect to a public page; 405 means the
      // server rejects HEAD but the URL itself is reachable.
      expect(res.status()).toBeLessThan(400);
      expect(res.status()).toBeGreaterThanOrEqual(200);
    }
  });
});
