import { beforeEach, describe, expect, it } from "vitest";
import { recordShape } from "../../src/observability/shape-hash.js";

const { app } = await import("../../src/index.js");
const { resetCacheClientForTests } = await import(
  "../../src/cache/redis.js"
);

beforeEach(() => {
  resetCacheClientForTests();
});

describe("GET /health/drift", () => {
  it("returns the baselines + last-seen state for every committed provider", async () => {
    const res = await app.request("/health/drift", { method: "GET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      providers: Record<
        string,
        {
          baselineHash: string;
          baselineCapturedAt: string;
          lastSeenHash: string | null;
          drift: boolean;
        }
      >;
    };
    // Baselines were committed via `pnpm run baseline:shapes`; assert at
    // least the four core providers show up.
    expect(Object.keys(body.providers)).toContain("apple-itunes:/lookup");
    expect(Object.keys(body.providers)).toContain("google-play:/details");
    expect(Object.keys(body.providers)).toContain(
      "apple-reviews-rss:/customerreviews",
    );
    expect(Object.keys(body.providers)).toContain(
      "apple-search-ads:/keywords/recommendations",
    );
    for (const v of Object.values(body.providers)) {
      expect(v.baselineHash).toMatch(/^[0-9a-f]{16}$/);
      // No traffic yet in this test → lastSeenHash is null, drift is false.
      expect(v.lastSeenHash).toBeNull();
      expect(v.drift).toBe(false);
    }
  });

  it("reports drift after a provider's actual response shape diverges", async () => {
    // Seed an artificially-divergent shape into the last-seen tracker.
    await recordShape({
      provider: "apple-itunes",
      endpoint: "/lookup",
      hash: "different-from-baseline",
    });

    const res = await app.request("/health/drift", { method: "GET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      providers: Record<string, { drift: boolean; lastSeenHash: string | null }>;
    };
    const itunesLookup = body.providers["apple-itunes:/lookup"]!;
    expect(itunesLookup.drift).toBe(true);
    expect(itunesLookup.lastSeenHash).toBe("different-from-baseline");
  });
});
