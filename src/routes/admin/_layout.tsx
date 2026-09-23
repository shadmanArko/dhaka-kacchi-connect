import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AdminSessionProvider, useAdminSession } from "@/hooks/useAdminSession";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/_layout")({
  // Keeps /admin, /admin/login and /admin/orders/new out of Google in one
  // place - this is a pathless layout, so it's a match on all three, and the
  // leaf routes only set `title` (handled by a separate branch of the head
  // merge), so nothing can shadow this. Deliberately a meta tag rather than a
  // robots.txt Disallow: a Disallow would stop Google fetching the page and
  // therefore stop it ever reading this tag.
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminLayoutRoute,
});

function AdminLayoutRoute() {
  return (
    <AdminSessionProvider>
      <AdminChrome />
    </AdminSessionProvider>
  );
}

// Deliberately a client-only useEffect redirect, never TanStack Router's
// beforeLoad/loader - those run during the Node prerender pass too (see
// scripts/build-static.mjs), with no localStorage/cookies available, and
// would either fail the build or freeze a wrong redirect into the static
// HTML. This mirrors exactly how routes/order.tsx already gates on
// session.isLoading/session.customer today - see useSession.tsx.
function AdminChrome() {
  const { adminUser, isLoading, logout } = useAdminSession();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isLoginPage = pathname === "/admin/login";

  useEffect(() => {
    if (!isLoading && !adminUser && !isLoginPage) {
      navigate({ to: "/admin/login" });
    }
  }, [isLoading, adminUser, isLoginPage, navigate]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="font-sans text-sm text-muted-foreground">Checking session…</p>
      </div>
    );
  }

  // Not logged in, and not already on the login page - the effect above
  // will redirect there; render nothing in the meantime rather than a
  // flash of a page that's about to disappear.
  if (!adminUser && !isLoginPage) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {adminUser && (
        <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
          <nav className="flex items-center gap-4">
            <span className="font-sans text-sm font-medium">Dhaka Kacchi — Admin</span>
            <Link
              to="/admin"
              search={{ order: undefined }}
              className="font-sans text-sm text-muted-foreground hover:text-foreground data-[status=active]:text-foreground data-[status=active]:font-medium"
            >
              Orders
            </Link>
            <Link
              to="/admin/reporting"
              className="font-sans text-sm text-muted-foreground hover:text-foreground data-[status=active]:text-foreground data-[status=active]:font-medium"
            >
              Reporting
            </Link>
            <Link
              to="/admin/cockpit"
              className="font-sans text-sm text-muted-foreground hover:text-foreground data-[status=active]:text-foreground data-[status=active]:font-medium"
            >
              Cockpit
            </Link>
            <Link
              to="/admin/post-predict"
              className="font-sans text-sm text-muted-foreground hover:text-foreground data-[status=active]:text-foreground data-[status=active]:font-medium"
            >
              Post predictor
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <span className="font-sans text-sm text-muted-foreground">{adminUser.name}</span>
            <Button variant="outline" size="sm" onClick={logout}>
              Log out
            </Button>
          </div>
        </header>
      )}
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
