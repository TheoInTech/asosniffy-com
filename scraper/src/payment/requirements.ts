import { parseUnits } from "viem";
import {
  type AcceptsItem,
  type CAIP2,
  DiagnoseUnpaidResponse,
  type DiagnoseUnpaidResponse as DiagnoseUnpaidResponseType,
  type PaymentRequirement,
  type Pricing,
  type SniffId,
} from "../schemas/index.js";
import { env as appEnv } from "../env.js";

// Tests can still inject a full PaymentEnv inline; production code reads from
// the central env.ts singleton (decision #14). All fields are optional so
// tests can pass partial overrides.
export interface PaymentEnv {
  MORPH_NETWORK?: string;
  MORPH_FACILITATOR_URL?: string;
  SNIFFY_MERCHANT_ADDRESS?: string;
  SNIFFY_PAYMENT_ASSET_ADDRESS?: string;
  SNIFFY_PAYMENT_ASSET_DECIMALS?: string;
  SNIFFY_PAYMENT_ASSET_EIP712_NAME?: string;
  SNIFFY_PAYMENT_ASSET_EIP712_VERSION?: string;
}

function fromAppEnv(): PaymentEnv {
  return {
    MORPH_NETWORK: appEnv.MORPH_NETWORK,
    MORPH_FACILITATOR_URL: appEnv.MORPH_FACILITATOR_URL,
    SNIFFY_MERCHANT_ADDRESS: appEnv.SNIFFY_MERCHANT_ADDRESS,
    SNIFFY_PAYMENT_ASSET_ADDRESS: appEnv.SNIFFY_PAYMENT_ASSET_ADDRESS,
    SNIFFY_PAYMENT_ASSET_DECIMALS: String(appEnv.SNIFFY_PAYMENT_ASSET_DECIMALS),
    SNIFFY_PAYMENT_ASSET_EIP712_NAME: appEnv.SNIFFY_PAYMENT_ASSET_EIP712_NAME,
    SNIFFY_PAYMENT_ASSET_EIP712_VERSION: appEnv.SNIFFY_PAYMENT_ASSET_EIP712_VERSION,
  };
}

export interface BuildPaymentRequirementsInput {
  sniffId: SniffId;
  pricing: Pricing;
  resourceUrl: string;
  resourceDescription?: string;
  resourceMimeType?: string;
  maxTimeoutSeconds?: number;
  env?: PaymentEnv;
}

const DEFAULTS = {
  network: "eip155:2818" as CAIP2,
  facilitatorUrl: "https://morph-rails.morph.network/x402",
  // Morph Mainnet USDC (Bridged Standard). env.ts resolves the right asset per
  // MORPH_NETWORK, so this only matters when an external caller passes a
  // partial PaymentEnv with no asset config (rare path; tests typically do).
  assetAddress: "0xCfb1186F4e93D60E60a8bDd997427D1F33bc372B",
  assetDecimals: 6,
  eip712Name: "USDC",
  eip712Version: "2",
  maxTimeoutSeconds: 60,
} as const;

function requireEnv<T extends string>(value: T | undefined, name: string): T {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function buildPaymentRequirements(
  input: BuildPaymentRequirementsInput,
): DiagnoseUnpaidResponseType {
  const env = input.env ?? fromAppEnv();

  const network = (env.MORPH_NETWORK ?? DEFAULTS.network) as CAIP2;
  const facilitator = env.MORPH_FACILITATOR_URL ?? DEFAULTS.facilitatorUrl;
  const asset = env.SNIFFY_PAYMENT_ASSET_ADDRESS ?? DEFAULTS.assetAddress;
  const decimals = env.SNIFFY_PAYMENT_ASSET_DECIMALS
    ? Number.parseInt(env.SNIFFY_PAYMENT_ASSET_DECIMALS, 10)
    : DEFAULTS.assetDecimals;
  const eip712Name = env.SNIFFY_PAYMENT_ASSET_EIP712_NAME ?? DEFAULTS.eip712Name;
  const eip712Version =
    env.SNIFFY_PAYMENT_ASSET_EIP712_VERSION ?? DEFAULTS.eip712Version;

  // Merchant address has no safe default — fail loudly if missing in prod.
  const payTo = requireEnv(env.SNIFFY_MERCHANT_ADDRESS, "SNIFFY_MERCHANT_ADDRESS");

  const amount = input.pricing.estimatedTotal;
  // parseUnits handles fixed-point decimal → atomic conversion (no float math).
  const atomicAmount = parseUnits(amount, decimals).toString();

  // `assetTransferMethod` disambiguates EIP-3009 vs Permit2 for the
  // facilitator (specs/schemes/exact/scheme_exact_evm.md). Omitting it makes
  // Morph's prioritizer guess and can misroute the simulation.
  const extra = {
    name: eip712Name,
    version: eip712Version,
    assetTransferMethod: "eip3009" as const,
  };
  const maxTimeoutSeconds = input.maxTimeoutSeconds ?? DEFAULTS.maxTimeoutSeconds;

  const payment: PaymentRequirement = {
    x402Version: 2,
    scheme: "exact",
    network,
    facilitator,
    amount,
    atomicAmount,
    decimals,
    asset,
    payTo,
    maxTimeoutSeconds,
    extra,
  };

  const accepts: AcceptsItem[] = [
    {
      scheme: "exact",
      network,
      // Canonical x402 v2 amount in accepts[] is atomic units.
      amount: atomicAmount,
      asset,
      payTo,
      maxTimeoutSeconds,
      extra,
    },
  ];

  const response: DiagnoseUnpaidResponseType = {
    x402Version: 2,
    error: "payment_required",
    sniffId: input.sniffId,
    resource: {
      url: input.resourceUrl,
      ...(input.resourceDescription ? { description: input.resourceDescription } : {}),
      ...(input.resourceMimeType ? { mimeType: input.resourceMimeType } : {}),
    },
    payment,
    accepts,
  };

  return DiagnoseUnpaidResponse.parse(response);
}
