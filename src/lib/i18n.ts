import i18next from "i18next";
import { initReactI18next } from "react-i18next";

/**
 * English is unprefixed ("/", "/order"); every other locale is prefixed
 * ("/de", "/de/order") - see src/routes/$locale.tsx. Adding a language is:
 * add a column to src/locales/translations.csv, add its entry here (the
 * SUPPORTED_LOCALES list AND the `loaders` map below), and add its font/dir
 * override if it needs one (RTL, non-Latin script).
 */
export const DEFAULT_LOCALE = "en";
export const SUPPORTED_LOCALES = ["de"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number] | typeof DEFAULT_LOCALE;

export function isSupportedLocale(value: string): value is Locale {
  return value === DEFAULT_LOCALE || (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** The locale a URL path belongs to: its first segment if that is a shipped
 * non-default locale ("/de", "/de/order"), else English. The single source of
 * truth for URL -> language, shared by the router (routes/__root.tsx) and by
 * the initial load below. */
export function localeFromPathname(pathname: string): Locale {
  const first = pathname.split("/")[1] ?? "";
  return (SUPPORTED_LOCALES as readonly string[]).includes(first)
    ? (first as Locale)
    : DEFAULT_LOCALE;
}

// Reserved for the first RTL locale (e.g. Arabic) - every other locale is
// "ltr" by omission. Kept as a lookup rather than a per-locale boolean field
// on some larger config object, since dir is the only thing __root.tsx's
// <html> tag needs from here.
const RTL_LOCALES = new Set<string>();

export function localeDir(locale: string): "ltr" | "rtl" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}

/**
 * Prefixes an unprefixed (English) app path with the given locale, e.g.
 * ("de", "/order") -> "/de/order", ("de", "/") -> "/de". English itself is
 * never prefixed. Used both by LocaleLink (client-side nav) and by each
 * page's head()/canonical() (server-side, per request) - kept in one place
 * so the two can never disagree about what a locale's URL looks like.
 */
export function localizePath(locale: Locale, path: string): string {
  if (locale === DEFAULT_LOCALE) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

// --- resources --------------------------------------------------------------
//
// Each language is its own lazily-loaded chunk (the JSON is generated from
// translations.csv by scripts/i18n/build-locales.mjs), so a visitor downloads
// only the language they are reading - not every language the site ships.
// That is the point of this block: with both bundled statically, English
// visitors paid for the German strings in the entry chunk and vice versa.
//
//  * The page's own language (taken from the URL) is awaited before this
//    module finishes evaluating, so hydration - which happens after - always
//    has it and matches the prerendered HTML. No flash of the wrong language.
//  * The prerender/SSR process has no "page", so it loads every language up
//    front and the right one is selected per request (routes/__root.tsx).
//  * Another language is fetched only when the visitor navigates to it
//    (routes/__root.tsx calls loadLocale() from beforeLoad, which also runs
//    for link-hover preloads, so the chunk is usually warm before the click).
//
// A blank cell in a non-English column is filled with the English text by the
// build script, so no language ever needs English loaded as a runtime
// fallback.
const loaders: Record<Locale, () => Promise<{ default: Record<string, unknown> }>> = {
  en: () => import("@/locales/generated/en.json"),
  de: () => import("@/locales/generated/de.json"),
};

const inflight = new Map<Locale, Promise<void>>();

/** Makes a language's strings available to i18next. Idempotent and safe to
 * call concurrently; resolves immediately once the language is loaded. Does
 * NOT switch the active language - that stays in syncLocale()
 * (routes/__root.tsx), see the rules in docs/localization.md. */
export function loadLocale(locale: Locale): Promise<void> {
  if (i18next.hasResourceBundle(locale, "translation")) return Promise.resolve();
  let pending = inflight.get(locale);
  if (!pending) {
    pending = loaders[locale]().then((module) => {
      i18next.addResourceBundle(locale, "translation", module.default, true, true);
    });
    // A failed fetch (offline, or a chunk replaced by a deploy under an open
    // tab) must be retryable on the next navigation, not cached forever.
    pending.catch(() => inflight.delete(locale));
    inflight.set(locale, pending);
  }
  return pending;
}

const isServer = typeof window === "undefined";
const initialLocale = isServer ? DEFAULT_LOCALE : localeFromPathname(window.location.pathname);

await i18next.use(initReactI18next).init({
  lng: initialLocale,
  fallbackLng: DEFAULT_LOCALE,
  resources: {},
  // Resources arrive after init() via addResourceBundle; without this i18next
  // treats an empty `resources` as "nothing will ever load" and warns.
  partialBundledLanguages: true,
  interpolation: { escapeValue: false }, // React already escapes on render
  returnEmptyString: false,
});

const toLoad: Locale[] = isServer ? [DEFAULT_LOCALE, ...SUPPORTED_LOCALES] : [initialLocale];
await Promise.all(toLoad.map((locale) => loadLocale(locale)));

export default i18next;
