import type { PublicCustomer } from "./api";

/**
 * Pure localStorage helpers for "is someone logged in on this device" - no
 * React. useSession.tsx wraps this in a context/provider; nothing else
 * should touch localStorage for this directly.
 */

const STORAGE_KEY = "dhaka-kacchi-session";

type StoredSession = { token: string; customer: PublicCustomer };

export function getSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    // Private browsing / storage disabled / corrupted value - treat as logged out.
    return null;
  }
}

export function setSession(token: string, customer: PublicCustomer): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, customer }));
  } catch {
    // Nothing we can do if storage is unavailable - the session just won't
    // persist across a reload, which is a graceful-enough degradation.
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // See above.
  }
}
