/**
 * Keeps a half-finished sign-up across a page reload. On a phone the customer
 * has to leave the browser to read the SMS/email code, and mobile browsers
 * routinely discard the background tab - without this they come back to an
 * empty form and an expired sense of progress, and the order is lost.
 *
 * sessionStorage, not localStorage: it survives a reload/eviction of THIS tab
 * but is gone when the tab closes, which is the right lifetime for personal
 * data. The password is never stored. Wiped on successful login.
 */

const KEY = "dhaka-kacchi-signup-draft";

export type AuthDraft = {
  phone: string;
  name: string;
  dobDay: string;
  dobMonth: string;
  dobYear: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  email: string;
  /** Set once a code has been sent, so the customer lands back on the code
   * step instead of re-registering. Ignored once expired. */
  otp?: { channels: ("sms" | "email")[]; expiresAt: string };
};

export function readAuthDraft(): AuthDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthDraft;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function writeAuthDraft(draft: AuthDraft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Storage unavailable: the draft just won't survive a reload.
  }
}

export function clearAuthDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // See above.
  }
}
