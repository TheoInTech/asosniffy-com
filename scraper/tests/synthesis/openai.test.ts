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
import OpenAI from "openai";
import { synthesizeReportOpenAi } from "../../src/synthesis/openai.js";
import type { SynthesisInput } from "../../src/synthesis/template.js";
import {
  RecommendationItem,
  ReadyToPaste,
} from "../../src/schemas/index.js";

const OPENAI_CHAT = "https://api.openai.com/v1/chat/completions";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeClient(): OpenAI {
  return new OpenAI({ apiKey: "sk-test-fake-key" });
}

function buildInput(): SynthesisInput {
  return {
    scoring: {
      metadata: {
        overall: 62,
        title: {
          score: 70,
          reasons: ["Strong brand recall."],
          negativeReasons: [],
        },
        subtitle: {
          score: 55,
          reasons: ["Subtitle missing primary keyword."],
          negativeReasons: ["Subtitle missing primary keyword."],
        },
        keywordsField: {
          score: 48,
          reasons: ["Two slots duplicate the title."],
          negativeReasons: ["Two slots duplicate the title."],
        },
        description: {
          score: 72,
          reasons: ["Description includes a CTA."],
          negativeReasons: [],
        },
      },
      keywords: [
        {
          keyword: "habit tracker",
          rankBucket: "31-50",
          intentScore: 0.85,
          confidence: "medium",
          provenance: "live",
          coverageInTitle: false,
          coverageInSubtitle: false,
          coverageInDescription: true,
          action: "add_to_title",
        },
      ],
      competitors: [
        {
          appId: "1000000101",
          name: "Streakly",
          overlapKeywords: ["habit tracker"],
          uniqueToCompetitor: ["mindful", "planner"],
          overlapScore: 0.5,
          provenance: "live",
        },
      ],
    },
    context: {
      detectedApp: {
        id: "1",
        name: "Pawprint Habits",
        developer: "Sniffy Labs",
      },
      appRecord: null,
      keywords: ["habit tracker"],
    },
  };
}

function aiReply(payload: object, usage?: object): object {
  return {
    id: "chatcmpl-test-1",
    object: "chat.completion",
    created: 1717182982,
    model: "gpt-5.4-mini",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: JSON.stringify(payload) },
        finish_reason: "stop",
      },
    ],
    usage: usage ?? {
      prompt_tokens: 850,
      completion_tokens: 220,
      total_tokens: 1070,
    },
  };
}

const VALID_AI_PAYLOAD = {
  summary:
    "Pawprint Habits scores 62/100. The fastest win is promoting 'habit tracker' into the title. Streakly is winning surface area on mindful and planner.",
  recommendations: [
    {
      rank: 1,
      action: "Add 'habit tracker' to the app title.",
      impact: "high",
      effort: "medium",
      rationale:
        "Title is Apple's heaviest-weighted indexed field. Promoting 'habit tracker' out of the keywords field captures the biggest single rank lever.",
    },
    {
      rank: 2,
      action: "Rewrite the subtitle.",
      impact: "medium",
      effort: "low",
      rationale: "Subtitle is missing the primary keyword.",
    },
    {
      rank: 3,
      action: "Audit overlap with Streakly's mindful/planner positioning.",
      impact: "medium",
      effort: "medium",
      rationale:
        "Streakly leans on mindful and planner — terms your listing doesn't carry.",
    },
  ],
  readyToPaste: {
    title: {
      recommended: "Pawprint Habits — Tracker",
      changeReason: "Promotes 'habit tracker' (rank 31-50) into the title.",
    },
    subtitle: {
      recommended: "Habit Tracker · Streaks",
      changeReason: "Lifts the highest-intent term into the indexed subtitle.",
    },
    keywordsField: {
      recommended: "habit,routine,mindful,planner",
      changeReason: "Drops title-redundant tokens and adds competitor terms.",
    },
    shortDescription: {
      recommended:
        "Pawprint Habits: habit tracker and routines for indie builders.",
      changeReason: "Leads with the top-intent keyword.",
    },
  },
};

