import i18n, { type Locale } from "@/lib/i18n";
import { canonical, SITE_URL } from "@/lib/seo";
import { site } from "@/content/site";
import logo from "@/assets/photos/logo.webp";

/**
 * schema.org JSON-LD for the home page (Google's recommended structured-data
 * format - it is read from a <script type="application/ld+json">, separate
 * from the visible markup, so it cannot drift into the design).
 *
 * Only facts that are true everywhere on this site are stated: name, url,
 * logo, description (translated), the social profiles, the contact email,
 * "Berlin" as the area served, the cuisine, and a pointer to the order page
 * as the menu. Deliberately NOT included, because it would have to be
 * invented or goes stale:
 *   - address / geo / openingHours: this is a delivery-only kitchen with no
 *     public shop, and the weekly order window is not a fixed opening time.
 *     (Google's LocalBusiness rich result needs an address; without one the
 *     markup is still valid and still feeds the knowledge panel, it just
 *     does not qualify for that rich result.)
 *   - menu items and prices: prices live in the backend (GET /v1/menu), not
 *     in anything the static build can see. `hasMenu` therefore links to the
 *     order page - which IS the menu - instead of copying items that would go
 *     stale the moment a price changes.
 */
export function homeJsonLd(locale: Locale) {
  const t = i18n.getFixedT(locale);
  const sameAs = Object.values(site.socials);
  const logoUrl = new URL(logo, SITE_URL).toString();

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: site.name,
        url: `${SITE_URL}/`,
        logo: logoUrl,
        email: site.email,
        sameAs,
      },
      {
        "@type": "FoodEstablishment",
        "@id": `${SITE_URL}/#business`,
        name: site.name,
        url: canonical("/", locale),
        description: t("seo.home.description"),
        inLanguage: locale,
        image: `${SITE_URL}/og-image.jpg`,
        logo: logoUrl,
        email: site.email,
        servesCuisine: ["Bangladeshi", "Biryani"],
        areaServed: {
          "@type": "City",
          name: "Berlin",
          containedInPlace: { "@type": "Country", name: "Germany" },
        },
        hasMenu: canonical("/order", locale),
        sameAs,
        parentOrganization: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };
}
