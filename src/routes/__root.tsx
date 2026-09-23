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
import { useTranslation } from "react-i18next";

import appCss from "../styles.css?url";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { FloatingSocial } from "@/components/layout/FloatingSocial";
import { ConsentBanner } from "@/components/ConsentBanner";
import { SessionProvider } from "@/hooks/useSession";
import { initAnalytics, trackPageview, trackWarehouseEvent } from "@/lib/analytics";
import { SITE_URL } from "@/lib/seo";
import { captureUtmFromLocation } from "@/lib/utmCapture";
import i18n, { DEFAULT_LOCALE, localeDir, type Locale } from "@/lib/i18n";

/** Every route's URL is the single source of truth for which language is
 * shown. This used to be synced from beforeLoad, which seemed right (it
 * runs before render, both during SSR for the first request and on every
 * client navigation) - but beforeLoad ALSO runs for a route the router is
 * only speculatively preloading (Link's default hover/viewport preload),
 * with a `preload: true` flag on its context. Confirmed live: hovering the
 * "DE" switcher on the English homepage re-rendered the whole page in
 * German with the URL still on "/", because i18next is one shared instance
 * and every mounted useTranslation() consumer reacts to changeLanguage()
 * regardless of which route asked for it. Guarding on `!preload` in
 * beforeLoad wasn't enough either: TanStack Router can reuse a preloaded
 * match's beforeLoad result for the real navigation that follows it, so
 * skipping the preload's call also silently skipped the real one.
 *
 * The fix: don't drive this from beforeLoad at all. `useLocation()` only
 * ever reflects the router's actual, committed location - never a
 * speculative preload - so RootShell (below) reads it directly and
 * resyncs i18next synchronously at the top of render, before any child
 * calls t(). That covers SSR (the "current" location IS the request) and
 * every real client-side navigation, without the preload false positive. */
function localeFromPathname(pathname: string): Locale {
  return pathname === "/de" || pathname.startsWith("/de/") ? "de" : DEFAULT_LOCALE;
}

function syncLocale(pathname: string): Locale {
  const locale = localeFromPathname(pathname);
  if (i18n.language !== locale) void i18n.changeLanguage(locale);
  return locale;
}

function NotFoundComponent() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-serif text-7xl text-gold">404</h1>
        <h2 className="mt-4 font-serif text-xl text-cream">{t("common.notFoundTitle")}</h2>
        <p className="mt-2 text-sm text-muted-warm">{t("common.notFoundBody")}</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center border border-gold px-6 py-3 text-sm uppercase tracking-[0.2em] text-gold hover:bg-gold hover:text-black-ink transition-colors"
          >
            {t("common.goHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-serif text-xl text-cream">{t("common.errorTitle")}</h1>
        <p className="mt-2 text-sm text-muted-warm">{t("common.errorBody")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="border border-gold px-6 py-3 text-sm uppercase tracking-[0.2em] text-gold hover:bg-gold hover:text-black-ink transition-colors"
          >
            {t("common.tryAgain")}
          </button>
          <a
            href="/"
            className="border border-line px-6 py-3 text-sm uppercase tracking-[0.2em] text-cream hover:border-gold hover:text-gold transition-colors"
          >
            {t("common.goHome")}
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
      // Both are separate origins contacted from mount effects - the API on
      // every page with a session, PostHog on every page full stop. Without
      // these the DNS + TLS + TCP handshake is paid serially at the moment
      // they're first needed, most visibly on /order where the menu can't
      // render until a cold connection to the API completes.
      { rel: "preconnect", href: "https://api.dhakakacchi.com" },
      { rel: "preconnect", href: "https://eu.i.posthog.com" },
      {
        // Weights audited against actual usage. Dropped: serif 500, 600 and
        // italic 600 (zero `font-serif font-medium/semibold` in the codebase)
        // and DM Sans italic (every <em> is forced to serif italic). ADDED:
        // sans 500 and 600, which are used 28 and 10 times across the admin UI
        // and were never requested - the browser was synthesising faux-bold
        // for them.
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  // useLocation() is the router's real, committed location - unlike
  // beforeLoad, it is never called for a speculative preload of some other
  // route (see the long comment above syncLocale()). Runs before
  // RootComponent's own body (React evaluates a parent's statements before
  // descending into its children), so every t() call below this point in
  // the tree already sees the right language, on the server and client.
  const { pathname } = useLocation();
  const locale = syncLocale(pathname);
  return (
    <html lang={locale} dir={localeDir(locale)}>
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
  // The order page (routes/order.tsx and its /$locale variant) IS the menu -
  // see OrderPage.tsx; there's no separate /menu route to key off instead.
  const isOrderRoute = pathname.endsWith("/order");

  useEffect(() => {
    // Before initAnalytics(): captures whatever utm_* params this tab's
    // very first URL carried, independent of consent and of PostHog's own
    // (async, chunked) load - see utmCapture.ts.
    captureUtmFromLocation();
    initAnalytics();
  }, []);

  useEffect(() => {
    if (isAdminRoute) return;
    trackPageview();
    trackWarehouseEvent("page_view");
    if (isOrderRoute) trackWarehouseEvent("menu_view");
  }, [pathname, isAdminRoute, isOrderRoute]);

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
  const { t } = useTranslation();
  const isAdminRoute = pathname.startsWith("/admin");

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <Analytics />
        {!isAdminRoute && (
          <>
            {/* Ten tab stops (logo, 4 nav links, order CTA, 2 socials, 2
                consent buttons) sat between the top of every page and its
                content. Visually hidden until focused, then a normal button. */}
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:bg-gold focus:px-6 focus:py-3 focus:font-sans focus:text-[0.78rem] focus:uppercase focus:tracking-[0.2em] focus:text-black-ink"
            >
              {t("common.skipToContent")}
            </a>
            <SiteHeader />
            <FloatingSocial />
            <ConsentBanner />
          </>
        )}
        <main id="main">
          <Outlet />
        </main>
        {!isAdminRoute && <SiteFooter />}
      </SessionProvider>
    </QueryClientProvider>
  );
}
