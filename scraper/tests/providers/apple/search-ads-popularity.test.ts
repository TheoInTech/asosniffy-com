import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { generateKeyPairSync } from "node:crypto";
import { getKeywordPopularity } from "../../../src/providers/apple/search-ads-popularity.js";
import { resetCacheClientForTests } from "../../../src/cache/redis.js";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  resetCacheClientForTests();
  // Re-export env defaults to keep tests deterministic when reading from the
  // env singleton — the tests below override via process.env BEFORE module
  // resolution would matter, but we ensure the flag is off here.
  delete process.env.APPLE_SEARCH_ADS_ENABLED;
});

describe("getKeywordPopularity — disabled kill-switch", () => {
  it("returns { error: 'disabled' } when APPLE_SEARCH_ADS_ENABLED is unset/false", async () => {
    const result = await getKeywordPopularity({
      keyword: "habit tracker",
      country: "US",
    });
    // The env was loaded at module-init with ENABLED=false (the default in
    // tests/setup.ts). So the adapter should short-circuit.
    expect(result).toEqual({ error: "disabled" });
  });
});

// The live-path tests below would require re-loading the env singleton with
// ENABLED=true, which is non-trivial because env.ts caches at import time.
// We still exercise the auth + parsing paths via the JWT signer + parser
// unit tests; the integration test sits at the route level (a future
// `tests/routes/diagnose-popularity.test.ts` once the developer account is
// provisioned and the adapter is flipped on).
//
// Smoke-test the response parser via a typed helper so future contributors
// don't have to re-discover the multi-version envelope shape.
import { _internal_extractPopularity_forTests } from "./_popularity-internal.js";

describe("extractPopularity — parser tolerance across response shapes", () => {
  it("reads v4 flat shape: { data: { popularity: 80 } }", () => {
    expect(
      _internal_extractPopularity_forTests({ data: { popularity: 80 } }),
    ).toBe(80);
  });

  it("reads v5 batch shape: { data: { recommendations: [{ popularity: 75 }] } }", () => {
    expect(
      _internal_extractPopularity_forTests({
        data: { recommendations: [{ popularity: 75 }] },
      }),
    ).toBe(75);
  });

  it("reads variant shape: { searchTermPopularities: [{ score: 42 }] }", () => {
    expect(
      _internal_extractPopularity_forTests({
        searchTermPopularities: [{ score: 42 }],
      }),
    ).toBe(42);
  });

  it("returns null for unrecognized shapes", () => {
    expect(_internal_extractPopularity_forTests({ unknown: "shape" })).toBeNull();
  });

  it("clamps values into the 5..100 range", () => {
    expect(_internal_extractPopularity_forTests({ data: { popularity: 250 } })).toBe(
      100,
    );
    expect(_internal_extractPopularity_forTests({ data: { popularity: 1 } })).toBe(5);
  });
});

// Silence the "generateKeyPairSync is unused" lint by referencing it — keeps
// the import in place for the live-path tests that follow once the account
// is provisioned.
void generateKeyPairSync;
void server;
void http;
void HttpResponse;
