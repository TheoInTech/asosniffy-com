// On-chain authenticity check for an x402 receipt. Performs five forensic
// checks against the receipt's claimed transaction hash so the demo can prove
// to a skeptical judge that a settlement is a real, facilitator-submitted
// EIP-3009 payment — not a plain ERC-20 transfer being labeled as x402.
//
// All checks are read-only: eth_getTransactionByHash, eth_getTransactionReceipt,
// and GET facilitator/v2/supported. No transactions are submitted.

import type { Receipt } from "@sniffy/scraper/schemas";
import { morphByCaip2, type MorphNetwork } from "@/lib/morph-urls";

// keccak256("AuthorizationUsed(address,bytes32)") — the EIP-3009 event the
// asset contract emits when transferWithAuthorization is consumed. Absence
// of this log = not EIP-3009 = not x402.
export const AUTHORIZATION_USED_TOPIC =
  "0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5";

export type CheckStatus = "pending" | "passed" | "failed" | "skipped";

export interface CheckResult {
  id:
    | "tx-exists"
    | "settlement-contract"
    | "relayer-advertised"
    | "authorization-used"
    | "meta-tx-pattern";
  label: string;
  status: CheckStatus;
  detail: string;
  evidence?: Record<string, unknown>;
}

export interface AuthenticityReport {
  network: MorphNetwork | null;
  checks: CheckResult[];
  rawTx?: unknown;
  rawReceipt?: unknown;
  advertisedSigners?: string[];
  payer?: string;
}

interface RpcResult {
  result?: unknown;
  error?: { code: number; message: string };
}

async function rpcCall(
  rpc: string,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) {
    throw new Error(`${method} → HTTP ${res.status}`);
  }
  const body = (await res.json()) as RpcResult;
  if (body.error) {
    throw new Error(`${method} → ${body.error.message}`);
  }
  return body.result;
}

interface TxData {
  hash: string;
  from: string;
  to: string;
  chainId: string;
  blockNumber: string;
}

interface ReceiptLog {
  address: string;
  topics: string[];
  data: string;
}

interface ReceiptData {
  logs: ReceiptLog[];
  status: string;
  blockNumber: string;
}

// Extract advertised signer addresses for a given CAIP-2 from the facilitator's
// /v2/supported response. The shape isn't formally specified across x402
// facilitators. Morph today returns `{ signers: { "eip155:*": [...] } }` —
// a wildcard meaning "any EVM chain on Morph" — so we accept that pattern
// alongside the more standard exact-key and `networks[]` layouts.
function extractSigners(body: unknown, caip2: string): string[] {
  if (!body || typeof body !== "object") return [];
  const b = body as Record<string, unknown>;

  // Layout A: { networks: [{ network: "eip155:2818", signers: [...] }] }
  const networks = b.networks;
  if (Array.isArray(networks)) {
    const entry = networks.find(
      (n) => (n as { network?: string }).network === caip2,
    ) as { signers?: unknown } | undefined;
    if (entry && Array.isArray(entry.signers)) {
      return entry.signers.filter((s): s is string => typeof s === "string");
    }
  }

  // Layouts B/C: { signers: { "eip155:2818" | "eip155:*": [...] } }.
  // Morph uses the wildcard; we accept both.
  const signersMap = b.signers;
  if (signersMap && typeof signersMap === "object" && !Array.isArray(signersMap)) {
    const m = signersMap as Record<string, unknown>;
    const candidates = [caip2, "eip155:*"];
    for (const key of candidates) {
      const arr = m[key];
      if (Array.isArray(arr)) {
        const filtered = arr.filter(
          (s): s is string => typeof s === "string",
        );
        if (filtered.length > 0) return filtered;
      }
    }
  }

  return [];
}

async function fetchAdvertisedSigners(
  facilitator: string,
  caip2: string,
): Promise<string[]> {
  const res = await fetch(`${facilitator.replace(/\/$/, "")}/v2/supported`);
  if (!res.ok) {
    throw new Error(`/v2/supported → HTTP ${res.status}`);
  }
  const body = await res.json();
  const signers = extractSigners(body, caip2);
  if (signers.length === 0) {
    throw new Error(`/v2/supported has no advertised signers for ${caip2}`);
  }
  return signers.map((s) => s.toLowerCase());
}

function check(
  id: CheckResult["id"],
  label: string,
  status: CheckStatus,
  detail: string,
  evidence?: Record<string, unknown>,
): CheckResult {
  return evidence !== undefined
    ? { id, label, status, detail, evidence }
    : { id, label, status, detail };
}

