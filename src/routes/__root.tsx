import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useLocation,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { FloatingSocial } from "@/components/layout/FloatingSocial";
import { ConsentBanner } from "@/components/ConsentBanner";
import { SessionProvider } from "@/hooks/useSession";
import { initAnalytics, trackPageview } from "@/lib/analytics";
import { SITE_URL } from "@/lib/seo";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-serif text-7xl text-gold">404</h1>
        <h2 className="mt-4 font-serif text-xl text-cream">Page not found</h2>
        <p className="mt-2 text-sm text-muted-warm">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center border border-gold px-6 py-3 text-sm uppercase tracking-[0.2em] text-gold hover:bg-gold hover:text-black-ink transition-colors"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-serif text-xl text-cream">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-warm">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="border border-gold px-6 py-3 text-sm uppercase tracking-[0.2em] text-gold hover:bg-gold hover:text-black-ink transition-colors"
          >
            Try again
          </button>
          <a
            href="/"
            className="border border-line px-6 py-3 text-sm uppercase tracking-[0.2em] text-cream hover:border-gold hover:text-gold transition-colors"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#07070A" },
      { title: "Dhaka Kacchi Berlin — Authentic Kacchi Biriyani & Borhani" },
      {
        name: "description",
        content:
          "Berlin's only authentic Kacchi Biriyani and Borhani — prepared by a Bangladeshi doctor with generations of family tradition.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:site_name", content: "Dhaka Kacchi Berlin" },
      { property: "og:locale", content: "en_US" },
      // Root-level og:title/og:description are the floor for routes that set
      // neither (/privacy, and the 404 page). Routes that define their own
      // override these - meta merges leaf-wins, deduped on `name ?? property`.
      {
        property: "og:title",
        content: "Dhaka Kacchi Berlin — Authentic Kacchi Biriyani & Borhani",
      },
      {
        property: "og:description",
        content:
          "Berlin's only authentic Kacchi Biriyani and Borhani. Cooked fresh every Saturday — order by Friday 6pm.",
      },
      // Absolute URLs, not "/og-image.jpg": WhatsApp (this business's main
      // sharing channel) does not reliably resolve a relative og:image
      // against the page URL, and renders a blank card when it can't.
      { property: "og:image", content: `${SITE_URL}/og-image.jpg` },
      { property: "og:image:secure_url", content: `${SITE_URL}/og-image.jpg` },
      { property: "og:image:type", content: "image/jpeg" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Kacchi biriyani from Dhaka Kacchi Berlin" },
      { name: "twitter:image", content: `${SITE_URL}/og-image.jpg` },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,600&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;1,9..40,300&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

// Fires exactly once per browser session (initAnalytics is idempotent) and
// once per client-side navigation thereafter - TanStack Router is a client
// router, so without this a page's $pageview would only ever fire on a
// real full-page load, undercounting every in-app navigation. Deliberately
// a useEffect, not a module-level call: effects never run during the
// server-side prerender pass this app's build relies on (see
// scripts/build-static.mjs), so PostHog's browser-only SDK never executes
// in that Node environment.
//
// /admin/* is deliberately excluded from trackPageview - the owner's own
// use of the internal admin panel isn't a customer funnel event and would
// only pollute customer-facing PostHog analytics.
function Analytics() {
  const { pathname } = useLocation();
  const isAdminRoute = pathname.startsWith("/admin");

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    if (!isAdminRoute) trackPageview();
  }, [pathname, isAdminRoute]);

  return null;
}

// The marketing chrome (nav, WhatsApp bubble, cookie banner, footer) makes
// no sense wrapping the admin panel - it's an internal tool behind its own
// login, not a page a visitor should see with a "subscribe"/social-share
// bar around it. There's no other route-based branching mechanism in this
// app, so this one pathname check is it - see routes/admin/_layout.tsx for
// the admin section's own (much simpler) chrome.
function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { pathname } = useLocation();
  const isAdminRoute = pathname.startsWith("/admin");

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <Analytics />
        {!isAdminRoute && (
          <>
            <SiteHeader />
            <FloatingSocial />
            <ConsentBanner />
          </>
        )}
        <main>
          <Outlet />
        </main>
        {!isAdminRoute && <SiteFooter />}
      </SessionProvider>
    </QueryClientProvider>
  );
}
