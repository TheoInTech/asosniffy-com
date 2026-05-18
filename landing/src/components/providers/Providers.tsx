"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useEffect, useState, type ReactNode } from "react";
import { WagmiProvider, type Config } from "wagmi";
import { createAppKit } from "@reown/appkit/react";
import { morphHoodi } from "@/lib/wallet/chains";
import { projectId, wagmiAdapter, wagmiConfig } from "@/lib/wallet/config";

// One global AppKit instance per browser session. createAppKit is idempotent
// in development, but we guard it explicitly so React 19 strict-mode double
// effects don't recreate the modal.
let appKitInitialized = false;

function ensureAppKit(): void {
  if (appKitInitialized) return;
  if (typeof window === "undefined") return;
  createAppKit({
    adapters: [wagmiAdapter],
    projectId,
    networks: [morphHoodi],
    defaultNetwork: morphHoodi,
    metadata: {
      name: "Sniffy",
      description: "Agent-buyable ASO intelligence on Morph x402.",
      url:
        typeof window !== "undefined"
          ? window.location.origin
          : "https://asosniffy.com",
      icons: ["/sniffy/mascot-mark.svg"],
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

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => makeQueryClient());

  useEffect(() => {
    ensureAppKit();
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
