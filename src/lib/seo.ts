import i18n, { DEFAULT_LOCALE, SUPPORTED_LOCALES, localizePath, type Locale } from "@/lib/i18n";

/**
 * Canonical URL helpers. One place so canonical tags, og:url and the sitemap
 * generated in scripts/build-static.mjs can never disagree with each other.
 */

/** Apex, not www - www 301s here (see public/.htaccess). */
export const SITE_URL = "https://dhakakacchi.com";

/**
 * Absolute URL for a route, in the slash-terminated form.
 *
 * The static export writes every non-root route as `<route>/index.html`, and
 * Hostinger's LiteSpeed then 301s `/about` -> `/about/` via DirectorySlash.
 * That redirect is the one Google actually lands on, so emitting the
 * slash-less form in a canonical or a sitemap would send every crawl through
 * a pointless redirect hop.
 *
 * Kept byte-compatible with canonicalUrl() in scripts/build-static.mjs.
 *
 * `locale` defaults to English (unprefixed) - pass it explicitly for every
 * translated page's own canonical/hreflang tags (see ALL_LOCALES below).
 */
export function canonical(routePath: string, locale: Locale = DEFAULT_LOCALE): string {
  const path = localizePath(locale, routePath);
  return path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}/`;
}

/** Every locale this site ships, English first. Used to emit one <link
 * rel="alternate" hrefLang="..."> per language on every translated page. */
export const ALL_LOCALES: Locale[] = [DEFAULT_LOCALE, ...SUPPORTED_LOCALES];

/**
 * The full set of <link> tags a translated page's head() should emit for a
 * given untranslated route path: this locale's canonical, one hreflang
 * alternate per shipped locale, and x-default pointing at English (Google's
 * recommended target for a language-neutral fallback).
 */
export function localeLinks(routePath: string, locale: Locale) {
  return [
    { rel: "canonical", href: canonical(routePath, locale) },
    ...ALL_LOCALES.map((loc) => ({
      rel: "alternate",
      hrefLang: loc,
      href: canonical(routePath, loc),
    })),
    { rel: "alternate", hrefLang: "x-default", href: canonical(routePath, DEFAULT_LOCALE) },
  ];
}

/**
 * One page's full head() output, from its `seo.<page>.*` translation keys -
 * every leaf route (routes/about.tsx, routes/$locale/_layout.about.tsx, ...)
 * calls this instead of hand-writing meta/links so the English and German
 * variant of a page can never drift out of sync in shape, only in text.
 * Uses getFixedT(locale) rather than the reactive `t` from a hook - head()
 * is a plain function, not a component, and the locale it must describe is
 * this ROUTE's own (from its file), not whatever i18next's current language
 * happens to be at the moment head() runs.
 *
 * Everything that varies by language lives here, not in __root.tsx's
 * English-only floor: og:locale (plus og:locale:alternate for every other
 * shipped language, which is how Facebook/WhatsApp find the other variants),
 * the translated og:image:alt, and twitter:title/description (mirroring the
 * og:* text, since not every client falls back from twitter:* to og:*).
 * `options.jsonLd` adds a structured-data block (see lib/structuredData.ts).
 */
export function pageHead(
  routePath: string,
  locale: Locale,
  seoKey: string,
  options: { jsonLd?: unknown } = {},
) {
  const t = i18n.getFixedT(locale);
  const ogTitle = t(`${seoKey}.ogTitle`);
  const ogDescription = t(`${seoKey}.ogDescription`);
  const imageAlt = t("seo.ogImageAlt");
  return {
    meta: [
      { title: t(`${seoKey}.title`) },
      { name: "description", content: t(`${seoKey}.description`) },
      { property: "og:title", content: ogTitle },
      { property: "og:description", content: ogDescription },
      { property: "og:url", content: canonical(routePath, locale) },
      { property: "og:locale", content: OG_LOCALE[locale] },
      ...ALL_LOCALES.filter((other) => other !== locale).map((other) => ({
        property: "og:locale:alternate",
        content: OG_LOCALE[other],
      })),
      { property: "og:image:alt", content: imageAlt },
      { name: "twitter:title", content: ogTitle },
      { name: "twitter:description", content: ogDescription },
      { name: "twitter:image:alt", content: imageAlt },
    ],
    links: localeLinks(routePath, locale),
    ...(options.jsonLd ? { scripts: [jsonLdScript(options.jsonLd)] } : {}),
  };
}

/** Open Graph's locale codes are language_TERRITORY, not the bare tag the URL
 * uses. Typed as a Record so adding a locale to SUPPORTED_LOCALES fails the
 * typecheck until its og:locale is filled in. */
const OG_LOCALE: Record<Locale, string> = { en: "en_US", de: "de_DE" };

/** A JSON-LD block as the `scripts` entry TanStack Router renders into
 * <head>. `<` is escaped so a string value can never contain `</script>`. */
export function jsonLdScript(data: unknown) {
  return {
    type: "application/ld+json",
    children: JSON.stringify(data).replace(/</g, "\\u003c"),
  };
}
