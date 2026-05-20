import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

const HEX64 = /^0x[a-fA-F0-9]{64}$/;

export class WalletConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletConfigError";
  }
}

/**
 * Read SNIFFY_PRIVATE_KEY from the environment and return a viem account.
 * Throws WalletConfigError with an actionable message when missing/malformed.
 *
 * Testnet only — the env var name and the warning printed at run time make
 * this explicit; do not paste a mainnet key.
 */
export function loadWallet(env: NodeJS.ProcessEnv = process.env): PrivateKeyAccount {
  const raw = env["SNIFFY_PRIVATE_KEY"];
  if (raw === undefined || raw.trim().length === 0) {
    throw new WalletConfigError(
      "SNIFFY_PRIVATE_KEY is required for `sniffy diagnose`.\n" +
        "  Set a Morph Hoodi testnet private key:\n" +
        "    export SNIFFY_PRIVATE_KEY=0x<64-hex-chars>\n" +
        "  Get test funds at the Morph Hoodi faucet: https://faucet-hoodi.morph.network/\n" +
        "  Testnet only — never paste a mainnet private key.",
    );
  }
  if (!HEX64.test(raw)) {
    throw new WalletConfigError(
      "SNIFFY_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string (66 chars total).",
    );
  }
  return privateKeyToAccount(raw as `0x${string}`);
}
