import { describe, expect, it } from "vitest";
import {
  _internal_extractAndroidHits_forTests as extract,
  parseGoogleSuggestBody,
} from "../../../src/providers/android/autocomplete.js";

describe("parseGoogleSuggestBody — anti-XSSI prefix stripping", () => {
  it("strips the `)]}'\\n` JSONP prefix Google sometimes prepends", () => {
    const body = `)]}'\n[{"s":"pickleball"}]`;
    expect(parseGoogleSuggestBody(body)).toEqual([{ s: "pickleball" }]);
  });

  it("strips the `)]}'` prefix without a trailing newline", () => {
    const body = `)]}'[{"s":"pickleball"}]`;
    expect(parseGoogleSuggestBody(body)).toEqual([{ s: "pickleball" }]);
  });

  it("strips the `while(1);` prefix variant", () => {
    const body = `while(1);[{"s":"pickleball"}]`;
    expect(parseGoogleSuggestBody(body)).toEqual([{ s: "pickleball" }]);
  });

  it("parses unprefixed JSON normally", () => {
    expect(parseGoogleSuggestBody(`[{"s":"alpha"}]`)).toEqual([{ s: "alpha" }]);
  });

  it("throws on malformed JSON (caller surfaces as schema_drift)", () => {
    expect(() => parseGoogleSuggestBody("not-valid-json")).toThrow();
  });
});

describe("extractAndroidHits — Google suggest parser", () => {
  it("parses the `s` field (suggestion) shape", () => {
    const out = extract([{ s: "pickleball" }, { s: "court reservation" }]);
    expect(out).toEqual([
      { term: "pickleball" },
      { term: "court reservation" },
    ]);
  });

  it("tolerates the alternate `t` / `term` field names", () => {
    const out = extract([{ t: "alpha" }, { term: "beta" }]);
    expect(out).toEqual([{ term: "alpha" }, { term: "beta" }]);
  });

  it("returns empty array on non-array body", () => {
    expect(extract(null)).toEqual([]);
    expect(extract({})).toEqual([]);
    expect(extract("string")).toEqual([]);
  });

  it("skips empty/whitespace/non-string suggestions", () => {
    const out = extract([
      { s: "" },
      { s: "   " },
      { s: 42 },
      { s: "valid" },
    ]);
    expect(out).toEqual([{ term: "valid" }]);
  });

  it("dedupes case-insensitively, preserving first-seen casing", () => {
    const out = extract([
      { s: "Pickleball" },
      { s: "pickleball" },
      { s: "PICKLEBALL" },
    ]);
    expect(out).toEqual([{ term: "Pickleball" }]);
  });

  it("caps the result set at 10 suggestions", () => {
    const body = Array.from({ length: 25 }, (_, i) => ({
      s: `suggestion ${i}`,
    }));
    const out = extract(body);
    expect(out).toHaveLength(10);
  });
});
