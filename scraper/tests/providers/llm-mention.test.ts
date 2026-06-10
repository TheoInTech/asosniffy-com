import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  detectNameMention,
  probeAiMention,
} from "../../src/providers/llm-mention.js";
import {
  resetOpenAiClientForTests,
  setOpenAiClientForTests,
} from "../../src/synthesis/openai-client.js";
import { resetCacheClientForTests } from "../../src/cache/redis.js";

function fakeOpenAi(responseText: string | Error) {
  return {
    chat: {
      completions: {
        create: vi.fn(async () => {
          if (responseText instanceof Error) throw responseText;
          return {
            choices: [{ message: { content: responseText } }],
            usage: { prompt_tokens: 20, completion_tokens: 40 },
          };
        }),
      },
    },
  } as never;
}

describe("detectNameMention", () => {
  it("matches the full app name case-insensitively on word boundaries", () => {
    expect(detectNameMention("Try Flighty for live delay maps.", "Flighty")).toBe(true);
    expect(detectNameMention("flightyish apps exist", "Flighty")).toBe(false);
    expect(detectNameMention("I recommend FLIGHTY.", "Flighty")).toBe(true);
  });

  it("matches a distinctive single-token first segment of a compound listing name", () => {
    // Listing names are often "Brand - Keyword Stuffing"; the brand segment
    // is what an LLM answer would actually say.
    expect(
      detectNameMention("Streaks is the classic choice.", "Streaks - Habit Tracker"),
    ).toBe(true);
  });

  it("does NOT fall back to a generic multi-word first segment", () => {
    // "Habit Tracker - HabitKit": matching bare "Habit Tracker" would
    // false-positive on every answer about the category.
    expect(
      detectNameMention("Any habit tracker works.", "Habit Tracker - HabitKit"),
    ).toBe(false);
    expect(
      detectNameMention("HabitKit is great.", "Habit Tracker - HabitKit"),
    ).toBe(true);
  });
});

describe("probeAiMention", () => {
  beforeEach(() => {
    resetCacheClientForTests();
  });
  afterEach(() => {
    resetOpenAiClientForTests();
    vi.restoreAllMocks();
  });

  // env.AI_MENTION_TEASER_ENABLED is a cached singleton (see the
  // search-ads provider tests for the same constraint) — the provider takes
  // the flag via opts so tests stay deterministic without env reloads.
  const on = { enabled: true };

  const input = {
    appId: "963034692",
    appName: "Streaks",
    keyword: "habit tracker",
    store: "ios" as const,
    country: "US" as const,
  };

  it("returns null when the flag is off", async () => {
    setOpenAiClientForTests(fakeOpenAi("Streaks is great"));
    expect(await probeAiMention(input, { enabled: false })).toBeNull();
    // Default (no opts) follows env, which is false in tests.
    expect(await probeAiMention(input)).toBeNull();
  });

  it("returns null when no OpenAI client is configured", async () => {
    setOpenAiClientForTests(null);
    expect(await probeAiMention(input, on)).toBeNull();
  });

  it("returns mentioned=true with provenance live when the answer names the app", async () => {
    setOpenAiClientForTests(fakeOpenAi("Streaks is the classic habit tracker."));
    const probe = await probeAiMention(input, on);
    expect(probe).not.toBeNull();
    expect(probe!.mentioned).toBe(true);
    expect(probe!.provenance).toBe("live");
    expect(probe!.intent).toBe("habit tracker");
    expect(probe!.model.length).toBeGreaterThan(0);
  });

  it("returns mentioned=false when the answer names competitors only", async () => {
    setOpenAiClientForTests(fakeOpenAi("HabitKit and Productive are the leaders."));
    const probe = await probeAiMention(input, on);
    expect(probe!.mentioned).toBe(false);
  });

  it("serves the second call from cache with provenance cached", async () => {
    const client = fakeOpenAi("Streaks wins.");
    setOpenAiClientForTests(client);
    const first = await probeAiMention(input, on);
    const second = await probeAiMention(input, on);
    expect(first!.provenance).toBe("live");
    expect(second!.provenance).toBe("cached");
    expect((client as any).chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it("returns null (and does not cache) on API failure", async () => {
    setOpenAiClientForTests(fakeOpenAi(new Error("429 quota")));
    expect(await probeAiMention(input, on)).toBeNull();
    // Recovery: a working client succeeds — failure was not cached.
    setOpenAiClientForTests(fakeOpenAi("Streaks again."));
    const probe = await probeAiMention(input, on);
    expect(probe!.mentioned).toBe(true);
    expect(probe!.provenance).toBe("live");
  });
});
