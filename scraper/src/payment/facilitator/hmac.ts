import crypto from "node:crypto";

// Recursively sort object keys lexicographically. Required because
// JSON.stringify preserves insertion order — the Morph facilitator's signature
// check on the Go side relies on Go's auto-sorted JSON marshalling, so we
// must reproduce that ordering byte-for-byte on the TS side.
export function sortObject<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sortObject(item)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      out[key] = sortObject(source[key]);
    }
    return out as unknown as T;
  }
  return value;
}

export interface SignInput {
  accessKey: string;
  secretKey: string;
  timestamp: string;
  method: string;
  path: string;
  rawQuery?: string;
  rawBody?: string;
}

// Builds the canonical sign payload (sorted, compact JSON). Exposed for tests
// so we can assert MORPH-ACCESS-BODY omission and query-param flattening.
export function buildSignContent(input: Omit<SignInput, "accessKey" | "secretKey"> & {
  accessKey: string;
}): string {
  const { accessKey, timestamp, method, path, rawQuery, rawBody } = input;

  const signMap: Record<string, unknown> = {
    "MORPH-ACCESS-KEY": accessKey,
    "MORPH-ACCESS-TIMESTAMP": timestamp,
    "MORPH-ACCESS-METHOD": method,
    "MORPH-ACCESS-PATH": path,
  };

  if (rawQuery && rawQuery.length > 0) {
    const params = new URLSearchParams(rawQuery);
    params.forEach((v, k) => {
      const existing = signMap[k];
      if (Array.isArray(existing)) {
        existing.push(v);
      } else {
        signMap[k] = [v];
      }
    });
  }

  // Skill spec: omit the field entirely when there is no body — do NOT
  // serialize null or empty string.
  if (rawBody && rawBody.length > 0) {
    signMap["MORPH-ACCESS-BODY"] = JSON.parse(rawBody);
  }

  return JSON.stringify(sortObject(signMap));
}

export function signRequest(input: SignInput): string {
  const content = buildSignContent({
    accessKey: input.accessKey,
    timestamp: input.timestamp,
    method: input.method,
    path: input.path,
    rawQuery: input.rawQuery,
    rawBody: input.rawBody,
  });
  return crypto
    .createHmac("sha256", input.secretKey)
    .update(content)
    .digest("base64");
}
