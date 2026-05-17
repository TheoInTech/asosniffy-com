import { createHash } from "node:crypto";
import { PROVIDER_VERSION, REPORT_VERSION } from "./versions.js";

export interface CacheKeyInput {
  namespace: string;
  store?: string;
  country?: string;
  appId?: string;
  keywords?: readonly string[];
  // Free-form discriminators. Sorted alphabetically by key before joining.
  extra?: Readonly<Record<string, string | number | undefined>>;
}

const MAX_KEY_LENGTH = 250;

export function cacheKey(input: CacheKeyInput): string {
  const variable = buildVariableSegment(input);
  const prefix = `aso:${PROVIDER_VERSION}:${REPORT_VERSION}:${input.namespace}`;
  const full = `${prefix}:${variable}`;
  if (full.length <= MAX_KEY_LENGTH) return full;
  const digest = createHash("sha256").update(variable).digest("hex");
  return `${prefix}:sha256:${digest}`;
}

function buildVariableSegment(input: CacheKeyInput): string {
  const parts: string[] = [];
  if (input.store !== undefined) parts.push(`store=${input.store}`);
  if (input.country !== undefined) parts.push(`country=${input.country}`);
  if (input.appId !== undefined) parts.push(`appId=${input.appId}`);
  if (input.keywords && input.keywords.length > 0) {
    const sorted = [...input.keywords].map((k) => k.toLowerCase().trim()).sort();
    parts.push(`keywords=${sorted.join("|")}`);
  }
  if (input.extra) {
    const extraKeys = Object.keys(input.extra).sort();
    for (const key of extraKeys) {
      const value = input.extra[key];
      if (value !== undefined) parts.push(`${key}=${value}`);
    }
  }
  return parts.join(":");
}
