import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runLlmProbe, type LlmProbeInput } from "../../src/providers/llm-probe.js";
import {
  resetOpenAiClientForTests,
  setOpenAiClientForTests,
} from "../../src/synthesis/openai-client.js";
import { resetCacheClientForTests } from "../../src/cache/redis.js";

// Fake OpenAI client. `respond` gets a 0-based call index and returns the
// answer text — or throws to simulate a failed call. Returns the vi.fn so
// tests can count calls and inspect request bodies without casts.
function fakeOpenAi(respond: (callIdx: number) => string) {
  let n = 0;
  const create = vi.fn(async (body: { model: string; messages: Array<{ content: string }> }) => {
    const i = n;
    n += 1;
    const text = respond(i); // may throw
    void body;
    return {
      choices: [{ message: { content: text } }],
      usage: { prompt_tokens: 20, completion_tokens: 40 },
    };
  });
  const client = { chat: { completions: { create } } } as never;
  return { client, create };
}

const on = { enabled: true };

const input: LlmProbeInput = {
  appId: "963034692",
  appName: "Streaks",
  intents: ["habit tracker"],
  competitors: [{ name: "HabitKit" }, { name: "Productive" }],
  store: "ios",
  country: "US",
};

describe("runLlmProbe", () => {
  beforeEach(() => {
    resetCacheClientForTests();
  });
  afterEach(() => {
    resetOpenAiClientForTests();
    vi.restoreAllMocks();
  });

  it("returns null when the flag is off (opts and env default)", async () => {
    const { client, create } = fakeOpenAi(() => "Streaks is great.");
    setOpenAiClientForTests(client);
    expect(await runLlmProbe(input, { enabled: false })).toBeNull();
    // Default (no opts) follows env.LLM_PROBE_ENABLED, false in tests.
    expect(await runLlmProbe(input)).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("returns null when no OpenAI client is configured", async () => {
    setOpenAiClientForTests(null);
    expect(await runLlmProbe(input, on)).toBeNull();
  });

  it("returns null on insufficient input without spending a single call", async () => {
    const { client, create } = fakeOpenAi(() => "Streaks.");
    setOpenAiClientForTests(client);
    expect(await runLlmProbe({ ...input, intents: [] }, on)).toBeNull();
    expect(await runLlmProbe({ ...input, appName: "  " }, on)).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("runs the full matrix and aggregates a live AiVisibility result", async () => {
    const { client, create } = fakeOpenAi(
      () => "Streaks is the best pick. HabitKit is solid too.",
    );
    setOpenAiClientForTests(client);
    const out = await runLlmProbe(input, on);
    expect(out).not.toBeNull();
    // 10 templates x 1 intent x 2 replicates (default) x 1 model = 20 calls.
    expect(create).toHaveBeenCalledTimes(20);
    expect(out!.totalCalls).toBe(20);
    expect(out!.failedCalls).toBe(0);
    expect(out!.provenance).toBe("live");
    expect(out!.promptSetVersion).toBe("v5-10");
    expect(out!.modelsUsed).toEqual(["gpt-5.4-mini"]); // env default model
    expect(out!.targetSov).toBe(1);
    // Tie at 1.0 between target and HabitKit -> target ranks first.
    expect(out!.shareOfVoice.map((s) => s.name)).toEqual([
      "Streaks",
      "HabitKit",
      "Productive",
    ]);
    expect(out!.shareOfVoice[2]!.mentionRate).toBe(0);
    expect(out!.deterministicMisses).toEqual([]);
    // SOV 1.0 is outside mid-SOV -> ±5pp/√2.
    expect(out!.sovBand.plusMinusPp).toBeCloseTo(3.5, 6);
    // First call is template 0, intent filled, iOS device word.
    expect(create.mock.calls[0]![0]!.messages[0]!.content).toBe(
      "What's the best iPhone app for habit tracker? Answer in 2-3 sentences.",
    );
    expect(out!.promptTable[0]!.prompt).toBe(
      "What's the best iPhone app for habit tracker? Answer in 2-3 sentences.",
    );
  });

  it("drops failed calls but keeps the run when failures stay at/below 30%", async () => {
    // Calls 4, 9, 14, 19 fail -> 4/20 = 20%.
    const { client } = fakeOpenAi((i) => {
      if (i % 5 === 4) throw new Error("429 quota");
      return "Streaks wins.";
    });
    setOpenAiClientForTests(client);
    const out = await runLlmProbe(input, on);
    expect(out).not.toBeNull();
    expect(out!.totalCalls).toBe(16);
    expect(out!.failedCalls).toBe(4);
    expect(out!.provenance).toBe("live");
  });

  it("returns null (and does not cache) when more than 30% of calls fail", async () => {
    // Every second call fails -> 50%.
    const failing = fakeOpenAi((i) => {
      if (i % 2 === 0) throw new Error("boom");
      return "Streaks wins.";
    });
    setOpenAiClientForTests(failing.client);
    expect(await runLlmProbe(input, on)).toBeNull();

    // Recovery proves the broken run was not cached: a healthy client gets
    // a fresh live result under the same cache key.
    const healthy = fakeOpenAi(() => "Streaks wins.");
    setOpenAiClientForTests(healthy.client);
    const out = await runLlmProbe(input, on);
    expect(out).not.toBeNull();
    expect(out!.provenance).toBe("live");
  });

  it("serves the second run from cache with provenance rewritten to cached", async () => {
    const { client, create } = fakeOpenAi(() => "Streaks wins. HabitKit too.");
    setOpenAiClientForTests(client);
    const first = await runLlmProbe(input, on);
    const second = await runLlmProbe(input, on);
    expect(first!.provenance).toBe("live");
    expect(second!.provenance).toBe("cached");
    expect(create).toHaveBeenCalledTimes(20); // no second matrix
  });

  it("caps the matrix at 60 calls (clamps intents to 2, then replicates)", async () => {
    const { client, create } = fakeOpenAi(() => "Streaks.");
    setOpenAiClientForTests(client);
    const wide: LlmProbeInput = {
      ...input,
      // 3 intents requested -> clamped to 2; replicates 10 requested ->
      // floor(60 / (10 templates x 2 intents x 1 model)) = 3.
      intents: ["habit tracker", "streak counter", "daily routine"],
    };
    const out = await runLlmProbe(wide, { enabled: true, replicates: 10 });
    expect(create).toHaveBeenCalledTimes(60);
    expect(out!.totalCalls).toBe(60);
    // Only the first two intents survive the clamp.
    const intents = new Set(out!.promptTable.map((p) => p.intent));
    expect(intents).toEqual(new Set(["habit tracker", "streak counter"]));
  });
});
