import { env } from "../../env.js";

// Outbound proxy adapter for provider HTTP calls.
//
// Two outbound HTTP layers exist in the scraper:
//   1) Native `fetch` (used by `providers/apple/itunes.ts` and our own
//      audit-aware code). Proxied via undici's global ProxyAgent when
//      configured for the provider.
//   2) `got` inside `google-play-scraper`. Proxied via the `HTTPS_PROXY`
//      env hint when configured — got@11 will honor it via tough-cookie /
//      hpagent if available.
//
// Phase 2 ships with the env wired, the helpers exposed, but the actual
// proxy dispatcher only engaged when PROXY_URL is set AND the provider
// appears in PROXY_ENABLED_PROVIDERS. This is the kill-switch behavior
// from the plan — no proxy creds, no proxy traffic.

export function isProxyEnabled(provider: string): boolean {
  if (!env.PROXY_URL) return false;
  return env.PROXY_ENABLED_PROVIDERS.includes(provider);
}

// Apply the proxy globally for a specific provider's HTTP layer. This
// only mutates process.env keys that affect outbound HTTP libs; we restore
// them after the wrapped function resolves so other providers (Apple) keep
// going to the open internet.
//
// Used like:
//   const result = await withProxyForProvider("google-play", () => gplay.app(...))
export async function withProxyForProvider<T>(
  provider: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!isProxyEnabled(provider)) {
    return fn();
  }
  const previousHttps = process.env.HTTPS_PROXY;
  const previousHttp = process.env.HTTP_PROXY;
  process.env.HTTPS_PROXY = env.PROXY_URL;
  process.env.HTTP_PROXY = env.PROXY_URL;
  try {
    return await fn();
  } finally {
    if (previousHttps === undefined) delete process.env.HTTPS_PROXY;
    else process.env.HTTPS_PROXY = previousHttps;
    if (previousHttp === undefined) delete process.env.HTTP_PROXY;
    else process.env.HTTP_PROXY = previousHttp;
  }
}

// Resolved proxy URL for a specific provider, or undefined when proxy is
// disabled for that provider. Used by callers that pass the URL directly
// to their HTTP library (e.g. an hpagent constructor).
export function proxyUrlFor(provider: string): string | undefined {
  if (!isProxyEnabled(provider)) return undefined;
  return env.PROXY_URL;
}
