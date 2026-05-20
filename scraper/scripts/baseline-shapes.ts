#!/usr/bin/env node
// Captures provider response shapes into scraper/src/data/shape-baselines.json
// so PRs that change a provider's parser surface shape diffs explicitly in
// git review.
//
// Captures shape hash + sorted field paths only — never sample values.
// Field paths give reviewers context for WHAT moved; sample values would
// leak iTunes/gplay response structure with real data (security: also
// helps an adversary build a parser to detect Sniffy traffic).
//
// Usage:
//   pnpm run baseline:shapes
//
// Fixtures live in scraper/tests/fixtures/ (or are inlined here for the
// providers we don't have committed fixtures for yet). Future: hook this
// to live providers in dev so the baselines reflect production shapes.

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { responseShapeHash } from "../src/observability/shape-hash.js";

interface Baseline {
  hash: string;
  fieldPaths: string[];
  capturedAt: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(here, "..", "src", "data", "shape-baselines.json");

// Inline fixtures for each provider+endpoint combination Sniffy talks to.
// Field names + nesting only — actual values are placeholders. The structure
// must match the upstream API's TODAY shape; baseline regeneration after a
// genuine upstream change is part of the incident playbook (see plan).
const SAMPLES: Record<string, unknown> = {
  "apple-itunes:/lookup": {
    resultCount: 1,
    results: [
      {
        trackId: 0,
        trackName: "",
        artistName: "",
        primaryGenreName: "",
        description: "",
        screenshotUrls: [""],
        ipadScreenshotUrls: [""],
        averageUserRating: 0,
        userRatingCount: 0,
        version: "",
        artworkUrl100: "",
        bundleId: "",
      },
    ],
  },
  "apple-itunes:/search": {
    resultCount: 1,
    results: [
      {
        trackId: 0,
        trackName: "",
        artistName: "",
        primaryGenreName: "",
        description: "",
        screenshotUrls: [""],
        averageUserRating: 0,
        userRatingCount: 0,
        version: "",
        artworkUrl100: "",
        bundleId: "",
      },
    ],
  },
  "apple-reviews-rss:/customerreviews": {
    feed: {
      entry: [
        {
          id: { label: "" },
          title: { label: "" },
          content: { label: "" },
          "im:rating": { label: "" },
          author: { name: { label: "" } },
          updated: { label: "" },
        },
      ],
    },
  },
  "google-play:/details": {
    appId: "",
    title: "",
    developer: "",
    genre: "",
    description: "",
    icon: "",
    screenshots: [""],
    installs: "",
    minInstalls: 0,
    maxInstalls: 0,
    score: 0,
    scoreText: "",
    ratings: 0,
    reviews: 0,
    free: true,
    version: "",
  },
  "google-play:/search": [
    {
      appId: "",
      title: "",
      url: "",
      icon: "",
      developer: "",
      score: 0,
      free: true,
    },
  ],
  "google-play:/similar": [
    {
      appId: "",
      title: "",
      url: "",
      icon: "",
      developer: "",
      score: 0,
      free: true,
    },
  ],
  "google-play:/suggest": [""],
  "google-play:/reviews": [
    {
      id: "",
      userName: "",
      date: "",
      score: 0,
      title: "",
      text: "",
    },
  ],
  "apple-search-ads:/keywords/recommendations": {
    data: {
      recommendations: [{ popularity: 0 }],
    },
  },
};

function main(): void {
  const baselines: Record<string, Baseline> = {};
  const capturedAt = new Date().toISOString();
  for (const [key, sample] of Object.entries(SAMPLES)) {
    const { hash, fieldPaths } = responseShapeHash(sample);
    baselines[key] = { hash, fieldPaths, capturedAt };
  }
  writeFileSync(OUTPUT_PATH, JSON.stringify(baselines, null, 2) + "\n", "utf8");
  process.stdout.write(
    `Wrote ${Object.keys(baselines).length} provider+endpoint baselines to ${OUTPUT_PATH}\n`,
  );
}

main();
