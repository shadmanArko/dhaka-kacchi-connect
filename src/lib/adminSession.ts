import type { AdminUser } from "./api";

/**
 * Pure localStorage helpers for "is an admin logged in on this device" -
 * mirrors session.ts exactly, but with a DIFFERENT storage key. Never
 * reuse session.ts's key here: an admin and a customer could plausibly be
 * logged in as both in the same browser (the owner testing the site), and
 * the two must never collide or overwrite one another.
 */

const STORAGE_KEY = "dhaka-kacchi-admin-session";

type StoredAdminSession = { token: string; adminUser: AdminUser };

export function getAdminSession(): StoredAdminSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAdminSession) : null;
  } catch {
    // Private browsing / storage disabled / corrupted value - treat as logged out.
    return null;
  }
}

export function setAdminSession(token: string, adminUser: AdminUser): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, adminUser }));
  } catch {
    // Nothing we can do if storage is unavailable - the session just won't
    // persist across a reload, which is a graceful-enough degradation.
  }
}

export function clearAdminSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // See above.
  }
}
