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
 */
export function canonical(routePath: string): string {
  return routePath === "/" ? `${SITE_URL}/` : `${SITE_URL}${routePath}/`;
}
