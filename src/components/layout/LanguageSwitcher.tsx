import { Link, useLocation } from "@tanstack/react-router";
import { ALL_LOCALES } from "@/lib/seo";
import { DEFAULT_LOCALE, localizePath, type Locale } from "@/lib/i18n";

const LABELS: Record<Locale, string> = { en: "EN", de: "DE" };

/** Strips any existing locale prefix off the current pathname, so switching
 * FROM German TO English (or to a third locale later) doesn't double-prefix
 * it - "/de/order" -> "/order", not "/de/de/order" or "/order" losing the
 * "/de/" it needs to strip first. */
function unprefixedPath(pathname: string): string {
  for (const locale of ALL_LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;
    if (pathname === `/${locale}`) return "/";
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(`/${locale}`.length);
  }
  return pathname;
}

/** Links to the SAME page in each other language, preserving the current
 * path - not a dropdown to the homepage. Lives in the header/footer chrome,
 * so it's on every customer-facing page. */
export function LanguageSwitcher() {
  const { pathname } = useLocation();
  const bare = unprefixedPath(pathname);

  return (
    <div className="flex items-center gap-1 font-sans text-[0.68rem] uppercase tracking-[0.15em]">
      {ALL_LOCALES.map((locale, i) => (
        <span key={locale} className="flex items-center gap-1">
          {i > 0 && (
            <span className="text-line" aria-hidden>
              /
            </span>
          )}
          <Link
            to={localizePath(locale, bare) as never}
            activeOptions={{ exact: true }}
            activeProps={{ className: "text-gold" }}
            inactiveProps={{ className: "text-muted-warm hover:text-gold" }}
            className="transition-colors"
          >
            {LABELS[locale]}
          </Link>
        </span>
      ))}
    </div>
  );
}