export async function verifyReceiptOnChain(
  receipt: Receipt,
): Promise<AuthenticityReport> {
  const network = morphByCaip2(receipt.network);
  if (!network) {
    return {
      network: null,
      checks: [
        check(
          "tx-exists",
          "Transaction exists on the declared network",
          "failed",
          `Unknown CAIP-2 network: ${receipt.network}`,
        ),
      ],
    };
  }

  const report: AuthenticityReport = { network, checks: [] };

  // Check 1: tx exists on the declared network
  let tx: TxData;
  try {
    const raw = (await rpcCall(network.rpc, "eth_getTransactionByHash", [
      receipt.transactionHash,
    ])) as TxData | null;
    if (!raw) {
      report.checks.push(
        check(
          "tx-exists",
          "Transaction exists on the declared network",
          "failed",
          `${network.name} RPC returned null for hash ${receipt.transactionHash}.`,
        ),
      );
      return report;
    }
    report.rawTx = raw;
    const observedChainId = Number.parseInt(raw.chainId, 16);
    if (observedChainId !== network.chainId) {
      report.checks.push(
        check(
          "tx-exists",
          "Transaction exists on the declared network",
          "failed",
          `Receipt claims ${network.name} (chainId ${network.chainId}) but tx is on chain ${observedChainId}.`,
          { observedChainId, expectedChainId: network.chainId },
        ),
      );
      return report;
    }
    tx = raw;
    report.checks.push(
      check(
        "tx-exists",
        "Transaction exists on the declared network",
        "passed",
        `${network.name} RPC returned tx at block ${Number.parseInt(raw.blockNumber, 16)}.`,
        { from: raw.from, to: raw.to, blockNumber: raw.blockNumber },
      ),
    );
  } catch (err) {
    report.checks.push(
      check(
        "tx-exists",
        "Transaction exists on the declared network",
        "failed",
        `RPC error: ${(err as Error).message}`,
      ),
    );
    return report;
  }

  const txFrom = tx.from.toLowerCase();
  const txTo = tx.to.toLowerCase();

  // Check 2: settlement contract matches what we expect for this network
  if (network.facilitatorSettlementContract) {
    const expected = network.facilitatorSettlementContract.toLowerCase();
    report.checks.push(
      txTo === expected
        ? check(
            "settlement-contract",
            "Settlement contract is the official Morph facilitator",
            "passed",
            `tx.to = ${expected}.`,
            { txTo, expected },
          )
        : check(
            "settlement-contract",
            "Settlement contract is the official Morph facilitator",
            "failed",
            `tx.to ${txTo} does not match expected ${expected}.`,
            { txTo, expected },
          ),
    );
  } else {
    report.checks.push(
      check(
        "settlement-contract",
        "Settlement contract is the official Morph facilitator",
        "skipped",
        `No verified settlement contract recorded for ${network.name} yet.`,
      ),
    );
  }

  // Check 3: relayer (tx.from) is an advertised facilitator signer
  try {
    const signers = await fetchAdvertisedSigners(
      network.facilitator,
      network.caip2,
    );
    report.advertisedSigners = signers;
    report.checks.push(
      signers.includes(txFrom)
        ? check(
            "relayer-advertised",
            "Relayer is an officially advertised facilitator signer",
            "passed",
            `${txFrom} is listed in ${network.facilitator}/v2/supported (${signers.length} total).`,
            { relayer: txFrom, signersCount: signers.length },
          )
        : check(
            "relayer-advertised",
            "Relayer is an officially advertised facilitator signer",
            "failed",
            `${txFrom} is NOT in the facilitator's advertised signer list.`,
            { relayer: txFrom, signers },
          ),
    );
  } catch (err) {
    report.checks.push(
      check(
        "relayer-advertised",
        "Relayer is an officially advertised facilitator signer",
        "skipped",
        `Could not reach facilitator: ${(err as Error).message}`,
      ),
    );
  }

  // Check 4: EIP-3009 AuthorizationUsed event emitted by the asset contract
  let payer: string | null = null;
  try {
    const rcpt = (await rpcCall(network.rpc, "eth_getTransactionReceipt", [
      receipt.transactionHash,
    ])) as ReceiptData | null;
    if (!rcpt) {
      report.checks.push(
        check(
          "authorization-used",
          "EIP-3009 AuthorizationUsed event emitted",
          "failed",
          "RPC returned no receipt for this tx.",
        ),
      );
    } else {
      report.rawReceipt = rcpt;
      const assetLower = receipt.asset.toLowerCase();
      const found = rcpt.logs.find(
        (l) =>
          l.address.toLowerCase() === assetLower &&
          l.topics[0] === AUTHORIZATION_USED_TOPIC,
      );
      if (found && found.topics[1]) {
        // topics[1] is the indexed `authorizer` (left-padded to 32 bytes).
        payer = `0x${found.topics[1].slice(-40)}`.toLowerCase();
        report.payer = payer;
        report.checks.push(
          check(
            "authorization-used",
            "EIP-3009 AuthorizationUsed event emitted",
            "passed",
            `${receipt.asset} emitted AuthorizationUsed for authorizer ${payer}.`,
            { logAddress: found.address, topic: found.topics[0], authorizer: payer },
          ),
        );
      } else {
        report.checks.push(
          check(
            "authorization-used",
            "EIP-3009 AuthorizationUsed event emitted",
            "failed",
            `No AuthorizationUsed log from ${receipt.asset}. This looks like a plain transfer, not EIP-3009.`,
            { logCount: rcpt.logs.length },
          ),
        );
      }
    }
  } catch (err) {
    report.checks.push(
      check(
        "authorization-used",
        "EIP-3009 AuthorizationUsed event emitted",
        "failed",
        `RPC error: ${(err as Error).message}`,
      ),
    );
  }

  // Check 5: payer ≠ relayer (the meta-tx pattern that proves x402)
  if (payer) {
    report.checks.push(
      payer !== txFrom
        ? check(
            "meta-tx-pattern",
            "Payer signed off-chain; facilitator submitted on-chain",
            "passed",
            `Payer ${payer} ≠ relayer ${txFrom}.`,
            { payer, relayer: txFrom },
          )
        : check(
            "meta-tx-pattern",
            "Payer signed off-chain; facilitator submitted on-chain",
            "failed",
            `Payer equals relayer (${payer}) — this is a self-signed transfer, not a meta-tx.`,
          ),
    );
  } else {
    report.checks.push(
      check(
        "meta-tx-pattern",
        "Payer signed off-chain; facilitator submitted on-chain",
        "skipped",
        "Cannot evaluate without an AuthorizationUsed event.",
      ),
    );
  }

  return report;
}
