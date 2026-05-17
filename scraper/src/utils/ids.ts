import { nanoid } from "nanoid";
import type { RequestId, SniffId } from "../schemas/index.js";

// nanoid's default alphabet is `A-Za-z0-9_-` which matches the RequestId and
// SniffId Zod regexes in schemas/shared.ts. Lengths are picked to keep the
// IDs short while still giving >2^60 collision space at 12 chars.

export function newRequestId(): RequestId {
  return `req_${nanoid(12)}` as RequestId;
}

export function newSniffId(): SniffId {
  return `sniff_${nanoid(16)}` as SniffId;
}
