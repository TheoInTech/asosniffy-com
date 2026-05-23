"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

const SENSITIVE_QUERY_KEYS = [
  "address",
  "wallet",
  "account",
  "tx",
  "txHash",
  "signature",
  "signer",
  "receipt",
] as const;

function scrubUrl(event: BeforeSendEvent): BeforeSendEvent | null {
  try {
    const url = new URL(event.url);
    let changed = false;
    for (const key of SENSITIVE_QUERY_KEYS) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    return changed ? { ...event, url: url.toString() } : event;
  } catch {
    return null;
  }
}

export function VercelAnalytics() {
  return <Analytics beforeSend={scrubUrl} />;
}
