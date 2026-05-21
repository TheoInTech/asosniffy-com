import { z } from "zod";
import { CountryCode, Provenance, SniffId, Store } from "./shared.js";

// Zod schemas for the `/api/v1/aso/wallet/*` endpoint family. These cover
// the SIWE auth handshake (nonce + session exchange) and the wallet-scoped
// history list + sniff replay endpoints.

const EvmAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "EVM address (0x-prefixed 20-byte hex)");

const HexSignature = z
  .string()
  .regex(/^0x[a-fA-F0-9]+$/, "0x-prefixed hex signature");

const Iso8601 = z.string().datetime();

// --- nonce: client requests a server-issued single-use nonce ---

export const WalletNonceRequest = z.object({
  address: EvmAddress,
});
export type WalletNonceRequest = z.infer<typeof WalletNonceRequest>;

export const WalletNonceResponse = z.object({
  nonce: z.string().min(8),
  domain: z.string().min(1),
  // ISO-8601 expiry — typically 5 minutes from issuance.
  expiresAt: Iso8601,
});
export type WalletNonceResponse = z.infer<typeof WalletNonceResponse>;

// --- session: exchange SIWE-signed message for an opaque bearer token ---

export const WalletSessionRequest = z.object({
  // The full SIWE message string the client signed (EIP-4361).
  message: z.string().min(1),
  // 65-byte EIP-191 signature, 0x-prefixed hex.
  signature: HexSignature,
});
export type WalletSessionRequest = z.infer<typeof WalletSessionRequest>;

export const WalletSessionResponse = z.object({
  sessionToken: z.string().min(16),
  address: EvmAddress,
  // ISO-8601 expiry — typically 30 minutes from issuance.
  expiresAt: Iso8601,
});
export type WalletSessionResponse = z.infer<typeof WalletSessionResponse>;

// --- sniff summary: list view ---

export const SniffSummary = z.object({
  sniffId: SniffId,
  store: Store,
  country: CountryCode,
  app: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    developer: z.string(),
    iconUrl: z.string().url().nullable(),
  }),
  keywords: z.array(z.string()).min(1),
  // Snapshot of metadataScore.overall at the time the sniff settled.
  overallScore: z.number().int().min(0).max(100).nullable(),
  // Snapshot of dataProvenance.appMetadata for the list-view provenance badge.
  appMetadataProvenance: Provenance,
  settledAt: Iso8601,
});
export type SniffSummary = z.infer<typeof SniffSummary>;

export const WalletSniffsResponse = z.object({
  items: z.array(SniffSummary),
  nextCursor: z.string().nullable(),
});
export type WalletSniffsResponse = z.infer<typeof WalletSniffsResponse>;

// --- errors (shared discriminator) ---

export const WalletErrorCode = z.enum([
  "address_invalid",
  "nonce_invalid",
  "signature_invalid",
  "chain_mismatch",
  "domain_mismatch",
  "expired",
  "session_invalid",
  "sniff_not_found",
  "history_unavailable",
]);
export type WalletErrorCode = z.infer<typeof WalletErrorCode>;
