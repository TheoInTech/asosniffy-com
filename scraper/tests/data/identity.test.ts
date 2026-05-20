import { describe, expect, it } from "vitest";
import { similarityScore } from "../../src/data/identity.js";
import type { AppRecord } from "../../src/providers/apple/types.js";

function makeRecord(overrides: Partial<AppRecord> = {}): AppRecord {
  return {
    id: "1",
    name: "Sample App",
    developer: "Sample Studio",
    primaryCategory: "Productivity",
    description: "",
    ratingsSummary: { average: 4.5, count: 100 },
    screenshots: [],
    currentVersion: "1.0",
    provenance: "live",
    ...overrides,
  };
}

describe("similarityScore", () => {
  it("returns 1.0 for an exact name match (case-insensitive)", () => {
    const score = similarityScore("pawprint habits", makeRecord({ name: "Pawprint Habits" }));
    expect(score).toBe(1.0);
  });

  it("returns medium-or-better score for a near-exact match (singular vs plural)", () => {
    // "pawprint habit" vs "Pawprint Habits": Levenshtein distance 1 but the
    // token set differs (habit vs habits) — by design this lands in the
    // medium-confidence band so candidates[] surfaces and the UI can ask
    // "did you mean Pawprint Habits?" rather than silently auto-picking.
    const score = similarityScore(
      "pawprint habit",
      makeRecord({ name: "Pawprint Habits" }),
    );
    expect(score).toBeGreaterThanOrEqual(0.6);
  });

  it("returns a moderate score for token-overlap matches", () => {
    const score = similarityScore("Notes", makeRecord({ name: "Notes Plus" }));
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(0.85);
  });

  it("returns a low score for unrelated names", () => {
    const score = similarityScore("habit tracker", makeRecord({ name: "Photo Editor Pro" }));
    expect(score).toBeLessThan(0.4);
  });

  it("boosts score for popular apps (tiebreaker)", () => {
    const niche = similarityScore("notes", makeRecord({
      name: "Notes Plus",
      ratingsSummary: { average: 4.0, count: 100 },
    }));
    const popular = similarityScore("notes", makeRecord({
      name: "Notes Plus",
      ratingsSummary: { average: 4.0, count: 1_000_000 },
    }));
    expect(popular).toBeGreaterThan(niche);
  });

  it("recognizes a bundleId query against the bundleId field", () => {
    const score = similarityScore(
      "com.acme.notes",
      makeRecord({ name: "Notes by Acme", bundleId: "com.acme.notes" }),
    );
    expect(score).toBeGreaterThan(0.9);
  });

  it("returns 0 for an empty query", () => {
    expect(similarityScore("   ", makeRecord())).toBe(0);
  });
});
