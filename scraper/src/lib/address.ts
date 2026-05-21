import { getAddress, isAddress } from "viem";

// EVM address utilities. Single source of truth for lower/upper-case discipline
// so the write side (`payment/` capturing settleResponse.payer) and the read
// side (wallet history endpoints) never disagree on key shape.
//
// Convention (this repo): all Redis keys, dedupe hashes, and audit log fields
// use lowercased addresses. Inputs from the wire may arrive checksummed
// (EIP-55) or lowercase — `normalizeAddress` accepts either and returns
// lowercase. `isValidAddress` validates structure only (does not require
// checksum correctness).

export type LowerAddress = `0x${string}`;

export function isValidAddress(input: unknown): input is string {
  return typeof input === "string" && isAddress(input);
}

// Throws when the input is not a valid EVM address.
export function normalizeAddress(input: string): LowerAddress {
  if (!isAddress(input)) {
    throw new Error(`Invalid EVM address: ${input}`);
  }
  // getAddress normalizes case (and validates checksum-correctness for mixed
  // case inputs); we then explicitly downcase so storage keys are stable.
  return getAddress(input).toLowerCase() as LowerAddress;
}

// Best-effort: returns null when invalid instead of throwing. Use this at the
// API boundary where invalid input is a 400, not a crash.
export function tryNormalizeAddress(input: unknown): LowerAddress | null {
  if (!isValidAddress(input)) return null;
  try {
    return normalizeAddress(input);
  } catch {
    return null;
  }
}
