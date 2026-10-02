import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "@/pages/HomePage";
import { DEFAULT_LOCALE } from "@/lib/i18n";
import { pageHead } from "@/lib/seo";
import { homeJsonLd } from "@/lib/structuredData";

export const Route = createFileRoute("/")({
  head: () => pageHead("/", DEFAULT_LOCALE, "seo.home", { jsonLd: homeJsonLd(DEFAULT_LOCALE) }),
  component: HomePage,
});
