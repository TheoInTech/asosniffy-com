import { Redis } from "@upstash/redis";
import { env } from "../env.js";

// Cache client interface. Backed by Upstash REST when both
// UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set; otherwise by
// an in-memory Map with lazy expiry. The in-memory mode is what runs in
// vitest and in `pnpm dev` without infra.

export interface CacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  readonly backend: "upstash" | "memory";
}

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

class MemoryCacheClient implements CacheClient {
  readonly backend = "memory" as const;
  private readonly store = new Map<string, MemoryEntry>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

class UpstashCacheClient implements CacheClient {
  readonly backend = "upstash" as const;
  private readonly redis: Redis;

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token });
  }

  async get(key: string): Promise<string | null> {
    // Upstash auto-deserializes JSON — force a string round-trip so the
    // wrapper can JSON.parse what it put in.
    const raw = await this.redis.get<unknown>(key);
    if (raw === null || raw === undefined) return null;
    return typeof raw === "string" ? raw : JSON.stringify(raw);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, { ex: ttlSeconds });
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }
}

let singleton: CacheClient | null = null;

export function getCacheClient(): CacheClient {
  if (singleton) return singleton;
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    singleton = new UpstashCacheClient(url, token);
  } else {
    singleton = new MemoryCacheClient();
  }
  return singleton;
}

export function resetCacheClientForTests(): void {
  if (singleton && singleton.backend === "memory") {
    (singleton as MemoryCacheClient).clear();
  }
  singleton = null;
}
