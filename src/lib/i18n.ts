import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/generated/en.json";
import de from "@/locales/generated/de.json";

/**
 * English is unprefixed ("/", "/order"); every other locale is prefixed
 * ("/de", "/de/order") - see src/routes/$locale.tsx. Adding a language is:
 * add a column to src/locales/translations.csv, add its entry here, and
 * add its font/dir override below if it needs one (RTL, non-Latin script).
 */
export const DEFAULT_LOCALE = "en";
export const SUPPORTED_LOCALES = ["de"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number] | typeof DEFAULT_LOCALE;

export function isSupportedLocale(value: string): value is Locale {
  return value === DEFAULT_LOCALE || (SUPPORTED_LOCALES as readonly string[]).includes(value);
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

// Resources are statically imported (not lazy-fetched per locale) because
// the whole site ships as a prerendered static export with no runtime
// server - there's nowhere to serve a "fetch the right locale JSON" request
// from at request time, and the total translation payload is a few KB. A
// future locale added just by extending SUPPORTED_LOCALES above and this
// resources map should reconsider lazy-loading if the language list grows
// large enough for that few-KB assumption to stop holding.
void i18next.use(initReactI18next).init({
  resources: { en: { translation: en }, de: { translation: de } },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false }, // React already escapes on render
  returnEmptyString: false,
});

export default i18next;
