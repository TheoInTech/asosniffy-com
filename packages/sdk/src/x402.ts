import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import type { LocalAccount } from "viem";

export type PayingFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export function createPayingFetch(signer: LocalAccount): PayingFetch {
  const client = new x402Client().register(
    "eip155:*",
    new ExactEvmScheme(signer),
  );
  return wrapFetchWithPayment(globalThis.fetch, client);
}
