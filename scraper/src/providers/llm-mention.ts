import { env } from "../env.js";
import { getOpenAiClient } from "../synthesis/openai-client.js";
import { withCache } from "../cache/wrapper.js";
import { cacheKey } from "../cache/keys.js";
import { computeOpenAiCost } from "../synthesis/cost.js";
import type { CountryCode, Provenance, Store } from "../schemas/index.js";

// Wave 1 (roadmap 1.5) — the AI-mention teaser bit for the free quote.
//
// One canonical consumer-intent prompt against the synthesis model: "does the
// model name this app when asked for the best app for the user's top
// keyword?" The single bit ("an AI assistant did not name your app for
// 'habit tracker'") is the emotionally strongest free-tier hook in the
// research corpus, and it previews the paid Wave-2 share-of-voice section
// without leaking it (PLAN.md §22: one bit per funnel edge).
//
// Honesty constraints:
//   • This is ONE prompt against ONE model — a smoke signal, not a
//     measurement. The V5 pilot (docs/research/2026-06-discoverability/
//     v5-probe-pilot.md) quantifies the rerun variance; the paid probe
//     averages across prompts and models, this teaser deliberately does not.
//   • Provenance "live" on a fresh probe; the cache wrapper rewrites it to
//     "cached" on 7-day-TTL hits, so a quote never silently re-serves a
//     stale bit as fresh.
//   • Flag-gated (AI_MENTION_TEASER_ENABLED, default off) and pennies-cheap
//     (~$0.0002/probe on the default model; amortized ~10x lower by the
//     weekly cache). Failure of any kind degrades to null — the quote never
//     blocks on OpenAI.

export interface AiMentionProbe {
  mentioned: boolean;
  model: string;
  intent: string;
  checkedAt: string;
  provenance: Provenance;
}

export interface AiMentionInput {
  appId: string;
  appName: string;
  keyword: string;
  store: Store;
  country: CountryCode;
}

const PROVIDER = "openai-mention";
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

// Mention detection. LLM answers say the BRAND, not the keyword-stuffed
// listing name ("Streaks", not "Streaks - Habit Tracker"; "HabitKit", not
// "Habit Tracker - HabitKit" — the brand can sit in ANY segment), so we
// match:
//   1. the full listing name on word boundaries, OR
//   2. any separator-delimited segment that is a single distinctive token
//      (>=4 chars). Generic multi-word segments like "Habit Tracker" are
//      deliberately excluded: they would false-positive on every answer
//      about the category, which is worse than a false negative for a
//      teaser whose whole job is "the model did NOT name you".
export function detectNameMention(answer: string, listingName: string): boolean {
  const candidates: string[] = [];
  const full = listingName.trim();
  if (full.length > 0) candidates.push(full);
  for (const rawSegment of full.split(/[-–:|·]/)) {
    const segment = rawSegment.trim();
    if (segment.length >= 4 && segment !== full && !segment.includes(" ")) {
      candidates.push(segment);
    }
  }
  return candidates.some((c) => {
    const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\W)${escaped}(\\W|$)`, "i").test(answer);
  });
}

export async function probeAiMention(
  input: AiMentionInput,
  opts?: { enabled?: boolean },
): Promise<AiMentionProbe | null> {
  const enabled = opts?.enabled ?? env.AI_MENTION_TEASER_ENABLED;
  if (!enabled) return null;
  const client = getOpenAiClient();
  if (client === null) return null;

  const result = await withCache<AiMentionProbe | { error: string }>(
    async () => {
      try {
        const device = input.store === "ios" ? "iPhone" : "Android";
        const completion = await client.chat.completions.create({
          model: env.OPENAI_MODEL,
          messages: [
            {
              role: "user",
              content: `What's the best ${device} app for ${input.keyword}? Answer in 2-3 sentences.`,
            },
          ],
        });
        const text = completion.choices[0]?.message?.content ?? "";
        if (text.length === 0) return { error: "empty_response" };
        const cost = computeOpenAiCost({
          model: env.OPENAI_MODEL,
          inputTokens: completion.usage?.prompt_tokens ?? 0,
          outputTokens: completion.usage?.completion_tokens ?? 0,
        });
        if (process.env.ENABLE_REQUEST_LOG !== "false") {
          process.stdout.write(
            `${JSON.stringify({
              ts: new Date().toISOString(),
              level: "info",
              event: "ai_mention_probe",
              keyword: input.keyword,
              appId: input.appId,
              costUsd: cost.costUsd,
            })}\n`,
          );
        }
        return {
          mentioned: detectNameMention(text, input.appName),
          model: env.OPENAI_MODEL,
          intent: input.keyword,
          checkedAt: new Date().toISOString(),
          provenance: "live" as const,
        };
      } catch (err) {
        // Error envelope → withCache skips caching → next quote retries.
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
    {
      key: cacheKey({
        namespace: "llm:ai-mention",
        country: input.country,
        appId: input.appId,
        extra: { keyword: input.keyword.toLowerCase(), model: env.OPENAI_MODEL },
      }),
      ttlSeconds: SEVEN_DAYS_SECONDS,
      namespace: "llm:ai-mention",
      audit: { provider: PROVIDER, endpoint: "/chat/completions" },
    },
  );

  if ("error" in result) return null;
  return result;
}
