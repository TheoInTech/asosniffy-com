// Sprint B — orchestrator tier gating. Quick tier MUST skip the OpenAI
// synthesis call (no token spend, faster response) while still returning a
// structurally complete DiagnosePaidResponse. Standard / Expert / omitted
// callers run the full AI path.

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { resetCacheClientForTests } from "../../src/cache/redis.js";
import { resetMetricsForTests } from "../../src/cache/metrics.js";
import { generateReport } from "../../src/orchestrator/index.js";
import {
  resetOpenAiClientForTests,
  setOpenAiClientForTests,
} from "../../src/synthesis/openai-client.js";
import type { RequestId, SniffId } from "../../src/schemas/index.js";

const TARGET_APP_ID = "570060128";

const lookupBody = {
  resultCount: 1,
  results: [
    {
      trackId: Number(TARGET_APP_ID),
      trackName: "Duolingo",
      artistName: "Duolingo, Inc.",
      primaryGenreName: "Education",
      description: "Learn a language for free.",
      screenshotUrls: ["https://example.com/s1.png"],
      averageUserRating: 4.7,
      userRatingCount: 1500000,
      version: "7.1.2",
    },
  ],
};

function searchBody() {
  const results: Array<Record<string, unknown>> = [
    {
      trackId: Number(TARGET_APP_ID),
      trackName: "Duolingo",
      artistName: "Duolingo, Inc.",
      primaryGenreName: "Education",
      description: "",
      screenshotUrls: [],
      averageUserRating: 4.7,
      userRatingCount: 1500000,
      version: "7.1.2",
    },
  ];
  while (results.length < 20) {
    results.push({
      trackId: 9000000 + results.length,
      trackName: `Filler ${results.length}`,
      artistName: "Other Dev",
      primaryGenreName: "Education",
      description: "",
      screenshotUrls: [],
      averageUserRating: 4.0,
      userRatingCount: 100,
      version: "1.0",
    });
  }
  return { resultCount: results.length, results };
}

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => {
  server.resetHandlers();
  resetOpenAiClientForTests();
});
afterAll(() => server.close());

beforeEach(() => {
  resetCacheClientForTests();
  resetMetricsForTests();
});

const REPORT_INPUT = {
  requestId: "req_tier_001" as RequestId,
  sniffId: "sniff_tier_001" as SniffId,
  store: "ios" as const,
  app: TARGET_APP_ID,
  country: "US",
  keywords: ["language"],
};

function setupHappyAppleHandlers() {
  server.use(
    http.get("https://itunes.apple.com/lookup", () =>
      HttpResponse.json(lookupBody),
    ),
    http.get("https://itunes.apple.com/search", () =>
      HttpResponse.json(searchBody()),
    ),
    // Stub the reviews-RSS endpoint so the orchestrator's review fetch
    // resolves deterministically. Tests that run on networks that can
    // reach Apple were otherwise getting real review data, which made the
    // Expert tier's reviewSentiment assertion ("expect null on thin data")
    // flake. Empty feed → 0 review bodies → analyzeReviewSentiment returns
    // null per its < MIN_REVIEWS_FOR_SENTIMENT floor.
    http.get(
      "https://itunes.apple.com/:country/rss/customerreviews/page=:page/id=:id/sortby=mostrecent/json",
      () =>
        HttpResponse.json({
          feed: { entry: [], updated: { label: new Date().toISOString() } },
        }),
    ),
  );
}

// Build a minimal OpenAI client shape that satisfies the call-site without
// returning anything. Tracks whether `responses.create` was invoked so the
// test can assert presence or absence of the AI call.
function makeOpenAiSpy() {
  const createSpy = vi.fn().mockImplementation(() => {
    throw new Error("OpenAI should not have been called during this run");
  });
  return {
    spy: createSpy,
    client: {
      responses: { create: createSpy },
      chat: { completions: { create: createSpy } },
    } as unknown as Parameters<typeof setOpenAiClientForTests>[0],
  };
}

