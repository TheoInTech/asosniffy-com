import { describe, expect, it } from "vitest";
import { lookupApp } from "../../../src/providers/apple/itunes.js";

// Live tests hit real Apple endpoints. Gated by RUN_LIVE_TESTS=1 so they
// don't flake CI on Apple-side rate limiting or network issues.
const RUN_LIVE = process.env.RUN_LIVE_TESTS === "1";

describe.skipIf(!RUN_LIVE)("Apple iTunes — live", () => {
  it("lookupApp returns Duolingo (id=570060128) from production", async () => {
    const result = await lookupApp({ id: "570060128", country: "US" });
    if ("error" in result) {
      throw new Error(`Live Apple lookup failed: ${result.error}`);
    }
    expect(result.id).toBe("570060128");
    expect(result.name.length).toBeGreaterThan(0);
    expect(result.developer.length).toBeGreaterThan(0);
  }, 15000);
});
