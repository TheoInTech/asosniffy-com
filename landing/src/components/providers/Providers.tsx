"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useEffect, useState, type ReactNode } from "react";
import { WagmiProvider, type Config } from "wagmi";
import { createAppKit } from "@reown/appkit/react";
import { morphActive } from "@/lib/wallet/chains";
import { projectId, wagmiAdapter, wagmiConfig } from "@/lib/wallet/config";

// One global AppKit instance per browser session. createAppKit is idempotent
// in development, but we guard it explicitly so React 19 strict-mode double
// effects don't recreate the modal.
//
// Initialization runs at module load time on the client (top-level, gated by
// `typeof window`) — NOT inside a useEffect — so any client component that
// calls `useAppKit()` during its first render finds the singleton already
// initialized. The previous useEffect-only init left a window where Trail's
// TrailGate / WalletConnect rendered before AppKit was created, surfacing as
// "Please call createAppKit before using useAppKit hook".
let appKitInitialized = false;

function ensureAppKit(): void {
  if (appKitInitialized) return;
  if (typeof window === "undefined") return;
  createAppKit({
    adapters: [wagmiAdapter],
    projectId,
    networks: [morphActive],
    defaultNetwork: morphActive,
    metadata: {
      name: "Sniffy",
      description: "Agent-buyable ASO intelligence on Morph x402.",
      url:
        typeof window !== "undefined"
          ? window.location.origin
          : "https://asosniffy.com",
      icons: ["/sniffy/logo-transparent.png"],
    },
    features: {
      analytics: false,
      email: false,
      socials: false,
    },
    themeMode: "light",
    themeVariables: {
      "--w3m-accent": "#15110D",
      "--w3m-color-mix": "#F7D43A",
      "--w3m-color-mix-strength": 12,
      "--w3m-border-radius-master": "0px",
    },
  });
  appKitInitialized = true;
}

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

// Top-level call: idempotent + window-guarded, so SSR is a no-op and the
// first client render of any descendant finds AppKit ready.
ensureAppKit();

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => makeQueryClient());

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    // Reown AppKit fires telemetry/discovery requests to api.web3modal.org,
    // pulse.walletconnect.com, rpc.walletconnect.org, and the relay on init.
    // When an ad-blocker or the Reown free-tier rate limiter trips them, the
    // resulting "TypeError: Failed to fetch" rejections surface with an
    // anonymous-frame-only stack and pollute the dev console. Suppress only
    // those — our own wrapped fetches surface a labeled ApiNetworkError whose
    // stack passes through client.ts/history.ts/verify.ts and never matches.
    const onReject = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      const msg = String(
        (reason && typeof reason === "object" && "message" in reason
          ? (reason as { message?: unknown }).message
          : reason) ?? "",
      );
      const stack =
        reason && typeof reason === "object" && "stack" in reason
          ? String((reason as { stack?: unknown }).stack ?? "")
          : "";
      if (
        msg.includes("Failed to fetch") &&
        /walletconnect|web3modal|reown|pulse\.wallet/i.test(msg + stack)
      ) {
        e.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", onReject);
    return () => window.removeEventListener("unhandledrejection", onReject);
  }, []);

  return (
    <WagmiProvider config={wagmiConfig as Config}>
      <QueryClientProvider client={queryClient}>
        {children}
        {process.env.NODE_ENV === "development" ? (
          <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
        ) : null}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
