import { describe, expect, it } from "vitest";
import {
  lookupAppPreview,
  searchAppsPreview,
} from "../../../src/providers/android/play-store.js";

describe("lookupAppPreview (fixture-only stub)", () => {
  it("returns a record with confidence:'low' and provenance:'fixture'", async () => {
    const result = await lookupAppPreview({
      packageName: "com.example.habits",
      country: "US",
    });
    expect(result.confidence).toBe("low");
    expect(result.provenance).toBe("fixture");
  });

  it("reflects the caller's packageName", async () => {
    const result = await lookupAppPreview({
      packageName: "com.example.habits",
      country: "US",
    });
    expect(result.packageName).toBe("com.example.habits");
  });

  it("derives a human-readable name from the package tail", async () => {
    const result = await lookupAppPreview({
      packageName: "com.example.daily_routine",
      country: "US",
    });
    expect(result.name).toBe("Daily Routine");
  });
});

describe("searchAppsPreview (fixture-only stub)", () => {
  it("returns a single-element array reflecting the search term", async () => {
    const result = await searchAppsPreview({ term: "habit tracker", country: "US" });
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Habit Tracker");
    expect(result[0]!.packageName).toBe("com.preview.habit-tracker");
    expect(result[0]!.confidence).toBe("low");
    expect(result[0]!.provenance).toBe("fixture");
  });

  it("falls back to a default slug for empty-ish terms", async () => {
    const result = await searchAppsPreview({ term: "   ", country: "US" });
    expect(result[0]!.packageName).toBe("com.preview.app");
  });
});
