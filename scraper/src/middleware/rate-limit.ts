import { createHash, randomBytes } from "node:crypto";
import { createMiddleware } from "hono/factory";
import { env } from "../env.js";
import { getCacheClient } from "../cache/redis.js";

// Phase 5 — per-IP + per-tuple rate limiting.
//
// Sliding-minute and rolling-daily buckets via CacheClient.incr (the same
// atomic counter the Phase-2 token bucket uses). Bucket keys are
// `aso:rl:{namespace}:{bucket}:{hashedIdentifier}:{minuteOrDay}` so two
// callers from different IPs never share state.
//
// IP hashing: callers' raw IPs never hit Redis. We hash with a salt that
// rotates every 24h (env.RL_IP_SALT can pin it; otherwise we generate one
// per process boot). Bucket counters auto-expire at the window boundary
// so day-old hashes evict naturally.

const BOOT_RANDOM_SALT = env.RL_IP_SALT ?? randomBytes(16).toString("hex");

export interface RateLimitConfig {
  // Logical namespace for the rate limiter (one per protected endpoint).
  // Becomes part of the bucket key so /sample and /quote keep independent
  // counters even from the same IP.
  namespace: string;
  perMinute: number;
  perDay: number;
}

export interface RateLimitTupleConfig {
  // Additional limit on a hashed (appId, country, keywords) tuple — used
  // to stop scrape-by-iteration from a single client looping through apps.
  perHour: number;
}

export interface RateLimitHeaders {
  "X-RateLimit-Limit": string;
  "X-RateLimit-Remaining": string;
  "X-RateLimit-Reset": string;
}

const DAILY_SALT_PERIOD = 24 * 60 * 60 * 1000;

function dailySalt(): string {
  return `${BOOT_RANDOM_SALT}:${Math.floor(Date.now() / DAILY_SALT_PERIOD)}`;
}

export function hashIdentifier(value: string): string {
  return createHash("sha256")
    .update(`${dailySalt()}|${value}`)
    .digest("hex")
    .slice(0, 16);
}

function clientIp(c: {
  req: { header: (name: string) => string | undefined };
  env?: { incoming?: { socket?: { remoteAddress?: string } } };
}): string {
  // Honor X-Forwarded-For from Railway / a proxy when present. Fall back
  // to a deterministic "unknown" so tests / direct connections don't all
  // share the same identity.
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = c.req.header("x-real-ip");
  if (real) return real;
  const node = c.env?.incoming?.socket?.remoteAddress;
  if (node) return node;
  return "unknown";
}

function setRateLimitHeaders(
  c: {
    header: (name: string, value: string) => void;
  },
  used: number,
  limit: number,
  windowSeconds: number,
): void {
  c.header("X-RateLimit-Limit", String(limit));
  c.header("X-RateLimit-Remaining", String(Math.max(0, limit - used)));
  c.header("X-RateLimit-Reset", String(windowSeconds));
}

// Per-IP rate limiter. Composes a minute window and a day window so
// burst-then-quiet calls and slow-but-persistent loops both get caught.
// Returns 429 with Retry-After + standard headers when either window busts.
export function rateLimitPerIp(config: RateLimitConfig) {
  return createMiddleware(async (c, next) => {
    if (env.RL_DISABLED || env.NODE_ENV === "test") {
      await next();
      return;
    }

    const cache = getCacheClient();
    const ip = clientIp(c as never);
    const ipHash = hashIdentifier(ip);
    const minuteBucket = Math.floor(Date.now() / 60_000);
    const dayBucket = Math.floor(Date.now() / 86_400_000);

    const minuteKey = `aso:rl:${config.namespace}:min:${ipHash}:${minuteBucket}`;
    const dayKey = `aso:rl:${config.namespace}:day:${ipHash}:${dayBucket}`;

    const [minuteCount, dayCount] = await Promise.all([
      cache.incr(minuteKey, 65), // 60s + 5s safety
      cache.incr(dayKey, 86_400 + 5),
    ]);

    if (minuteCount > config.perMinute) {
      setRateLimitHeaders(
        c,
        minuteCount,
        config.perMinute,
        60 - (Math.floor(Date.now() / 1000) % 60),
      );
      c.header(
        "Retry-After",
        String(60 - (Math.floor(Date.now() / 1000) % 60)),
      );
      return c.json(
        {
          error: {
            code: "rate_limited",
            message: `Too many requests. ${config.namespace} is capped at ${config.perMinute}/min.`,
          },
        },
        429,
      );
    }
    if (dayCount > config.perDay) {
      setRateLimitHeaders(c, dayCount, config.perDay, 86_400);
      c.header("Retry-After", "3600");
      return c.json(
        {
          error: {
            code: "rate_limited",
            message: `Daily cap exceeded. ${config.namespace} is capped at ${config.perDay}/day.`,
          },
        },
        429,
      );
    }

    setRateLimitHeaders(c, minuteCount, config.perMinute, 60);
    await next();
  });
}

// Per-(IP, tuple) rate limiter — protects iTunes from scrape-by-iteration.
// Caller supplies a function that builds a stable tuple string from the
// validated body (typically `${appId}|${country}|${sortedKeywords}`).
export function rateLimitPerTuple(
  config: RateLimitTupleConfig & { namespace: string },
  tupleFromBody: (body: unknown) => string | undefined,
) {
  return createMiddleware(async (c, next) => {
    if (env.RL_DISABLED || env.NODE_ENV === "test") {
      await next();
      return;
    }
    const body = c.get("parsedBody");
    const tuple = tupleFromBody(body);
    if (!tuple) {
      await next();
      return;
    }
    const ip = clientIp(c as never);
    const composite = hashIdentifier(`${ip}|${tuple}`);
    const hourBucket = Math.floor(Date.now() / 3_600_000);
    const key = `aso:rl:${config.namespace}:tuple:${composite}:${hourBucket}`;
    const count = await getCacheClient().incr(key, 3_600 + 5);

    if (count > config.perHour) {
      c.header("Retry-After", "3600");
      return c.json(
        {
          error: {
            code: "rate_limited",
            message: `Same (app, country, keywords) tuple capped at ${config.perHour}/hour from your IP.`,
          },
        },
        429,
      );
    }
    await next();
  });
}
