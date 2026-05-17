// Android Play Store preview provider — fixture-only for MVP.
//
// PLAN.md §11 explicitly scopes Android to preview-quality only: lower
// confidence labels, fixture fallback acceptable, no paid provider. Live
// Play Store HTML scraping is brittle (CAPTCHA, layout churn) and would
// require maintaining a parser we don't have time to keep current.
//
// This module exposes the same shape a live provider would, so swapping
// in a real scraper later is a drop-in. All return values are
// confidence: "low" + provenance: "fixture" to keep the UI honest.

import type { AndroidAppPreview } from "./types.js";

export interface LookupAppPreviewInput {
  packageName: string;
  country: string;
}

export interface SearchAppsPreviewInput {
  term: string;
  country: string;
}

export async function lookupAppPreview(
  input: LookupAppPreviewInput,
): Promise<AndroidAppPreview> {
  return synthesize({
    packageName: input.packageName,
    name: derivedNameFromPackage(input.packageName),
    developer: "Unknown Developer",
  });
}

export async function searchAppsPreview(
  input: SearchAppsPreviewInput,
): Promise<AndroidAppPreview[]> {
  const slug = slugify(input.term);
  return [
    synthesize({
      packageName: `com.preview.${slug}`,
      name: titleCase(input.term),
      developer: "Preview Developer",
    }),
  ];
}

function synthesize(input: {
  packageName: string;
  name: string;
  developer: string;
}): AndroidAppPreview {
  return {
    packageName: input.packageName,
    name: input.name,
    developer: input.developer,
    primaryCategory: "Productivity",
    ratingsSummary: { average: 4.3, count: 1024 },
    confidence: "low",
    provenance: "fixture",
  };
}

function derivedNameFromPackage(packageName: string): string {
  const tail = packageName.split(".").pop() ?? packageName;
  return titleCase(tail.replace(/[-_]/g, " "));
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "app";
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}
