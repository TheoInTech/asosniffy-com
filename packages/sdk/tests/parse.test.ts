import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  parseTrusted,
  defaultSchemaWarningSink,
  type SchemaWarning,
} from "../src/parse.js";

// A miniature stand-in for the kind of response schema the SDK bundles: an
// enum that the server may extend, plus an optional defaulted field, plus a
// nested row carrying the enum (mirrors keywordDiagnosis[].popularitySource).
const Row = z.object({
  keyword: z.string(),
  popularitySource: z.enum(["apple-search-ads", "heuristic"]),
});
const Report = z.object({
  reportVersion: z.string(),
  rows: z.array(Row),
  notes: z.array(z.string()).default([]),
});

describe("parseTrusted — never throws, never discards a server response", () => {
  const sink = vi.fn();

  it("returns a valid payload normally and applies defaults", () => {
    const out = parseTrusted(
      Report,
      { reportVersion: "v1", rows: [{ keyword: "k", popularitySource: "heuristic" }] },
      "diagnose",
      sink,
    );
    expect(out.notes).toEqual([]); // default applied
    expect(sink).not.toHaveBeenCalled();
  });

  it("does NOT throw on an unknown nested enum value — returns it intact + warns", () => {
    const warn = vi.fn();
    const server = {
      reportVersion: "v2",
      rows: [{ keyword: "habit tracker", popularitySource: "observable-signals" }],
    };
    const out = parseTrusted(Report, server, "diagnose", warn);
    // The new enum value survives untouched (the exact production bug).
    expect(out.rows[0]!.popularitySource).toBe("observable-signals");
    expect(warn).toHaveBeenCalledTimes(1);
    expect((warn.mock.calls[0]![0] as SchemaWarning).label).toBe("diagnose");
  });

  it("preserves unknown TOP-LEVEL sections (a stale SDK still surfaces new value)", () => {
    const warn = vi.fn();
    const server = {
      reportVersion: "v2",
      rows: [{ keyword: "k", popularitySource: "heuristic" }],
      conversionAudit: { ratingEconomics: { ratingBand: "credible" } }, // schema doesn't know this
    };
    const out = parseTrusted(Report, server, "diagnose", warn) as Record<string, unknown>;
    // Valid against the base shape (passthrough) → no warning, section kept.
    expect(out.conversionAudit).toBeDefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns the raw payload on a hard mismatch rather than throwing", () => {
    const warn = vi.fn();
    const garbage = { totally: "different", shape: 42 };
    const out = parseTrusted(Report, garbage, "diagnose", warn) as Record<string, unknown>;
    expect(out).toEqual(garbage); // nothing lost
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("the default warning sink writes to stderr (console.warn), never stdout", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    defaultSchemaWarningSink({ label: "diagnose", issues: "x" });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
    expect(stdoutSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
    logSpy.mockRestore();
    stdoutSpy.mockRestore();
  });
});
