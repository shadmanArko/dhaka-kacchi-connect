import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, type PublicCustomer } from "@/lib/api";
import { getSession, setSession as persistSession, clearSession } from "@/lib/session";

type SessionState = {
  token: string | null;
  customer: PublicCustomer | null;
  /** True until the initial "is there a stored session, and is it still
   * valid" check finishes - lets the checkout button avoid flashing a
   * logged-out state for a moment before a real session is restored. */
  isLoading: boolean;
  login: (token: string, customer: PublicCustomer) => void;
  logout: () => void;
  updateCustomer: (customer: PublicCustomer) => void;
};

const SessionContext = createContext<SessionState | null>(null);

/** Mounted once, at the app root (see __root.tsx). Restores a stored
 * session on load and confirms it's still valid via GET /v1/me - a
 * revoked/expired token clears the stored session so a stale prefill can
 * never confuse checkout. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [customer, setCustomer] = useState<PublicCustomer | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = getSession();
    if (!stored) {
      setIsLoading(false);
      return;
    }
    setToken(stored.token);
    setCustomer(stored.customer);
    api
      .getMe(stored.token)
      .then(({ customer: fresh }) => {
        setCustomer(fresh);
        persistSession(stored.token, fresh);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clearSession();
          setToken(null);
          setCustomer(null);
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  function login(newToken: string, newCustomer: PublicCustomer) {
    persistSession(newToken, newCustomer);
    setToken(newToken);
    setCustomer(newCustomer);
  }

  function logout() {
    if (token) {
      api.logout(token).catch(() => {
        // Best-effort - the local session is cleared either way, so a
        // logout always "succeeds" from the user's point of view.
      });
    }
    clearSession();
    setToken(null);
    setCustomer(null);
  }

  function updateCustomer(next: PublicCustomer) {
    setCustomer(next);
    if (token) persistSession(token, next);
  }

  return (
    <SessionContext.Provider value={{ token, customer, isLoading, login, logout, updateCustomer }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return ctx;
}