describe("synthesizeReportOpenAi — happy path", () => {
  it("returns the OpenAI-generated synthesis when the response is schema-valid", async () => {
    server.use(
      http.post(OPENAI_CHAT, () => HttpResponse.json(aiReply(VALID_AI_PAYLOAD))),
    );

    const result = await synthesizeReportOpenAi(buildInput(), {
      requestId: "req_test_001",
      client: makeClient(),
    });

    expect(result.summary).toContain("Pawprint Habits");
    expect(result.recommendations).toHaveLength(3);
    for (const rec of result.recommendations) {
      expect(() => RecommendationItem.parse(rec)).not.toThrow();
    }
    expect(() => ReadyToPaste.parse(result.readyToPaste)).not.toThrow();
  });

  it("re-numbers recommendation ranks to 1..N", async () => {
    const skewedPayload = {
      ...VALID_AI_PAYLOAD,
      recommendations: VALID_AI_PAYLOAD.recommendations.map((r, i) => ({
        ...r,
        rank: i + 5, // model returned 5, 6, 7
      })),
    };
    server.use(http.post(OPENAI_CHAT, () => HttpResponse.json(aiReply(skewedPayload))));

    const result = await synthesizeReportOpenAi(buildInput(), {
      requestId: "req_test_002",
      client: makeClient(),
    });
    expect(result.recommendations.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("emits a cost-telemetry log line with outcome=synth_success", async () => {
    server.use(
      http.post(OPENAI_CHAT, () =>
        HttpResponse.json(
          aiReply(VALID_AI_PAYLOAD, {
            prompt_tokens: 1000,
            completion_tokens: 250,
            total_tokens: 1250,
          }),
        ),
      ),
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await synthesizeReportOpenAi(buildInput(), {
        requestId: "req_test_003",
        client: makeClient(),
      });

      // Read mock.calls BEFORE restore — restore clears the call history.
      const logged = logSpy.mock.calls.flat() as unknown[];
      const costLogs = logged
        .filter((s): s is string => typeof s === "string")
        .map((s) => safeParse(s))
        .filter(
          (p): p is Record<string, unknown> =>
            p !== null && (p as { kind?: string }).kind === "openai_cost",
        );

      expect(costLogs.length).toBeGreaterThan(0);
      const last = costLogs[costLogs.length - 1]!;
      expect(last.outcome).toBe("synth_success");
      expect(last.requestId).toBe("req_test_003");
      expect(last.modelInputTokens).toBe(1000);
      expect(last.modelOutputTokens).toBe(250);
      expect(typeof last.costUsd).toBe("number");
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe("synthesizeReportOpenAi — echo coercion", () => {
  it("coerces recommended === current to recommended:null defensively", async () => {
    const echoPayload = {
      ...VALID_AI_PAYLOAD,
      readyToPaste: {
        title: {
          recommended: "Pawprint Habits",
          changeReason: "Some reasoning that should be discarded.",
        },
        subtitle: {
          recommended: "Different subtitle here",
          changeReason: "Real improvement.",
        },
        keywordsField: {
          recommended: "habit",
          changeReason: "Adjusted.",
        },
        shortDescription: {
          recommended: "Pawprint Habits short description.",
          changeReason: "Suggested copy.",
        },
      },
    };
    server.use(http.post(OPENAI_CHAT, () => HttpResponse.json(aiReply(echoPayload))));

    const result = await synthesizeReportOpenAi(buildInput(), {
      requestId: "req_test_echo",
      client: makeClient(),
    });

    // Title.current === detectedApp.name "Pawprint Habits" → must coerce to null
    expect(result.readyToPaste.title.recommended).toBeNull();
    expect(result.readyToPaste.title.changeReason).toBeNull();
    expect(result.readyToPaste.title.current).toBe("Pawprint Habits");
    // Subtitle differs so it stays
    expect(result.readyToPaste.subtitle.recommended).toBe("Different subtitle here");
    expect(result.readyToPaste.source).toBe("ai");
  });
});

describe("synthesizeReportOpenAi — fallback paths", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("falls back to template when client is null (missing key)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const result = await synthesizeReportOpenAi(buildInput(), {
        requestId: "req_test_missing",
        client: null,
      });
      expect(result.summary.length).toBeGreaterThan(0);
      expect(result.recommendations.length).toBeGreaterThan(0);

      const fallbackLog = lastFallbackLog(logSpy);
      expect(fallbackLog?.fallbackReason).toBe("missing_api_key");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("falls back when OpenAI returns malformed JSON", async () => {
    const malformedReply = {
      id: "chatcmpl-test",
      object: "chat.completion",
      created: 1,
      model: "gpt-5.4-mini",
      choices: [
        { index: 0, message: { role: "assistant", content: "{not json" }, finish_reason: "stop" },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 },
    };
    server.use(http.post(OPENAI_CHAT, () => HttpResponse.json(malformedReply)));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const result = await synthesizeReportOpenAi(buildInput(), {
        requestId: "req_test_badjson",
        client: makeClient(),
      });
      expect(result.summary.length).toBeGreaterThan(0);

      const fallbackLog = lastFallbackLog(logSpy);
      expect(fallbackLog?.fallbackReason?.startsWith("json_parse_failed")).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  it("falls back when the response shape fails Zod validation", async () => {
    const wrongShape = {
      summary: 42, // not a string
      recommendations: [],
      readyToPaste: {},
    };
    server.use(http.post(OPENAI_CHAT, () => HttpResponse.json(aiReply(wrongShape))));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const result = await synthesizeReportOpenAi(buildInput(), {
        requestId: "req_test_shape",
        client: makeClient(),
      });
      expect(result.summary.length).toBeGreaterThan(0);

      const fallbackLog = lastFallbackLog(logSpy);
      expect(fallbackLog?.fallbackReason?.startsWith("schema_validation_failed")).toBe(
        true,
      );
    } finally {
      logSpy.mockRestore();
    }
  });

  it("falls back on OpenAI request error (500)", async () => {
    server.use(
      http.post(OPENAI_CHAT, () => new HttpResponse(null, { status: 500 })),
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const result = await synthesizeReportOpenAi(buildInput(), {
        requestId: "req_test_500",
        client: makeClient(),
      });
      expect(result.summary.length).toBeGreaterThan(0);

      const fallbackLog = lastFallbackLog(logSpy);
      expect(fallbackLog?.fallbackReason?.startsWith("request_error")).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });
});

function safeParse(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s);
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function lastFallbackLog(spy: ReturnType<typeof vi.spyOn>): {
  outcome?: string;
  fallbackReason?: string;
} | undefined {
  const calls = spy.mock.calls.flat() as unknown[];
  const parsed = calls
    .filter((c): c is string => typeof c === "string")
    .map((s) => safeParse(s))
    .filter((p): p is Record<string, unknown> => p !== null && p.kind === "openai_cost");
  const last = parsed[parsed.length - 1];
  return last as { outcome?: string; fallbackReason?: string } | undefined;
}
