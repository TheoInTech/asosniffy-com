import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  // @sniffy/scraper ships pre-built dist/, but we transpile to keep ESM/CJS
  // interop resilient across pnpm workspace + Next 15.
  transpilePackages: ["@sniffy/scraper"],
  reactStrictMode: true,
  webpack(config) {
    config.resolve = config.resolve ?? {};
    config.resolve.fallback = {
      ...(config.resolve.fallback ?? {}),
      // pino-pretty is a dev-only optional dependency of @walletconnect/logger.
      "pino-pretty": false,
      // `accounts` is an optional dynamic import in @wagmi/core's experimental
      // tempo wallet adapter — Sniffy doesn't use Tempo, so it's safe to stub.
      accounts: false,
      // @metamask/connect-evm is the in-page MetaMask SDK pulled in by the
      // wagmi metaMask connector; the WalletConnect modal flow covers our UX.
      "@metamask/connect-evm": false,
    };
    return config;
  },
};

export default nextConfig;
