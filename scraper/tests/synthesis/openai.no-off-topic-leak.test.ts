import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import OpenAI from "openai";
import { synthesizeReportOpenAi } from "../../src/synthesis/openai.js";
import {
  buildFullReportPrompt,
  findOffPoolTokens,
} from "../../src/synthesis/prompts/full-report.js";
import type { SynthesisInput } from "../../src/synthesis/template.js";
import type { ScoredCandidate } from "../../src/scoring/relevance.js";

// Phase 9 — OpenAI off-topic-leak regression. The post-hoc validator in
// openai.ts forces a template fallback when the model invents a token
// that's neither in the user's input keywords nor in the relevance-gated
// pool. This protects the paid /diagnose path on Morph Mainnet: payments
// are non-refundable, so if the model ignores the prompt rule and bleeds
// off-category competitor terms (e.g. "tournament_bracket" for a Sports
// app from a Productivity competitor) we still ship a clean report from
// the deterministic template.

const OPENAI_CHAT = "https://api.openai.com/v1/chat/completions";
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeClient(): OpenAI {
  return new OpenAI({ apiKey: "sk-test-fake-key" });
}

function offTopicScoredCandidates(): ScoredCandidate[] {
  return [
    {
      keyword: "tournament_bracket",
      origin: "competitor",
      relevanceScore: 0.3,
      relevanceLabel: "off-topic",
      categoryMatch: false,
      intentScore: 0.5,
      popularity: null,
      sourceCompetitor: "9999",
    },
  ];
}

function onTopicScoredCandidates(): ScoredCandidate[] {
  return [
    {
      keyword: "scoreboard",
      origin: "competitor",
      relevanceScore: 0.78,
      relevanceLabel: "on-topic",
      categoryMatch: true,
      intentScore: 0.55,
      popularity: null,
      sourceCompetitor: "1234",
    },
    {
      keyword: "leaderboard",
      origin: "competitor",
      relevanceScore: 0.75,
      relevanceLabel: "on-topic",
      categoryMatch: true,
      intentScore: 0.55,
      popularity: null,
      sourceCompetitor: "1234",
    },
  ];
}

function buildInput(
  overrides: Partial<SynthesisInput> = {},
): SynthesisInput {
  return {
    scoring: {
      metadata: {
        overall: 60,
        title: { score: 70, reasons: ["Brand-forward."], negativeReasons: [] },
        subtitle: {
          score: 65,
          reasons: ["Subtitle ok."],
          negativeReasons: [],
        },
        keywordsField: {
          score: 55,
          reasons: ["Has duplicates."],
          negativeReasons: ["Has duplicates."],
        },
        description: {
          score: 70,
          reasons: ["Covers category."],
          negativeReasons: [],
        },
      },
      keywords: [
        {
          keyword: "pickleball",
          rankBucket: "11-30",
          intentScore: 0.85,
          confidence: "high",
          provenance: "live",
          coverageInTitle: false,
          coverageInSubtitle: true,
          coverageInDescription: true,
          action: "add_to_title",
        },
      ],
      competitors: [
        {
          appId: "9999",
          name: "Daily Planner Pro",
          overlapKeywords: [],
          uniqueToCompetitor: ["tournament_bracket"],
          overlapScore: 0,
          provenance: "live",
        },
      ],
    },
    context: {
      detectedApp: {
        id: "999000111",
        name: "PicklePro",
        developer: "Court Labs",
      },
      appRecord: null,
      keywords: ["pickleball"],
    },
    inputProvenance: "live",
    ...overrides,
  };
}

function aiReply(payload: object): object {
  return {
    id: "chatcmpl-test-pickle-1",
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
    usage: { prompt_tokens: 800, completion_tokens: 200, total_tokens: 1000 },
  };
}

describe("buildFullReportPrompt — payload shape", () => {
  it("includes relevantKeywordPool with only on-topic + adjacent terms", () => {
    const { user } = buildFullReportPrompt(
      buildInput({
        scoredCandidates: [
          ...offTopicScoredCandidates(),
          ...onTopicScoredCandidates(),
        ],
      }),
    );
    expect(user).toContain("scoreboard");
    expect(user).toContain("leaderboard");
    expect(user).not.toContain("tournament_bracket");
  });

  it("renames the competitor payload key to relevantOpportunities (no more raw uniqueToCompetitor)", () => {
    const { user } = buildFullReportPrompt(
      buildInput({ scoredCandidates: onTopicScoredCandidates() }),
    );
    expect(user).toContain("relevantOpportunities");
    expect(user).not.toContain("uniqueToCompetitor");
  });

  it("falls back to raw competitor terms when scoredCandidates is empty (legacy callers)", () => {
    const { user } = buildFullReportPrompt(buildInput());
    expect(user).toContain("tournament_bracket");
  });
});