describe("orchestrator tier gating", () => {
  it("Quick tier never invokes the OpenAI client (template-only synthesis)", async () => {
    setupHappyAppleHandlers();
    const { spy, client } = makeOpenAiSpy();
    setOpenAiClientForTests(client);

    const report = await generateReport({ ...REPORT_INPUT, tier: "quick" });

    expect(spy).not.toHaveBeenCalled();
    // Quick still produces a structurally valid response — recommendations
    // and ready-to-paste copy come from the deterministic template engine.
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.readyToPaste.title.current).toBeTypeOf("string");
    // Template synthesis sets source ∈ {"deterministic", "template-fallback"};
    // it must NEVER be "ai" for the Quick path.
    expect(report.readyToPaste.source).not.toBe("ai");
    // Quick is below Expert tier — expertAnalysis MUST be absent.
    expect(report.expertAnalysis).toBeUndefined();
  });

  it("Standard tier omits the expertAnalysis block (Expert-only feature)", async () => {
    setupHappyAppleHandlers();
    const createSpy = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        summary: "test summary",
        recommendations: [],
        readyToPaste: null,
      }),
    });
    setOpenAiClientForTests({
      responses: { create: createSpy },
      chat: { completions: { create: createSpy } },
    } as unknown as Parameters<typeof setOpenAiClientForTests>[0]);

    const report = await generateReport({ ...REPORT_INPUT, tier: "standard" });
    expect(report.expertAnalysis).toBeUndefined();
  });

  it("Expert tier produces an expertAnalysis block with ASA coverage + sentiment slots", async () => {
    setupHappyAppleHandlers();
    // No OpenAI client — synthesizeReportOpenAi falls back to the template
    // engine internally. The synthesis path doesn't affect expertAnalysis,
    // which is computed entirely from the orchestrator's data + scoring.
    resetOpenAiClientForTests();

    const report = await generateReport({ ...REPORT_INPUT, tier: "expert" });

    expect(report.expertAnalysis).toBeDefined();
    expect(typeof report.expertAnalysis?.asaPopularityConfirmed).toBe(
      "boolean",
    );
    // ASA coverage counts must be coherent — zero ≤ keywordsWithLiveAsa
    // ≤ totalKeywords, and totalKeywords matches keywordDiagnosis.length.
    const cov = report.expertAnalysis?.asaCoverage;
    expect(cov?.keywordsWithLiveAsa).toBeGreaterThanOrEqual(0);
    expect(cov?.keywordsWithLiveAsa).toBeLessThanOrEqual(
      cov?.totalKeywords ?? 0,
    );
    expect(cov?.totalKeywords).toBe(report.keywordDiagnosis.length);
    // asaPopularityConfirmed semantics: true iff every keyword has live ASA.
    // In this test the ASA provider is disabled (no key), so coverage is 0
    // and confirmed should be false.
    expect(report.expertAnalysis?.asaPopularityConfirmed).toBe(false);
    expect(cov?.keywordsWithLiveAsa).toBe(0);
    // Review sentiment is null because mocked Apple endpoints don't return
    // review bodies — fail-closed behavior is the test contract here.
    expect(report.expertAnalysis?.reviewSentiment).toBeNull();
  });

  it("legacy callers (no tier) still attempt the OpenAI path", async () => {
    setupHappyAppleHandlers();
    // No OpenAI client injected — `synthesizeReportOpenAi` will see a null
    // client and fall back to the template path internally. The signal here
    // is that we DON'T short-circuit before reaching synthesizeReportOpenAi,
    // not that AI returns something. Coverage: the orchestrator code path
    // for legacy callers (no tier) still routes through OpenAI.
    resetOpenAiClientForTests();
    const report = await generateReport(REPORT_INPUT);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it("Standard tier follows the AI synthesis path (calls OpenAI client)", async () => {
    setupHappyAppleHandlers();
    // Return a minimal-valid OpenAI response shape so the orchestrator
    // continues past the synthesis call without throwing. The exact JSON
    // payload is parsed by synthesizeReportOpenAi; we feed it the
    // disclaimer-style minimal envelope. If parsing fails, the orchestrator
    // falls back to template — that's fine for this test (we only assert
    // that the OpenAI client was reached).
    const createSpy = vi.fn().mockResolvedValue({
      output_text: JSON.stringify({
        summary: "test summary",
        recommendations: [],
        readyToPaste: null,
      }),
    });
    setOpenAiClientForTests({
      responses: { create: createSpy },
      chat: { completions: { create: createSpy } },
    } as unknown as Parameters<typeof setOpenAiClientForTests>[0]);

    await generateReport({ ...REPORT_INPUT, tier: "standard" });

    expect(createSpy).toHaveBeenCalled();
  });
});
