import OpenAI from "openai";
import { env } from "../env.js";

// Lazy OpenAI client singleton. Returns null when OPENAI_API_KEY is unset so
// callers can take the template fallback path without constructing a client.
//
// Exposes a setter for tests — vitest-friendly DI without ranking the singleton
// pattern as a load-bearing detail.

let cached: OpenAI | null | undefined;

export function getOpenAiClient(): OpenAI | null {
  if (cached !== undefined) return cached;
  if (!env.OPENAI_API_KEY) {
    cached = null;
    return null;
  }
  cached = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
  });
  return cached;
}

export function setOpenAiClientForTests(client: OpenAI | null): void {
  cached = client;
}

export function resetOpenAiClientForTests(): void {
  cached = undefined;
}
