// Set env vars BEFORE any module loads — the env singleton in src/env.ts
// reads process.env at import time. These match the Phase 01 / Phase 02
// defaults but pin them so tests don't depend on the developer's shell env.
process.env.NODE_ENV = "test";
process.env.PORT = process.env.PORT ?? "3001";
process.env.MORPH_NETWORK = "eip155:2910";
process.env.MORPH_FACILITATOR_URL = "https://morph-rails.morph.network/x402";
process.env.MORPH_FACILITATOR_MODE = process.env.MORPH_FACILITATOR_MODE ?? "morph-official";
process.env.SNIFFY_MERCHANT_ADDRESS =
  process.env.SNIFFY_MERCHANT_ADDRESS ??
  "0x000000000000000000000000000000000000c0de";
process.env.SNIFFY_PAYMENT_ASSET_ADDRESS =
  "0xEcF966Cc754BC411E1F1106fbb4e343b835E85E4";
process.env.SNIFFY_PAYMENT_ASSET_DECIMALS = "18";
process.env.SNIFFY_PAYMENT_ASSET_EIP712_NAME = "HoodiTestToken";
process.env.SNIFFY_PAYMENT_ASSET_EIP712_VERSION = "1.0";
process.env.RESOURCE_BASE_URL = "http://localhost:3001";
// Silence the per-request JSON log line in tests — keeps vitest output readable.
process.env.ENABLE_REQUEST_LOG = "false";
// Phase 4 — provide a deterministic HMAC secret so the orchestrator can mint
// historySignature in test environments. Tests that exercise the history
// endpoint use this same secret implicitly via env.SNIFFY_HISTORY_HMAC_SECRET.
process.env.SNIFFY_HISTORY_HMAC_SECRET =
  process.env.SNIFFY_HISTORY_HMAC_SECRET ??
  "test-secret-deadbeefdeadbeefdeadbeefdeadbeef-history-hmac";
