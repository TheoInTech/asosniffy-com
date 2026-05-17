import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  type DiagnosePaidResponse,
  type QuoteResponse,
} from "../schemas/index.js";

// Fixtures live in scraper/fixtures/ (outside src/ — they are runtime data,
// not source). We read them once at module init via fs so we don't need to
// extend tsconfig's rootDir or copy the JSON into src/.

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, "..", "..", "fixtures");

function loadFixture<T>(name: string): T {
  const path = resolve(fixturesDir, name);
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as T;
}

export const sampleQuote: QuoteResponse = loadFixture("sample-quote.json");
export const sampleReport: DiagnosePaidResponse = loadFixture("sample-report.json");