describe("findOffPoolTokens — post-hoc validator helper", () => {
  it("returns empty set when every output token is in the pool", () => {
    const offPool = findOffPoolTokens({
      keywordsFieldRecommended: "scoreboard,leaderboard",
      inputKeywords: ["pickleball"],
      relevantKeywordPool: ["scoreboard", "leaderboard"],
    });
    expect(offPool.size).toBe(0);
  });

  it("returns empty set when every output token is in inputKeywords", () => {
    const offPool = findOffPoolTokens({
      keywordsFieldRecommended: "pickleball",
      inputKeywords: ["pickleball"],
      relevantKeywordPool: [],
    });
    expect(offPool.size).toBe(0);
  });

  it("flags an off-pool token even when others are in the pool", () => {
    const offPool = findOffPoolTokens({
      keywordsFieldRecommended: "scoreboard,leaderboard,tournament_bracket",
      inputKeywords: ["pickleball"],
      relevantKeywordPool: ["scoreboard", "leaderboard"],
    });
    expect(offPool.has("tournament_bracket")).toBe(true);
  });

  it("returns empty set when recommended is null", () => {
    const offPool = findOffPoolTokens({
      keywordsFieldRecommended: null,
      inputKeywords: [],
      relevantKeywordPool: [],
    });
    expect(offPool.size).toBe(0);
  });

  it("normalizes case and trims whitespace before checking", () => {
    const offPool = findOffPoolTokens({
      keywordsFieldRecommended: "  SCOREBOARD , Leaderboard  ",
      inputKeywords: [],
      relevantKeywordPool: ["scoreboard", "leaderboard"],
    });
    expect(offPool.size).toBe(0);
  });
});

describe("synthesizeReportOpenAi — post-hoc validator falls back on off-pool tokens", () => {
  it("falls back to template synthesis when the model invents an off-pool token", async () => {
    const cheatingPayload = {
      summary: "PicklePro looks ok.",
      recommendations: [
        {
          rank: 1,
          action: "Promote pickleball into the title.",
          impact: "high",
          effort: "medium",
          rationale: "Pickleball is the primary keyword.",
        },
      ],
      readyToPaste: {
        title: {
          recommended: "PicklePro — Pickleball",
          changeReason: "Promotes primary keyword.",
        },
        subtitle: { recommended: null, changeReason: null },
        keywordsField: {
          // The cheat: model emits the off-topic competitor term despite
          // it being absent from relevantKeywordPool. Post-hoc validator
          // must catch this and fall back to the template.
          recommended: "scoreboard,leaderboard,tournament_bracket",
          changeReason: "Mixes pool + a bonus competitor term.",
        },
        shortDescription: {
          recommended: "PicklePro: pickleball scoreboard.",
          changeReason: "Leads with primary keyword.",
        },
      },
    };
    server.use(
      http.post(OPENAI_CHAT, () => HttpResponse.json(aiReply(cheatingPayload))),
    );

    const result = await synthesizeReportOpenAi(
      buildInput({ scoredCandidates: onTopicScoredCandidates() }),
      { requestId: "req_pickle_offpool", client: makeClient() },
    );
    // Template fallback marks the source as "deterministic" or
    // "template-fallback"; the AI path returns "ai". The fallback path
    // is the proof the validator fired.
    expect(result.readyToPaste.source).not.toBe("ai");
  });

  it("returns the model output when every token is in the pool", async () => {
    const cleanPayload = {
      summary: "PicklePro looks ok.",
      recommendations: [
        {
          rank: 1,
          action: "Promote pickleball into the title.",
          impact: "high",
          effort: "medium",
          rationale: "Pickleball is the primary keyword.",
        },
      ],
      readyToPaste: {
        title: {
          recommended: "PicklePro — Pickleball",
          changeReason: "Promotes primary keyword.",
        },
        subtitle: { recommended: null, changeReason: null },
        keywordsField: {
          // Phase 0 net-value guard requires the AI to preserve the user's
          // submitted keywords — dropping 'pickleball' entirely from the
          // listing's keyword pool would be a user-keyword regression. The
          // clean payload pairs pickleball with the on-topic competitor
          // coverage instead of replacing it.
          recommended: "pickleball,scoreboard,leaderboard",
          changeReason:
            "Preserves the primary user keyword and adds on-topic competitor coverage.",
        },
        shortDescription: {
          recommended: "PicklePro: pickleball scoreboard.",
          changeReason: "Leads with primary keyword.",
        },
      },
    };
    server.use(
      http.post(OPENAI_CHAT, () => HttpResponse.json(aiReply(cleanPayload))),
    );

    const result = await synthesizeReportOpenAi(
      buildInput({ scoredCandidates: onTopicScoredCandidates() }),
      { requestId: "req_pickle_clean", client: makeClient() },
    );
    expect(result.readyToPaste.source).toBe("ai");
    expect(result.readyToPaste.keywordsField.recommended).toBe(
      "pickleball,scoreboard,leaderboard",
    );
  });
});
