import { describe, expect, it } from "vitest";
import { _internal_extractAppleHits_forTests as extract } from "../../../src/providers/apple/autocomplete.js";

describe("extractAppleHits — defensive Apple MZSearchHints parser", () => {
  it("parses the canonical { hints: [...] } shape", () => {
    const out = extract({
      hints: [
        { term: "pickleball", priority: 0 },
        { term: "court reservation", priority: 1 },
      ],
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ term: "pickleball", priority: 0 });
    expect(out[1]).toMatchObject({
      term: "court reservation",
      priority: 1,
    });
  });

  it("tolerates the alternate searchHints field name", () => {
    const out = extract({ searchHints: [{ term: "alpha" }] });
    expect(out).toHaveLength(1);
    expect(out[0]?.term).toBe("alpha");
  });

  it("returns empty array on null / non-object / missing hints", () => {
    expect(extract(null)).toEqual([]);
    expect(extract(undefined)).toEqual([]);
    expect(extract("string")).toEqual([]);
    expect(extract({})).toEqual([]);
    expect(extract({ hints: "not-an-array" })).toEqual([]);
  });

  it("skips empty / whitespace / non-string terms", () => {
    const out = extract({
      hints: [
        { term: "" },
        { term: "   " },
        { term: 42 },
        { term: "valid" },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.term).toBe("valid");
  });

  it("dedupes case-insensitively, preserving first-seen casing", () => {
    const out = extract({
      hints: [
        { term: "Pickleball" },
        { term: "pickleball" },
        { term: "PICKLEBALL" },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.term).toBe("Pickleball");
  });

  it("caps the result set at 10 suggestions", () => {
    const hints = Array.from({ length: 25 }, (_, i) => ({
      term: `suggestion ${i}`,
    }));
    const out = extract({ hints });
    expect(out).toHaveLength(10);
  });

  it("emits priority as null when the field is missing or non-numeric", () => {
    const out = extract({
      hints: [
        { term: "no-priority" },
        { term: "string-priority", priority: "0" },
      ],
    });
    expect(out[0]?.priority).toBeNull();
    expect(out[1]?.priority).toBeNull();
  });
});
