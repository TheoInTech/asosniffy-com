import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";
import type { Store } from "../schemas/index.js";

// Phase 4 — HMAC signing for the /api/v1/aso/history endpoint.
//
// Design constraint: the /history endpoint must be free for the wallet
// that paid for the original /diagnose (no second x402 charge). The signed
// tuple is the proof-of-payment for the series.
//
// Signature scope is the (sniffId, store, country, appId, keyword) tuple.
// Including sniffId binds the signature to a specific paid request; including
// the data tuple keeps each (app, country, keyword) series independent so
// leaking one signature doesn't expose others.
//
// We do NOT include the receipt's transaction hash because fixture-receipt
// mode (used when the Morph facilitator is unavailable) doesn't produce a
// real tx hash — and we want history to work in both modes. The sniffId is
// uniqueness enough.

export interface HistoryTuple {
  sniffId: string;
  store: Store;
  country: string; // ISO 3166-1 alpha-2 — case-normalized to uppercase before signing
  appId: string;
  keyword: string; // case-normalized to lowercase trimmed before signing
}

export function canonicalString(tuple: HistoryTuple): string {
  // Pipe-delimited canonical form. Normalize country case and keyword
  // case+whitespace so the SDK doesn't have to remember formatting rules.
  return [
    tuple.sniffId,
    tuple.store,
    tuple.country.toUpperCase(),
    tuple.appId,
    tuple.keyword.toLowerCase().trim(),
  ].join("|");
}

export function signHistoryTuple(tuple: HistoryTuple): string {
  const secret = env.SNIFFY_HISTORY_HMAC_SECRET;
  if (!secret) {
    // No secret → no signatures can be minted. Caller (orchestrator) treats
    // this as the "history disabled" case and the response carries an
    // empty historySignature; the /history endpoint will return 401.
    return "";
  }
  const mac = createHmac("sha256", secret).update(canonicalString(tuple));
  return mac.digest("hex");
}

export function verifyHistorySignature(
  tuple: HistoryTuple,
  signature: string,
): boolean {
  const secret = env.SNIFFY_HISTORY_HMAC_SECRET;
  if (!secret) return false;
  if (typeof signature !== "string" || signature.length === 0) return false;

  const expected = signHistoryTuple(tuple);
  if (expected.length === 0) return false;
  if (expected.length !== signature.length) return false;

  // Constant-time compare to avoid timing side channels.
  try {
    return timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}

// Compose a multi-keyword signature so a single /diagnose response carries
// one signature that covers every keyword in the report. The SDK can then
// query /history per keyword without re-paying. Internally we sign the
// (sniffId, store, country, appId, "*") "wildcard" tuple — the /history
// endpoint will accept it when calling for any of the keywords from the
// same paid request.
//
// This is intentionally a forward-compatible add: if we later want
// per-keyword signatures (e.g. to rate-limit specific series), we can
// stop signing the wildcard tuple and start signing each keyword.
export function signWildcardForRequest(input: {
  sniffId: string;
  store: Store;
  country: string;
  appId: string;
}): string {
  return signHistoryTuple({
    ...input,
    keyword: "*",
  });
}

export function verifyWildcardForRequest(
  input: {
    sniffId: string;
    store: Store;
    country: string;
    appId: string;
  },
  signature: string,
): boolean {
  return verifyHistorySignature({ ...input, keyword: "*" }, signature);
}
