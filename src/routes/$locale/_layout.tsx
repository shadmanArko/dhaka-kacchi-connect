import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { isSupportedLocale, DEFAULT_LOCALE } from "@/lib/i18n";

/**
 * Pathless layout for every translated (non-English) locale - mirrors
 * routes/admin/_layout.tsx's own pattern (a static "admin/" directory with a
 * pathless `_layout` + dot-chained children), just with a dynamic "$locale/"
 * directory instead of a fixed "admin/" one. Matches "/de", "/de/about", etc.
 *
 * `beforeLoad` 404s anything that isn't a real, shipped locale (`/fr/...`,
 * a typo, or `/en/...` - English is unprefixed, see src/lib/i18n.ts) rather
 * than rendering a route for a language this site doesn't have.
 * `__root.tsx`'s own beforeLoad is what actually syncs i18next/`<html lang>`
 * from the URL - this one only gates which URLs are valid at all.
 */
export const Route = createFileRoute("/$locale/_layout")({
  beforeLoad: ({ params }) => {
    if (params.locale === DEFAULT_LOCALE || !isSupportedLocale(params.locale)) {
      throw notFound();
    }
  },
  component: () => <Outlet />,
});
