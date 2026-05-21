// sessionStorage-backed cache for SIWE-issued session tokens.
//
// Reasoning: SIWE sessions die with the tab. localStorage persists across
// browser restarts and has a wider XSS blast radius; sessionStorage limits
// the lifetime to the active tab while still surviving refreshes inside it.
// The token format `sniffy_sess_<random>` from the server is itself
// short-lived (30 minutes), so the worst case from an unexpected refresh
// is a re-sign prompt, not a security incident.

const KEY_PREFIX = "sniffy:siwe:v1:";

export interface CachedSession {
  // Opaque server-issued session bearer token.
  sessionToken: string;
  // Lowercased EVM address the session is bound to.
  address: `0x${string}`;
  // ISO timestamp.
  expiresAt: string;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function key(address: string): string {
  return `${KEY_PREFIX}${address.toLowerCase()}`;
}

export function readCachedSession(address: string): CachedSession | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.sessionStorage.getItem(key(address));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedSession;
    if (
      !parsed ||
      typeof parsed.sessionToken !== "string" ||
      typeof parsed.address !== "string" ||
      typeof parsed.expiresAt !== "string"
    ) {
      return null;
    }
    if (Date.parse(parsed.expiresAt) <= Date.now()) {
      // Expired — clear and return null.
      window.sessionStorage.removeItem(key(address));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedSession(session: CachedSession): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(key(session.address), JSON.stringify(session));
  } catch {
    // Quota exceeded / private mode — silently drop. The hook will treat
    // the next refresh as a fresh sign-in (no infinite loop).
  }
}

// Clear a single wallet's cached session.
export function clearCachedSession(address: string): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(key(address));
  } catch {
    // ignore
  }
}

// Clear ALL Sniffy SIWE sessions. Defensive — called on address change so a
// stale session from a previous wallet can never re-authorize a new wallet.
export function clearAllCachedSessions(): void {
  if (!isBrowser()) return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (k && k.startsWith(KEY_PREFIX)) toRemove.push(k);
    }
    for (const k of toRemove) window.sessionStorage.removeItem(k);
  } catch {
    // ignore
  }
}
