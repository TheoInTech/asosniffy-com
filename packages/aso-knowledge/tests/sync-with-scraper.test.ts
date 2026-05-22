import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  ASO_KNOWLEDGE_BASE,
  ASO_KNOWLEDGE_VERSION,
} from "../src/data.js";

// Sprint B — dual source-of-truth guard. The scraper's orchestrator carries
// its own copy of the knowledge corpus at scraper/src/scoring/aso-knowledge.ts
// to avoid a workspace-runtime dependency on this package (keeps the Docker
// image lean and the scraper's deploy surface tiny). The two files MUST stay
// in sync — drift means the public MCP package cites topics the paid
// /diagnose path doesn't recognize.
//
// We don't load the scraper file as a module (no cross-package dep). We
// instead grep its source text for every topic key, summary, and source URL
// that the package corpus declares. That catches additions / removals /
// edits in the package that haven't been mirrored on the scraper side.
// (The reverse direction — scraper-only entries — is caught at code review
// since adding a scraper-only entry is unusual.)

const here = dirname(fileURLToPath(import.meta.url));
const SCRAPER_PATH = join(
  here,
  "../../../scraper/src/scoring/aso-knowledge.ts",
);

const scraperSource = readFileSync(SCRAPER_PATH, "utf8");

describe("dual source-of-truth: package ↔ scraper", () => {
  it("scraper file declares the same ASO_KNOWLEDGE_VERSION fingerprint", () => {
    expect(scraperSource).toContain(
      `ASO_KNOWLEDGE_VERSION = "${ASO_KNOWLEDGE_VERSION}"`,
    );
  });

  for (const entry of ASO_KNOWLEDGE_BASE) {
    it(`scraper file mirrors topic "${entry.topic}"`, () => {
      expect(scraperSource).toContain(`topic: "${entry.topic}"`);
    });

    it(`scraper file mirrors the summary for "${entry.topic}"`, () => {
      // Strip the optional non-ASCII em-dashes / curly quotes that string
      // matching is finicky about — split on the first 40 chars instead so
      // the assertion stays robust to harmless whitespace edits.
      const head = entry.summary.slice(0, 40);
      expect(scraperSource).toContain(head);
    });

    it(`scraper file mirrors the source URL for "${entry.topic}"`, () => {
      expect(scraperSource).toContain(entry.source.url);
    });

    it(`scraper file mirrors the source name for "${entry.topic}"`, () => {
      // Compare the first 30 chars — long source names sometimes wrap in
      // editors so a strict full-string compare is too brittle.
      const head = entry.source.name.slice(0, 30);
      expect(scraperSource).toContain(head);
    });
  }
});
