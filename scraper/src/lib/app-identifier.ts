import type { AppIdentifier } from "../schemas/index.js";

export type NormalizedAppIdentifier =
  | { kind: "appId"; value: string }
  | { kind: "url"; value: string }
  | { kind: "name"; value: string };

const NUMERIC_ID_RE = /^\d+$/;
const APPSTORE_ID_PATH_RE = /\/id(\d+)(?:\/|\?|$)/i;

function classifyString(raw: string): NormalizedAppIdentifier {
  const trimmed = raw.trim();
  if (NUMERIC_ID_RE.test(trimmed)) {
    return { kind: "appId", value: trimmed };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    // App Store URLs include `/id<digits>`; collapse to the appId form so the
    // downstream data layer keys off a stable ID rather than a free-form URL.
    const match = APPSTORE_ID_PATH_RE.exec(trimmed);
    if (match?.[1]) {
      return { kind: "appId", value: match[1] };
    }
    return { kind: "url", value: trimmed };
  }
  return { kind: "name", value: trimmed };
}

export function normalizeAppIdentifier(
  app: AppIdentifier,
): NormalizedAppIdentifier {
  if (typeof app === "string") {
    return classifyString(app);
  }
  if (app.kind === "url") {
    return classifyString(app.value);
  }
  return { kind: app.kind, value: app.value };
}
