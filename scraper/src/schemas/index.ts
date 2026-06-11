// BUMP CHECKLIST — every version bump must touch ALL of these (CI's
// packages/cli snapshot broke twice from missing one):
//   1. this constant
//   2. scraper/src/data/fixtures.ts reportVersion
//   3. scraper/fixtures/sample-report.json reportVersion
//   4. scraper test literals: tests/schemas.test.ts, tests/routes/health.test.ts,
//      tests/routes/insights.test.ts, tests/insights/{store,redact-for-showcase}.test.ts
//   5. REGENERATE packages/cli snapshot: cd packages/cli && npx vitest run -u
//      (verify the diff is version-string/content-intended only)
export const SCHEMA_VERSION = "2026-06-mvp-6" as const;

export * from "./shared.js";
export * from "./quote.js";
export * from "./diagnose.js";
export * from "./sample.js";
export * from "./wallet.js";
export * from "./sniff-pack.js";
export * from "./insights.js";
