import crypto from "node:crypto";
import { parseUnits } from "viem";
import {
  type CAIP2,
  type FacilitatorMode,
  Receipt as ReceiptSchema,
  type Receipt,
  type Pricing,
  type SniffId,
  type RequestId,
} from "../schemas/index.js";
import type { SettleResponse } from "./facilitator/index.js";
import { env as appEnv } from "../env.js";

export interface ReceiptEnv {
  MORPH_NETWORK?: string;
  SNIFFY_PAYMENT_ASSET_ADDRESS?: string;
  SNIFFY_PAYMENT_ASSET_DECIMALS?: string;
}

function fromAppEnv(): ReceiptEnv {
  return {
    MORPH_NETWORK: appEnv.MORPH_NETWORK,
    SNIFFY_PAYMENT_ASSET_ADDRESS: appEnv.SNIFFY_PAYMENT_ASSET_ADDRESS,
    SNIFFY_PAYMENT_ASSET_DECIMALS: String(appEnv.SNIFFY_PAYMENT_ASSET_DECIMALS),
  };
}

export interface AssembleReceiptInput {
  mode: FacilitatorMode;
  pricing: Pricing;
  sniffId: SniffId;
  // Reserved for future audit context; not part of the wire receipt shape.
  requestId?: RequestId;
  settleResponse?: SettleResponse;
  settledAt?: string;
  env?: ReceiptEnv;
  // Test/seed hook: when not provided, fabricated tx hashes use crypto.randomBytes.
  random?: () => Buffer;
  // EIP-3009 authorization.from from the parsed PAYMENT-SIGNATURE. Used as
  // the payer when settleResponse omits one — Morph's /v2/settle treats payer
  // as optional, but we need it for the wallet-history index in diagnose.ts.
  // Cryptographically equivalent to settleResponse.payer because the
  // facilitator recovers it from the same signature.
  payerFallback?: string;
}

const DEFAULTS = {
  network: "eip155:2818" as CAIP2,
  assetAddress: "0xCfb1186F4e93D60E60a8bDd997427D1F33bc372B",
  assetDecimals: 6,
} as const;

const HOODI_EXPLORER = "https://explorer-hoodi.morphl2.io";
const MAINNET_EXPLORER = "https://explorer.morphl2.io";

export function formatExplorerLink(txHash: string, network: CAIP2): string {
  switch (network) {
    case "eip155:2910":
      return `${HOODI_EXPLORER}/tx/${txHash}`;
    case "eip155:2818":
      return `${MAINNET_EXPLORER}/tx/${txHash}`;
    default:
      throw new Error(`Unknown CAIP-2 network for Morph explorer: ${network}`);
  }
}

function fabricateTxHash(random: () => Buffer): string {
  // Fixture mode marker: the `0xsample` prefix makes the receipt visibly fake
  // for /sample and for any place we surface fixture-mode results. Length is
  // 32 bytes (66 chars including 0x) so it parses as a normal-looking hash.
  const suffix = random().toString("hex").slice(0, 56);
  return `0xsample${suffix}`;
}

export function assembleReceipt(input: AssembleReceiptInput): Receipt {
  const env = input.env ?? fromAppEnv();
  const network = (env.MORPH_NETWORK ?? DEFAULTS.network) as CAIP2;
  const asset = env.SNIFFY_PAYMENT_ASSET_ADDRESS ?? DEFAULTS.assetAddress;
  const decimals = env.SNIFFY_PAYMENT_ASSET_DECIMALS
    ? Number.parseInt(env.SNIFFY_PAYMENT_ASSET_DECIMALS, 10)
    : DEFAULTS.assetDecimals;

  const amount = input.pricing.estimatedTotal;
  const atomicAmount = parseUnits(amount, decimals).toString();
  const settledAt = input.settledAt ?? new Date().toISOString();

  // facilitator label is a stable string the UI/CLI can switch on. It maps
  // 1:1 with FacilitatorMode but stays a separate field because PLAN.md §9's
  // receipt example uses 'morph-official' literally.
  let facilitatorLabel: string;
  let transactionHash: string;

  switch (input.mode) {
    case "morph-official": {
      const hash = input.settleResponse?.transaction;
      if (!hash) {
        throw new Error(
          "assembleReceipt: mode=morph-official requires settleResponse.transaction",
        );
      }
      transactionHash = hash;
      facilitatorLabel = "morph-official";
      break;
    }
    case "self-hosted-fallback": {
      const hash = input.settleResponse?.transaction;
      if (!hash) {
        throw new Error(
          "assembleReceipt: mode=self-hosted-fallback requires settleResponse.transaction",
        );
      }
      transactionHash = hash;
      facilitatorLabel = "self-hosted-fallback";
      break;
    }
    case "fixture-receipt": {
      const rng = input.random ?? (() => crypto.randomBytes(28));
      transactionHash = fabricateTxHash(rng);
      facilitatorLabel = "fixture-receipt";
      break;
    }
    default: {
      // Exhaustive switch — TypeScript will flag if FacilitatorMode adds a variant.
      const _exhaustive: never = input.mode;
      throw new Error(`Unknown facilitator mode: ${String(_exhaustive)}`);
    }
  }

  // Payer preference: settleResponse.payer (facilitator's on-chain commitment)
  // wins when present. Fall back to payerFallback (EIP-3009 authorization.from
  // we already validated) when the facilitator omits payer — Morph's
  // /v2/settle treats payer as optional and doesn't always echo it back, but
  // we still need a payer for the wallet-history index. Lowercased to match
  // the index key format.
  const payer =
    input.settleResponse?.payer?.toLowerCase() ??
    input.payerFallback?.toLowerCase();

  const receipt: Receipt = {
    network,
    facilitator: facilitatorLabel,
    facilitatorMode: input.mode,
    amount,
    atomicAmount,
    asset,
    transactionHash,
    settledAt,
    ...(payer ? { payer } : {}),
  };

  return ReceiptSchema.parse(receipt);
}
