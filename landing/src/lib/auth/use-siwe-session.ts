"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { getActiveMorphNetwork } from "@/lib/morph-urls";
import { getWalletNonce, postWalletSession, deleteWalletSession } from "@/lib/api/client";
import { SiweAuthError } from "@/lib/api/errors";
import {
  type CachedSession,
  clearAllCachedSessions,
  clearCachedSession,
  readCachedSession,
  writeCachedSession,
} from "./siwe-storage";

// Hook that owns the SIWE flow for the connected wallet.
//
// State machine:
//   disconnected  → wallet not connected (no address)
//   ready_to_sign → wallet connected, no cached session
//   signed_in     → cached session (or freshly issued) is valid
//   signing       → user is interacting with the wallet right now
//   error         → user rejected, server returned 401, or other failure
//
// Address-change discipline: when useAccount() reports a different address
// than the one we cached a session for, we clear ALL cached sessions
// defensively. A stale token from a previous wallet must never be reusable
// after the user switches wallets.

export type SiweStatus = "disconnected" | "ready_to_sign" | "signing" | "signed_in" | "error";

export interface UseSiweSessionResult {
  status: SiweStatus;
  address: `0x${string}` | undefined;
  sessionToken: string | null;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  // Called by data-fetching callers when they receive a SiweAuthError —
  // clears cached session so the next render shows ready_to_sign.
  invalidateSession: () => void;
}

function buildSiweMessage(args: {
  domain: string;
  address: string;
  chainId: number;
  nonce: string;
  uri: string;
  issuedAt: string;
  expirationTime: string;
}): string {
  return [
    `${args.domain} wants you to sign in with your Ethereum account:`,
    args.address,
    "",
    "Sign in to Sniffy — view your Trail of past sniffs. No gas, just a signature.",
    "",
    `URI: ${args.uri}`,
    "Version: 1",
    `Chain ID: ${args.chainId}`,
    `Nonce: ${args.nonce}`,
    `Issued At: ${args.issuedAt}`,
    `Expiration Time: ${args.expirationTime}`,
  ].join("\n");
}

const MESSAGE_TTL_MS = 5 * 60 * 1000;

export function useSiweSession(): UseSiweSessionResult {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [session, setSession] = useState<CachedSession | null>(null);
  const [status, setStatus] = useState<SiweStatus>("disconnected");
  const [error, setError] = useState<string | null>(null);
  // Track which address the cached session belongs to so we can detect
  // address changes between renders.
  const lastAddressRef = useRef<`0x${string}` | undefined>(undefined);

  // Hydrate from sessionStorage when the wallet connects, and respond to
  // address changes by clearing stale sessions.
  useEffect(() => {
    if (!isConnected || !address) {
      lastAddressRef.current = undefined;
      setSession(null);
      setStatus("disconnected");
      setError(null);
      return;
    }
    const prev = lastAddressRef.current;
    if (prev && prev.toLowerCase() !== address.toLowerCase()) {
      // Wallet swapped — defensive clear of every cached session.
      clearAllCachedSessions();
    }
    lastAddressRef.current = address;
    const cached = readCachedSession(address);
    if (cached && cached.address.toLowerCase() === address.toLowerCase()) {
      setSession(cached);
      setStatus("signed_in");
      setError(null);
    } else {
      setSession(null);
      setStatus("ready_to_sign");
      setError(null);
    }
  }, [address, isConnected]);

  const signIn = useCallback(async () => {
    if (!address || !isConnected) {
      setError("Connect your wallet first.");
      setStatus("error");
      return;
    }
    setStatus("signing");
    setError(null);
    try {
      const nonceRes = await getWalletNonce(address);
      const issuedAt = new Date();
      const expiration = new Date(issuedAt.getTime() + MESSAGE_TTL_MS);
      const message = buildSiweMessage({
        domain: nonceRes.domain,
        address,
        chainId: getActiveMorphNetwork().chainId,
        nonce: nonceRes.nonce,
        uri:
          typeof window !== "undefined"
            ? `${window.location.origin}/trail`
            : "https://sniffy.io/trail",
        issuedAt: issuedAt.toISOString(),
        expirationTime: expiration.toISOString(),
      });
      const signature = await signMessageAsync({ message });
      const sessionRes = await postWalletSession({ message, signature });
      const cached: CachedSession = {
        sessionToken: sessionRes.sessionToken,
        address: address.toLowerCase() as `0x${string}`,
        expiresAt: sessionRes.expiresAt,
      };
      writeCachedSession(cached);
      setSession(cached);
      setStatus("signed_in");
    } catch (err) {
      const message = readableError(err);
      setError(message);
      setStatus("error");
    }
  }, [address, isConnected, signMessageAsync]);

  const signOut = useCallback(async () => {
    if (session) {
      try {
        await deleteWalletSession(session.sessionToken);
      } catch {
        // Best-effort. Even if the server call fails (network, expired), we
        // still need to wipe local state.
      }
    }
    if (address) clearCachedSession(address);
    setSession(null);
    setStatus(isConnected ? "ready_to_sign" : "disconnected");
    setError(null);
  }, [session, address, isConnected]);

  const invalidateSession = useCallback(() => {
    if (address) clearCachedSession(address);
    setSession(null);
    setStatus(isConnected ? "ready_to_sign" : "disconnected");
  }, [address, isConnected]);

  return {
    status,
    address,
    sessionToken: session?.sessionToken ?? null,
    error,
    signIn,
    signOut,
    invalidateSession,
  };
}

function readableError(err: unknown): string {
  if (err instanceof SiweAuthError) {
    switch (err.code) {
      case "nonce_invalid":
        return "Sign-in token expired. Try again.";
      case "chain_mismatch":
        return "Wallet is on the wrong network. Switch to the active Morph network.";
      case "domain_mismatch":
        return "Sign-in blocked: domain mismatch.";
      case "expired":
        return "Sign-in message expired. Try again.";
      case "signature_invalid":
        return "Signature didn't verify. Try again.";
      default:
        return err.message;
    }
  }
  if (err instanceof Error) return err.message;
  return "Sign-in failed.";
}
