import { expect, test } from "bun:test";
import i18n from "@/lib/i18n";
import { pageHead } from "@/lib/seo";
import { homeJsonLd } from "@/lib/structuredData";
import { site } from "@/content/site";

type Meta = Record<string, string>;
const metaOf = (head: ReturnType<typeof pageHead>, key: string, value: string) =>
  (head.meta as unknown as Meta[]).filter((m) => m[key] === value);

test("English page: og:locale en_US, alternate de_DE, English alt + twitter text", () => {
  const head = pageHead("/", "en", "seo.home");
  expect(metaOf(head, "property", "og:locale")[0].content).toBe("en_US");
  expect(metaOf(head, "property", "og:locale:alternate").map((m) => m.content)).toEqual(["de_DE"]);
  expect(metaOf(head, "property", "og:image:alt")[0].content).toBe(
    i18n.getFixedT("en")("seo.ogImageAlt"),
  );
  expect(metaOf(head, "name", "twitter:title")[0].content).toBe(
    metaOf(head, "property", "og:title")[0].content,
  );
  expect(metaOf(head, "name", "twitter:description")[0].content).toBe(
    metaOf(head, "property", "og:description")[0].content,
  );
});

test("German page: og:locale de_DE, alternate en_US, translated og:image:alt", () => {
  const head = pageHead("/", "de", "seo.home");
  expect(metaOf(head, "property", "og:locale")[0].content).toBe("de_DE");
  expect(metaOf(head, "property", "og:locale:alternate").map((m) => m.content)).toEqual(["en_US"]);
  const alt = metaOf(head, "property", "og:image:alt")[0].content;
  expect(alt).toBe(i18n.getFixedT("de")("seo.ogImageAlt"));
  expect(alt).not.toBe(i18n.getFixedT("en")("seo.ogImageAlt"));
});

test("home JSON-LD: uses the translated description and the site's real profiles, invents nothing", () => {
  for (const locale of ["en", "de"] as const) {
    const ld = homeJsonLd(locale);
    const business = ld["@graph"].find((n) => n["@type"] === "FoodEstablishment")!;
    const org = ld["@graph"].find((n) => n["@type"] === "Organization")!;
    expect(business.description).toBe(i18n.getFixedT(locale)("seo.home.description"));
    expect(org.sameAs).toEqual([site.socials.instagram, site.socials.facebook]);
    expect(business.areaServed?.name).toBe("Berlin");
    // Prices live in the backend; nothing price-shaped may appear statically.
    const text = JSON.stringify(ld);
    expect(text).not.toMatch(/price|Offer|openingHours|streetAddress/i);
  }
});

test("pageHead emits the JSON-LD script only when asked, with < escaped", () => {
  expect(pageHead("/", "en", "seo.home")).not.toHaveProperty("scripts");
  const head = pageHead("/", "en", "seo.home", { jsonLd: { name: "</script><b>" } });
  const script = head.scripts![0];
  expect(script.type).toBe("application/ld+json");
  expect(script.children).not.toContain("<");
  expect(JSON.parse(script.children).name).toBe("</script><b>");
});
