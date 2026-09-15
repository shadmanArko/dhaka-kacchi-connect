import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { adminApi, ApiError, type AdminUser } from "@/lib/api";
import {
  getAdminSession,
  setAdminSession as persistAdminSession,
  clearAdminSession,
} from "@/lib/adminSession";

type AdminSessionState = {
  token: string | null;
  adminUser: AdminUser | null;
  /** True until the initial "is there a stored admin session, and is it
   * still valid" check finishes - mirrors useSession.tsx's isLoading, and
   * exists for the same reason: the admin layout's auth gate must not
   * flash a "please log in" redirect for a moment before a real session
   * is restored. */
  isLoading: boolean;
  login: (token: string, adminUser: AdminUser) => void;
  logout: () => void;
};

const AdminSessionContext = createContext<AdminSessionState | null>(null);

/** Mirrors useSession.tsx's SessionProvider exactly, against the separate
 * admin_session localStorage key and /v1/admin/* endpoints - deliberately
 * NOT wired into PostHog (no identifyCustomer-equivalent call) - admin
 * usage of this panel should stay invisible to customer-facing analytics,
 * see __root.tsx's Analytics component. Mounted only inside
 * routes/admin/_layout.tsx, not at the app root, since no other route
 * needs it. */
export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = getAdminSession();
    if (!stored) {
      setIsLoading(false);
      return;
    }
    setToken(stored.token);
    setAdminUser(stored.adminUser);
    adminApi
      .getMe(stored.token)
      .then(({ adminUser: fresh }) => {
        setAdminUser(fresh);
        persistAdminSession(stored.token, fresh);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          clearAdminSession();
          setToken(null);
          setAdminUser(null);
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  function login(newToken: string, newAdminUser: AdminUser) {
    persistAdminSession(newToken, newAdminUser);
    setToken(newToken);
    setAdminUser(newAdminUser);
  }

  function logout() {
    if (token) {
      adminApi.logout(token).catch(() => {
        // Best-effort - the local session is cleared either way.
      });
    }
    clearAdminSession();
    setToken(null);
    setAdminUser(null);
  }

  return (
    <AdminSessionContext.Provider value={{ token, adminUser, isLoading, login, logout }}>
      {children}
    </AdminSessionContext.Provider>
  );
}

export function useAdminSession(): AdminSessionState {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) {
    throw new Error("useAdminSession must be used within an AdminSessionProvider");
  }
  return ctx;
}
