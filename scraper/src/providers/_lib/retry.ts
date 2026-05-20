import { env } from "../../env.js";

// Exponential backoff with full jitter.
//
// `min(cap, base * 2^attempt) * random()` — the "full jitter" variant per
// AWS Architecture Blog: thundering-herd-friendly and unbiased.
//
// Use only for transient failures: rate-limit (429), upstream-unavailable
// (5xx that map to retry), network error. NOT 4xx other than 429 / 408.

export type Attempt = (attempt: number) => Promise<RetryDecision>;

export type RetryDecision =
  | { kind: "ok" }
  | { kind: "retry" }
  | { kind: "give_up"; reason: string };

export interface RetryOptions {
  baseMs?: number;
  capMs?: number;
  attempts?: number;
}

export async function withRetry(
  fn: Attempt,
  opts: RetryOptions = {},
): Promise<RetryDecision> {
  const baseMs = opts.baseMs ?? env.RETRY_BASE_MS;
  const capMs = opts.capMs ?? env.RETRY_CAP_MS;
  const attempts = opts.attempts ?? env.RETRY_ATTEMPTS;

  for (let i = 0; i < attempts + 1; i++) {
    const decision = await fn(i);
    if (decision.kind !== "retry") return decision;
    if (i === attempts) return { kind: "give_up", reason: "max_attempts" };
    const delay = backoffMs(i, baseMs, capMs);
    await sleep(delay);
  }
  return { kind: "give_up", reason: "max_attempts" };
}

// Exposed for testing — deterministic given a seeded random source.
export function backoffMs(
  attempt: number,
  baseMs: number,
  capMs: number,
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(capMs, baseMs * Math.pow(2, attempt));
  return Math.floor(ceiling * random());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Classify HTTP status into retryability. Honors the "no 4xx except 429/408"
// rule from the Phase-2 plan.
export function isRetryableHttpStatus(status: number): boolean {
  if (status === 408) return true; // Request Timeout
  if (status === 429) return true; // Too Many Requests
  if (status >= 500 && status <= 599) return true;
  return false;
}
