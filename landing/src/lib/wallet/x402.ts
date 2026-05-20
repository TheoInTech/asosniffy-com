import {
  hexToBytes,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import type {
  DiagnoseUnpaidResponse,
  PaymentRequirement,
} from "@sniffy/scraper/schemas";

// Canonical x402 V2 PaymentPayload (EIP-3009 "exact" scheme) per
// coinbase/x402 `typescript/packages/core/src/types/payments.ts`. The header
// is base64-encoded JSON of an object with an `accepted` block that mirrors
// the requirement the client signed against — facilitators (Morph included)
// reject without it.
interface Eip3009Authorization {
  from: Address;
  to: Address;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: Hex;
}

interface AcceptedRequirement {
  scheme: "exact";
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: {
    name: string;
    version: string;
    assetTransferMethod?: "eip3009";
  };
}

interface PaymentPayloadV2 {
  x402Version: 2;
  accepted: AcceptedRequirement;
  payload: {
    signature: Hex;
    authorization: Eip3009Authorization;
  };
}

const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

function generateNonce(): Hex {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return `0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}` as Hex;
}

function base64encode(json: string): string {
  if (typeof window !== "undefined" && typeof window.btoa === "function") {
    // btoa is safe for ASCII; PaymentPayload JSON is ASCII (hex + numbers + enum strings).
    return window.btoa(json);
  }
  return Buffer.from(json, "utf8").toString("base64");
}

function caip2ChainId(caip2: string): number {
  const match = caip2.match(/^eip155:(\d+)$/);
  if (!match || !match[1]) {
    throw new Error(`Unsupported CAIP-2 identifier: ${caip2}`);
  }
  return Number.parseInt(match[1], 10);
}

export interface BuildPaymentHeaderInput {
  account: Address;
  walletClient: WalletClient;
  requirement: PaymentRequirement;
  nowSeconds?: number;
}

export async function buildPaymentHeader({
  account,
  walletClient,
  requirement,
  nowSeconds,
}: BuildPaymentHeaderInput): Promise<string> {
  if (requirement.x402Version !== 2) {
    throw new Error(
      `Unsupported x402 version: ${requirement.x402Version} (only 2 is supported on Morph today).`,
    );
  }
  if (requirement.scheme !== "exact") {
    throw new Error(
      `Unsupported payment scheme: ${requirement.scheme} (only "exact" is supported on Morph today).`,
    );
  }

  const chainId = caip2ChainId(requirement.network);
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  const authorization: Eip3009Authorization = {
    from: account,
    to: requirement.payTo as Address,
    value: requirement.atomicAmount,
    validAfter: String(now - 5),
    validBefore: String(now + requirement.maxTimeoutSeconds),
    nonce: generateNonce(),
  };

  const signature = (await walletClient.signTypedData({
    account,
    domain: {
      name: requirement.extra.name,
      version: requirement.extra.version,
      chainId,
      verifyingContract: requirement.asset as Address,
    },
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from: authorization.from,
      to: authorization.to,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce,
    },
  })) as Hex;

  // Sanity: signature should be 65 bytes (130 hex chars + 0x).
  if (hexToBytes(signature).length !== 65) {
    throw new Error("Unexpected signature length from wallet.");
  }

  const payload: PaymentPayloadV2 = {
    x402Version: 2,
    accepted: {
      scheme: "exact",
      network: requirement.network,
      amount: requirement.atomicAmount,
      asset: requirement.asset,
      payTo: requirement.payTo,
      maxTimeoutSeconds: requirement.maxTimeoutSeconds,
      extra: requirement.extra,
    },
    payload: { signature, authorization },
  };

  return base64encode(JSON.stringify(payload));
}

export function paymentTotalsFromUnpaid(unpaid: DiagnoseUnpaidResponse) {
  const r = unpaid.payment;
  return {
    amount: r.amount,
    atomic: r.atomicAmount,
    asset: r.asset,
    network: r.network,
    payTo: r.payTo,
  };
}
