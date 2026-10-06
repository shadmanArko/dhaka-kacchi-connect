import {
  Outlet,
  Link,
  createRootRoute,
  useLocation,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import appCss from "../styles.css?url";
import dmSansUrl from "@/assets/fonts/dm-sans-latin.woff2?url";
import cormorantUrl from "@/assets/fonts/cormorant-garamond-latin-normal.woff2?url";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { FloatingSocial } from "@/components/layout/FloatingSocial";
import { ConsentBanner } from "@/components/ConsentBanner";
import { SessionProvider } from "@/hooks/useSession";
import {
  captureInternalFlag,
  initAnalytics,
  setAdminMode,
  trackPageview,
  trackWarehouseEvent,
} from "@/lib/analytics";
import { SITE_URL } from "@/lib/seo";
import { captureUtmFromLocation } from "@/lib/utmCapture";
import i18n, { loadLocale, localeDir, localeFromPathname, type Locale } from "@/lib/i18n";

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
 * every real client-side navigation, without the preload false positive.
 *
 * beforeLoad (see Route below) still has a job here, but only a harmless one:
 * it LOADS the destination language's strings (loadLocale in lib/i18n.ts)
 * and never switches the active language. Switching stays here, so a
 * speculative preload can warm the German chunk without re-rendering the
 * page in German. */
function syncLocale(pathname: string): Locale {
  const locale = localeFromPathname(pathname);
  // Language not loaded (its chunk failed to fetch - see beforeLoad below):
  // stay in the language we have instead of rendering raw keys.
  if (!i18n.hasResourceBundle(locale, "translation")) return i18n.language as Locale;
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

export const Route = createRootRoute({
  // Make sure the language this navigation is going TO is loaded before the
  // route renders (a no-op unless the visitor is switching language - the
  // page's own language is loaded before hydration, see lib/i18n.ts). If the
  // chunk can't be fetched (offline, or replaced by a deploy under an open
  // tab) the navigation still completes and syncLocale() simply stays in the
  // current language, rather than turning a language switch into an error
  // page.
  beforeLoad: async ({ location }) => {
    await loadLocale(localeFromPathname(location.pathname)).catch(() => undefined);
  },
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
      {
        name: "twitter:title",
        content: "Dhaka Kacchi Berlin — Authentic Kacchi Biriyani & Borhani",
      },
      {
        name: "twitter:description",
        content:
          "Berlin's only authentic Kacchi Biriyani and Borhani. Cooked fresh every Saturday — order by Friday 6pm.",
      },
      { property: "og:site_name", content: "Dhaka Kacchi Berlin" },
      // Root-level og:*/twitter:* are the English floor for routes that call
      // no pageHead() (the 404 page, /orders, /reset-password, admin). Every
      // public page calls pageHead(), which overrides these per language
      // (og:locale, og:image:alt, titles/descriptions) - meta merges
      // leaf-wins, deduped on `name ?? property`.
      { property: "og:locale", content: "en_US" },
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
      { property: "og:image:alt", content: "Dhaka Kacchi Berlin logo" },
      { name: "twitter:image", content: `${SITE_URL}/og-image.jpg` },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "icon", href: "/favicons/favicon-32.png", type: "image/png", sizes: "32x32" },
      { rel: "icon", href: "/favicons/icon-192.png", type: "image/png", sizes: "192x192" },
      { rel: "apple-touch-icon", href: "/favicons/apple-touch-icon.png", sizes: "180x180" },
      // Fonts are self-hosted (@font-face in styles.css). Preload the two
      // faces every page paints above the fold - body copy and the serif
      // headline. Fonts are only discovered once the CSS has been fetched AND
      // parsed, which puts them behind the stylesheet in the waterfall;
      // preloading starts them in parallel with it. crossOrigin is required
      // even for same-origin fonts: font fetches are CORS-mode, and without it
      // the preload is downloaded twice (once ignored, once used). The italic
      // serif is deliberately not preloaded - it is only the accent word in a
      // heading, and a third preload would compete with the hero image.
      { rel: "preload", as: "font", type: "font/woff2", href: dmSansUrl, crossOrigin: "anonymous" },
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: cormorantUrl,
        crossOrigin: "anonymous",
      },
      // Both are separate origins contacted from mount effects - the API on
      // every page with a session, PostHog on every page full stop. Without
      // these the DNS + TLS + TCP handshake is paid serially at the moment
      // they're first needed, most visibly on /order where the menu can't
      // render until a cold connection to the API completes.
      { rel: "preconnect", href: "https://api.dhakakacchi.com" },
      { rel: "preconnect", href: "https://eu.i.posthog.com" },
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
    captureInternalFlag();
    initAnalytics();
  }, []);

  useEffect(() => {
    setAdminMode(isAdminRoute);
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
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const isAdminRoute = pathname.startsWith("/admin");

  return (
    <>
      <SessionProvider>
        <Analytics />
        {!isAdminRoute && (
          <>
            {/* Ten tab stops (logo, 4 nav links, order CTA, 2 socials, 2
                consent buttons) sat between the top of every page and its
                content. Visually hidden until focused, then a normal button. */}
            <a
              href="#main"
              data-menu-inert
              className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:bg-gold focus:px-6 focus:py-3 focus:font-sans focus:text-[0.78rem] focus:uppercase focus:tracking-[0.2em] focus:text-black-ink"
            >
              {t("common.skipToContent")}
            </a>
            <SiteHeader />
            <FloatingSocial />
            <ConsentBanner />
          </>
        )}
        <main id="main" data-menu-inert>
          <Outlet />
        </main>
        {!isAdminRoute && <SiteFooter />}
      </SessionProvider>
    </>
  );
}
